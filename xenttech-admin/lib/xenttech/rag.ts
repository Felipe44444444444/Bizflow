import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  const paragraphs = normalized.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0)

  // Paragraph-aware chunking
  if (paragraphs.length > 1) {
    const chunks: string[] = []
    let current = ''
    for (const para of paragraphs) {
      if (current.length > 0 && current.length + para.length + 2 > chunkSize) {
        chunks.push(current.trim())
        current = current.length > overlap ? current.slice(-overlap) + '\n\n' + para : para
      } else {
        current = current.length > 0 ? current + '\n\n' + para : para
      }
    }
    if (current.trim().length > 20) chunks.push(current.trim())
    if (chunks.length > 0) return chunks
  }

  // Fallback: character-based chunking
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 20) chunks.push(chunk)
    start += chunkSize - overlap
  }
  return chunks
}

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: text.slice(0, 8191),
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI embeddings failed: ${res.status} ${errText}`)
  }
  const json = await res.json()
  return json.data[0].embedding as number[]
}

export async function processDocument(docId: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    const supabase = db()
    await supabase
      .from('xenttech_knowledge_docs')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', docId)
    console.error('processDocument: OPENAI_API_KEY not configured')
    return
  }

  const supabase = db()
  const { data: doc } = await supabase
    .from('xenttech_knowledge_docs')
    .select('*')
    .eq('id', docId)
    .single()

  if (!doc) throw new Error(`Doc ${docId} not found`)

  await supabase
    .from('xenttech_knowledge_docs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', docId)

  try {
    await supabase.from('xenttech_knowledge_chunks').delete().eq('doc_id', docId)

    const chunks = chunkText(doc.content, doc.chunk_size ?? 500)

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i])
      await supabase.from('xenttech_knowledge_chunks').insert({
        doc_id:      docId,
        agent_id:    doc.agent_id,
        chunk_index: i,
        content:     chunks[i],
        embedding,
        metadata: {
          title:        doc.title,
          source:       doc.source_url ?? doc.source_type,
          chunk_index:  i,
          total_chunks: chunks.length,
        },
      })
    }

    await supabase
      .from('xenttech_knowledge_docs')
      .update({
        status:         'ready',
        last_synced_at: new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      })
      .eq('id', docId)
  } catch (err) {
    await supabase
      .from('xenttech_knowledge_docs')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', docId)
    throw err
  }
}

export async function searchKnowledge(agentId: string, query: string, limit = 5): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return ''

  try {
    const embedding = await generateEmbedding(query)
    const supabase = db()

    const { data: chunks } = await supabase.rpc('search_knowledge', {
      query_embedding: embedding,
      agent_id_filter: agentId,
      match_count:     limit,
      match_threshold: 0.7,
    })

    if (!chunks?.length) return ''

    const formatted = (chunks as Array<{ content: string; metadata: { title?: string }; similarity: number }>)
      .map((c, i) => `[${i + 1}] ${c.content}\nFuente: ${c.metadata?.title ?? 'Documento'}`)
      .join('\n\n')

    return `CONOCIMIENTO RELEVANTE:\n\n${formatted}`
  } catch (err) {
    console.error('searchKnowledge error:', err)
    return ''
  }
}

function formatRow(tableName: string, row: Record<string, unknown>): string {
  const get = (k: string): string => {
    const v = row[k]
    if (v === null || v === undefined) return ''
    return (typeof v === 'object' ? JSON.stringify(v) : String(v)).trim()
  }

  const parts: string[] = []

  if (tableName === 'clients') {
    if (get('name'))    parts.push(`Cliente: ${get('name')}`)
    if (get('company')) parts.push(`Empresa: ${get('company')}`)
    if (get('plan'))    parts.push(`Plan: ${get('plan')}`)
    if (get('status'))  parts.push(`Estado: ${get('status')}`)
    if (get('email'))   parts.push(`Email: ${get('email')}`)
  } else if (tableName === 'campaigns') {
    if (get('campaign_name')) parts.push(`Campaña: ${get('campaign_name')}`)
    if (get('platform'))      parts.push(`Plataforma: ${get('platform')}`)
    if (get('status'))        parts.push(`Estado: ${get('status')}`)
    if (get('budget'))        parts.push(`Presupuesto: ${get('budget')}`)
  } else if (tableName === 'designs') {
    if (get('design_type')) parts.push(`Tipo: ${get('design_type')}`)
    if (get('status'))      parts.push(`Estado: ${get('status')}`)
    if (get('brief'))       parts.push(`Brief: ${get('brief').slice(0, 300)}`)
  } else if (tableName === 'onboarding_documents') {
    if (get('step_name')) parts.push(`Documento: ${get('step_name')}`)
    if (get('content'))   parts.push(`Contenido: ${get('content').slice(0, 500)}`)
  }

  if (parts.length > 0) return parts.join(' | ')

  return Object.entries(row)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim().length > 0)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' | ')
}

export async function syncFromSupabaseTable(docId: string): Promise<void> {
  const supabase = db()

  const { data: doc } = await supabase
    .from('xenttech_knowledge_docs')
    .select('*')
    .eq('id', docId)
    .single()

  if (!doc?.supabase_table) throw new Error('No supabase_table specified on doc')

  let query = supabase.from(doc.supabase_table).select('*')
  const filter = doc.supabase_filter as Record<string, string> | null
  if (filter && typeof filter === 'object') {
    for (const [key, val] of Object.entries(filter)) {
      query = query.eq(key, val)
    }
  }

  const { data: rows, error } = await query
  if (error) throw new Error(`Failed to query ${doc.supabase_table}: ${error.message}`)

  const content = (rows ?? [])
    .map((row: Record<string, unknown>) => formatRow(doc.supabase_table!, row))
    .filter(line => line.length > 5)
    .join('\n\n')

  await supabase
    .from('xenttech_knowledge_docs')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', docId)

  await processDocument(docId)
}
