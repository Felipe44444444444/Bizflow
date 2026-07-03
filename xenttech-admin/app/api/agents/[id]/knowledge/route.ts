import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { processDocument } from '@/lib/xenttech/rag'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const supabase = db()

  const [agentRes, docsRes, connectionsRes] = await Promise.all([
    supabase.from('xenttech_agents').select('id,name').eq('id', agentId).maybeSingle(),
    supabase
      .from('xenttech_knowledge_docs')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('xenttech_supabase_connections')
      .select('id,project_name,supabase_url,project_ref,is_xenttech_auto,connected_at')
      .eq('agent_id', agentId)
      .order('connected_at', { ascending: false }),
  ])

  const docs = docsRes.data ?? []

  // Fetch chunk counts in bulk
  let chunkCounts: Record<string, number> = {}
  if (docs.length > 0) {
    const ids = docs.map(d => d.id)
    const { data: chunks } = await supabase
      .from('xenttech_knowledge_chunks')
      .select('doc_id')
      .in('doc_id', ids)
    for (const c of chunks ?? []) {
      chunkCounts[c.doc_id] = (chunkCounts[c.doc_id] ?? 0) + 1
    }
  }

  const docsWithCounts = docs.map(d => ({ ...d, chunk_count: chunkCounts[d.id] ?? 0 }))

  return NextResponse.json({
    agent:       agentRes.data ?? null,
    docs:        docsWithCounts,
    connections: connectionsRes.data ?? [],
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const body = await req.json().catch(() => null)
  const { title, content, source_type = 'manual', source_url } = body ?? {}

  if (!title || !content) {
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 })
  }

  const supabase = db()
  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('client_id')
    .eq('id', agentId)
    .maybeSingle()

  const { data: doc, error } = await supabase
    .from('xenttech_knowledge_docs')
    .insert({
      agent_id:   agentId,
      client_id:  agent?.client_id ?? null,
      title,
      content,
      source_type,
      source_url: source_url ?? null,
      status:     'pending',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  waitUntil(processDocument(doc.id).catch(err => console.error('processDocument error:', err)))

  return NextResponse.json({ id: doc.id, status: 'pending' })
}
