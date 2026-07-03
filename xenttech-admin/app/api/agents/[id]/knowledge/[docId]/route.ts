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

// DELETE — remove a knowledge document (chunks cascade)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const { docId } = params
  const supabase = db()

  const { error } = await supabase
    .from('xenttech_knowledge_docs')
    .delete()
    .eq('id', docId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// POST — re-process an existing document (re-chunk + re-embed)
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const { docId } = params
  const supabase = db()

  await supabase
    .from('xenttech_knowledge_docs')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', docId)

  await supabase.from('xenttech_knowledge_chunks').delete().eq('doc_id', docId)

  waitUntil(processDocument(docId).catch(err => console.error('reprocess error:', err)))

  return NextResponse.json({ success: true, status: 'pending' })
}
