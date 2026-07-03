import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = db()

  const { data: clip } = await supabase
    .from('xenttech_clips_ai')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (!clip)           return NextResponse.json({ error: 'Clip no encontrado' },       { status: 404 })
  if (!clip.video_url) return NextResponse.json({ error: 'Video no listo todavía' },   { status: 400 })
  if (clip.status !== 'ready') return NextResponse.json({ error: 'Clip no está listo' }, { status: 400 })

  const { data: channel } = await supabase
    .from('xenttech_channels')
    .select('page_id, page_access_token')
    .eq('agent_id', clip.agent_id)
    .eq('channel_type', 'facebook')
    .eq('is_connected', true)
    .maybeSingle()

  if (!channel) {
    return NextResponse.json({ error: 'No hay canal Facebook conectado para este agente' }, { status: 400 })
  }

  const fbRes = await fetch(
    `https://graph.facebook.com/v22.0/${channel.page_id}/videos`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_url:     clip.video_url,
        description:  clip.script ?? clip.topic,
        published:    true,
        access_token: channel.page_access_token,
      }),
    }
  )

  const fbData = await fbRes.json() as Record<string, unknown>
  if (!fbRes.ok) {
    return NextResponse.json(
      { error: String((fbData.error as Record<string, unknown>)?.message ?? fbRes.status) },
      { status: 500 }
    )
  }

  await supabase
    .from('xenttech_clips_ai')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', params.id)

  return NextResponse.json({ ok: true, post_id: fbData.id })
}
