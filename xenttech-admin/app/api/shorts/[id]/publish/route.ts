import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = db()

  const { data: short } = await supabase
    .from('xenttech_shorts')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (!short) return NextResponse.json({ error: 'Short no encontrado' }, { status: 404 })
  if (short.status !== 'ready') return NextResponse.json({ error: 'Solo se pueden publicar shorts listos' }, { status: 400 })
  if (!short.final_video_url) return NextResponse.json({ error: 'Sin video final' }, { status: 400 })

  // Get agent's Facebook page token
  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('facebook_page_id, facebook_page_token')
    .eq('id', short.agent_id)
    .maybeSingle()

  if (!agent?.facebook_page_id || !agent?.facebook_page_token) {
    return NextResponse.json({ error: 'El agente no tiene página de Facebook configurada' }, { status: 400 })
  }

  // Upload video to Facebook page (Reels endpoint)
  try {
    const uploadRes = await fetch(
      `https://graph.facebook.com/v19.0/${agent.facebook_page_id}/videos`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url:     short.final_video_url,
          description:  short.hook ?? '',
          access_token: agent.facebook_page_token,
          published:    true,
        }),
      },
    )

    const fbData = await uploadRes.json() as { id?: string; error?: { message: string } }
    if (!uploadRes.ok || fbData.error) {
      throw new Error(fbData.error?.message ?? 'Facebook API error')
    }

    await supabase.from('xenttech_shorts').update({
      status:       'published',
      published_to: [...(short.published_to ?? []), 'facebook'],
    }).eq('id', params.id)

    return NextResponse.json({ ok: true, facebook_video_id: fbData.id })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
