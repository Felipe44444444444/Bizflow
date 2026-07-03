import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { encryptKey } from '@/lib/xenttech/encryption'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function resolveColType(prop: { type?: string; format?: string }): string {
  const { type, format } = prop
  if (format === 'uuid') return 'uuid'
  if (format?.startsWith('timestamp')) return 'timestamp'
  if (format === 'bigint' || format === 'integer') return 'int'
  if (format === 'numeric' || format === 'double precision') return 'float'
  if (type === 'boolean') return 'bool'
  if (type === 'object') return 'json'
  if (type === 'array') return 'array'
  if (type === 'integer') return 'int'
  if (type === 'number') return 'float'
  return 'text'
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const body = await req.json().catch(() => null)
  const { project_name, supabase_url, service_role_key } = body ?? {}

  const isAuto   = service_role_key === 'XENTTECH_AUTO'
  const actualUrl = isAuto ? process.env.NEXT_PUBLIC_SUPABASE_URL! : (supabase_url as string)
  const actualKey = isAuto ? process.env.SUPABASE_SERVICE_ROLE_KEY! : (service_role_key as string)
  const actualName = isAuto ? 'XENTTECH Brain' : (project_name as string)

  if (!actualUrl || !actualKey) {
    return NextResponse.json({ error: 'supabase_url y service_role_key son requeridos' }, { status: 400 })
  }

  // 1. Validate credentials + fetch PostgREST OpenAPI spec
  let spec: Record<string, unknown>
  try {
    const res = await fetch(`${actualUrl}/rest/v1/`, {
      headers: { 'apikey': actualKey, 'Authorization': `Bearer ${actualKey}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    spec = await res.json()
  } catch (err) {
    return NextResponse.json(
      { error: `Credenciales inválidas. Verifica la URL y la Service Role Key. (${(err as Error).message})` },
      { status: 422 }
    )
  }

  // 2. Parse table names + column definitions
  type PropDef  = { type?: string; format?: string }
  type DefEntry = { properties?: Record<string, PropDef> }

  const paths      = (spec.paths ?? {}) as Record<string, unknown>
  const defs       = (spec.definitions ?? {}) as Record<string, DefEntry>
  const tableNames = Object.keys(paths)
    .filter(p => !p.startsWith('/rpc/') && p.length > 1)
    .map(p => p.slice(1))
    .filter(Boolean)

  // 3. Row counts in parallel (estimated — fast even for large tables)
  const extClient = createClient(actualUrl, actualKey, { auth: { persistSession: false } })
  const countRes  = await Promise.allSettled(
    tableNames.map(async name => {
      const { count } = await extClient.from(name).select('*', { count: 'estimated', head: true })
      return { name, count: count ?? 0 }
    })
  )
  const countMap: Record<string, number> = {}
  for (const r of countRes) {
    if (r.status === 'fulfilled') countMap[r.value.name] = r.value.count
  }

  const tables = tableNames
    .map(name => ({
      name,
      row_count: countMap[name] ?? 0,
      columns: Object.entries(defs[name]?.properties ?? {}).map(([n, p]) => ({
        name: n,
        type: resolveColType(p),
      })),
      description: `${countMap[name] ?? 0} filas`,
    }))
    .sort((a, b) => b.row_count - a.row_count)

  // 4. Encrypt key (or mark as auto)
  let encryptedKey: string
  if (isAuto) {
    encryptedKey = 'XENTTECH_AUTO'
  } else {
    if (!process.env.ENCRYPTION_KEY) {
      return NextResponse.json(
        { error: 'ENCRYPTION_KEY no está configurado en el servidor' },
        { status: 503 }
      )
    }
    try { encryptedKey = encryptKey(service_role_key) }
    catch (err) {
      return NextResponse.json({ error: `Error de cifrado: ${(err as Error).message}` }, { status: 500 })
    }
  }

  // 5. Upsert connection record
  const projectRef = actualUrl.match(/\/\/([^.]+)\./)?.[1] ?? ''
  const supabase   = db()

  const { data: conn, error: connErr } = await supabase
    .from('xenttech_supabase_connections')
    .upsert(
      {
        agent_id:                    agentId,
        project_name:                actualName,
        supabase_url:                actualUrl,
        project_ref:                 projectRef,
        service_role_key_encrypted:  encryptedKey,
        is_xenttech_auto:            isAuto,
        connected_at:                new Date().toISOString(),
        updated_at:                  new Date().toISOString(),
      },
      { onConflict: 'agent_id,supabase_url' }
    )
    .select('id')
    .single()

  if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 })

  return NextResponse.json({ connection_id: conn.id, project_name: actualName, tables })
}
