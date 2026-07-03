import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { processDocument, syncFromSupabaseTable } from '@/lib/xenttech/rag'
import { decryptKey } from '@/lib/xenttech/encryption'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Skip columns that carry no semantic value for embeddings
const SKIP_RE = /^(id|.*_id|.*_at|created_at|updated_at|deleted_at|password|token|secret|key|hash|.*_hash|.*_token|.*_secret|.*_key)$/i

function isContentCol(k: string, v: unknown): boolean {
  if (SKIP_RE.test(k)) return false
  if (v === null || v === undefined) return false
  const s = String(v).trim()
  if (s.length === 0) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return false
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return false
  return true
}

function formatRowExternal(row: Record<string, unknown>, cols?: string[]): string {
  const entries: [string, unknown][] = cols?.length
    ? cols.map(k => [k, row[k]])
    : Object.entries(row).filter(([k, v]) => isContentCol(k, v))
  return entries
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim().length > 0)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('\n')
}

async function runExternalSync(
  docId: string,
  url: string,
  key: string,
  tableName: string,
  filter: Record<string, unknown> | undefined,
  cols: string[] | undefined
) {
  const supabase = db()
  try {
    const ext = createClient(url, key, { auth: { persistSession: false } })
    const sel = cols?.length ? cols.join(',') : '*'
    let q = ext.from(tableName).select(sel)
    if (filter) for (const [k, v] of Object.entries(filter)) q = q.eq(k, v as string)
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)

    const content = (rows ?? [])
      .map(row => formatRowExternal(row as unknown as Record<string, unknown>, cols))
      .filter(b => b.trim().length > 10)
      .join('\n\n')

    await supabase
      .from('xenttech_knowledge_docs')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', docId)

    await processDocument(docId)
  } catch (err) {
    await supabase
      .from('xenttech_knowledge_docs')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', docId)
    throw err
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const body = await req.json().catch(() => null)

  const {
    connection_id,
    table_name,
    columns_to_include,
    tableName: legacyName,
    use_xenttech_credentials: useXenttech = false,
    filter,
  } = body ?? {}

  const supabase = db()

  // ── Connection-based flow (new) ───────────────────────────────────────────

  if (connection_id) {
    const tbl = table_name ?? legacyName
    if (!tbl) return NextResponse.json({ error: 'table_name is required' }, { status: 400 })

    const { data: conn } = await supabase
      .from('xenttech_supabase_connections')
      .select('*')
      .eq('id', connection_id)
      .maybeSingle()

    if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

    const url = conn.supabase_url as string
    let key: string
    if (conn.is_xenttech_auto) {
      key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    } else {
      try { key = decryptKey(conn.service_role_key_encrypted as string) }
      catch { return NextResponse.json({ error: 'Failed to decrypt credentials' }, { status: 500 }) }
    }

    const { data: agent } = await supabase
      .from('xenttech_agents').select('client_id').eq('id', agentId).maybeSingle()

    // Upsert — reuse existing doc for the same connection+table
    const { data: existing } = await supabase
      .from('xenttech_knowledge_docs')
      .select('id')
      .eq('agent_id', agentId)
      .eq('connection_id', connection_id)
      .eq('supabase_table', tbl)
      .maybeSingle()

    let docId: string

    if (existing) {
      await supabase
        .from('xenttech_knowledge_docs')
        .update({ supabase_filter: filter ?? null, status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      docId = existing.id
    } else {
      const { data: doc, error: docErr } = await supabase
        .from('xenttech_knowledge_docs')
        .insert({
          agent_id:        agentId,
          client_id:       agent?.client_id ?? null,
          connection_id,
          title:           `${conn.project_name}: ${tbl}`,
          content:         '',
          source_type:     'supabase_table',
          supabase_table:  tbl,
          supabase_filter: filter ?? null,
          status:          'pending',
        })
        .select('id')
        .single()
      if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })
      docId = doc.id
    }

    await supabase.from('xenttech_knowledge_chunks').delete().eq('doc_id', docId)

    waitUntil(
      runExternalSync(docId, url, key, tbl, filter, columns_to_include)
        .catch(err => console.error(`runExternalSync ${tbl}:`, err))
    )

    return NextResponse.json({ id: docId, status: 'pending' })
  }

  // ── Legacy flow (tableName without connection_id) ─────────────────────────

  const tableName = table_name ?? legacyName
  if (!tableName) return NextResponse.json({ error: 'tableName is required' }, { status: 400 })

  const { data: agent } = await supabase
    .from('xenttech_agents').select('client_id').eq('id', agentId).maybeSingle()

  const { data: existing } = await supabase
    .from('xenttech_knowledge_docs')
    .select('id')
    .eq('agent_id', agentId)
    .eq('source_type', 'supabase_table')
    .eq('supabase_table', tableName)
    .is('connection_id', null)
    .maybeSingle()

  let docId: string

  if (existing) {
    await supabase
      .from('xenttech_knowledge_docs')
      .update({ supabase_filter: filter ?? null, status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    docId = existing.id
  } else {
    const { data: doc, error } = await supabase
      .from('xenttech_knowledge_docs')
      .insert({
        agent_id:        agentId,
        client_id:       agent?.client_id ?? null,
        title:           useXenttech ? `Tabla: ${tableName} (XENTTECH Brain)` : `Tabla: ${tableName}`,
        content:         '',
        source_type:     'supabase_table',
        supabase_table:  tableName,
        supabase_filter: filter ?? null,
        status:          'pending',
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    docId = doc.id
  }

  await supabase.from('xenttech_knowledge_chunks').delete().eq('doc_id', docId)
  waitUntil(syncFromSupabaseTable(docId).catch(err => console.error('syncFromSupabaseTable:', err)))

  return NextResponse.json({ id: docId, status: 'pending' })
}
