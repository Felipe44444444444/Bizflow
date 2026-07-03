import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// DELETE — disconnect a Supabase project from an agent
// Deletes all associated knowledge docs (chunks cascade via FK), then the connection.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; connId: string } }
) {
  const { connId } = params
  const supabase = db()

  // Docs FK is ON DELETE SET NULL, so we must delete them explicitly first
  await supabase.from('xenttech_knowledge_docs').delete().eq('connection_id', connId)

  const { error } = await supabase
    .from('xenttech_supabase_connections')
    .delete()
    .eq('id', connId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
