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

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const body = await req.json().catch(() => null)
  const { url } = body ?? {}

  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  let content: string
  let title: string

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XenttechBot/1.0)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    title = titleMatch?.[1]?.trim() ?? url

    content = stripHtml(html)
    if (content.length < 50) throw new Error('Página vacía o sin contenido extraíble')
    content = content.slice(0, 30_000)
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudo obtener la URL: ${(err as Error).message}` },
      { status: 422 }
    )
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
      source_type: 'url',
      source_url:  url,
      status:     'pending',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  waitUntil(processDocument(doc.id).catch(err => console.error('scrape processDocument error:', err)))

  return NextResponse.json({ id: doc.id, title, status: 'pending' })
}
