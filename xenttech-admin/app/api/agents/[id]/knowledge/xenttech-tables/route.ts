import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // 1. Fetch PostgREST OpenAPI spec to discover tables + columns
  let spec: Record<string, unknown>
  try {
    const specRes = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
    })
    if (!specRes.ok) throw new Error(`spec fetch failed: ${specRes.status}`)
    spec = await specRes.json()
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch schema: ${(err as Error).message}` }, { status: 500 })
  }

  // 2. Extract table names from /paths (skip /rpc/* endpoints)
  const paths = (spec.paths ?? {}) as Record<string, unknown>
  const tableNames = Object.keys(paths)
    .filter(p => !p.startsWith('/rpc/') && p.length > 1)
    .map(p => p.slice(1))
    .filter(name => name.length > 0)

  // 3. Extract column definitions
  type PropDef = { type?: string; format?: string; description?: string }
  type DefEntry = { type?: string; properties?: Record<string, PropDef> }
  const definitions = (spec.definitions ?? {}) as Record<string, DefEntry>

  // 4. Get row counts in parallel (estimated — fast for any size)
  const supabase = db()
  const countResults = await Promise.allSettled(
    tableNames.map(async name => {
      const { count, error } = await supabase
        .from(name)
        .select('*', { count: 'estimated', head: true })
      return { name, count: error ? 0 : (count ?? 0) }
    })
  )

  const countMap: Record<string, number> = {}
  for (const r of countResults) {
    if (r.status === 'fulfilled') countMap[r.value.name] = r.value.count
  }

  // 5. Build response
  const tables = tableNames
    .map(name => {
      const def = definitions[name]
      const props = def?.properties ?? {}
      const columns = Object.entries(props).map(([colName, prop]) => ({
        name: colName,
        type: resolveColType(prop),
      }))
      const rowCount = countMap[name] ?? 0
      return {
        name,
        row_count: rowCount,
        columns,
        description: `Tabla ${name} — ${rowCount} ${rowCount === 1 ? 'fila' : 'filas'}`,
      }
    })
    .sort((a, b) => b.row_count - a.row_count)

  return NextResponse.json({
    tables,
    project_url: supabaseUrl,
    auto_connected: true,
  })
}
