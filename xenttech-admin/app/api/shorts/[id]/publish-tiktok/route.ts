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

  const { data: short, error } = await supabase
    .from('xenttech_shorts')
    .select('id, hook, final_video_url, status, published_to')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !short) return NextResponse.json({ error: 'Short no encontrado' }, { status: 404 })
  if (short.status !== 'ready' && short.status !== 'published') {
    return NextResponse.json({ error: 'El short no está listo para publicar' }, { status: 400 })
  }
  if (!short.final_video_url) {
    return NextResponse.json({ error: 'El short no tiene video final' }, { status: 400 })
  }

  const token = process.env.TIKTOK_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'TIKTOK_ACCESS_TOKEN no configurado' }, { status: 500 })

  // TikTok Content Posting API — pull from URL
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title:                  (short.hook as string | null) ?? 'Short generado con XENTTECH',
        privacy_level:          'PUBLIC_TO_EVERYONE',
        disable_duet:           false,
        disable_comment:        false,
        disable_stitch:         false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source:      'PULL_FROM_URL',
        video_url:   short.final_video_url,
        chunk_size:  64000000,
      },
    }),
  })

  const data = await res.json() as { data?: { publish_id?: string }; error?: { message?: string; code?: string } }

  if (!res.ok || data.error) {
    const msg = data.error?.message ?? `TikTok API error ${res.status}`
    console.error('TIKTOK_PUBLISH_ERROR', params.id, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const publishId = data.data?.publish_id ?? null

  const publishedTo = Array.isArray(short.published_to) ? [...(short.published_to as string[])] : []
  if (!publishedTo.includes('tiktok')) publishedTo.push('tiktok')

  await supabase.from('xenttech_shorts').update({
    status:       'published',
    published_to: publishedTo,
  }).eq('id', params.id)

  return NextResponse.json({ ok: true, publish_id: publishId, platform: 'tiktok' })
}
