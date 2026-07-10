import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET() {
  const supabase = db()

  const { data: clips, error } = await supabase
    .from('xenttech_clips_ai')
    .select('id, agent_id, script, video_url, hook, cta')
    .lte('scheduled_at', new Date().toISOString())
    .eq('status', 'ready')
    .or('published_to.eq.{},published_to.is.null')

  if (error) {
    console.error('publish-clips cron error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!clips?.length) return NextResponse.json({ published: 0 })

  let published = 0

  for (const clip of clips) {
    const { data: channel } = await supabase
      .from('xenttech_channels')
      .select('page_id, page_access_token')
      .eq('agent_id', clip.agent_id)
      .eq('channel_type', 'facebook')
      .eq('is_connected', true)
      .maybeSingle()

    if (!channel || !clip.video_url) continue

    try {
      const description = [clip.hook, clip.script, clip.cta].filter(Boolean).join('\n\n')
      const res = await fetch(`https://graph.facebook.com/v22.0/${channel.page_id}/videos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url:     clip.video_url,
          description,
          published:    true,
          access_token: channel.page_access_token,
        }),
      })

      if (res.ok) {
        await supabase
          .from('xenttech_clips_ai')
          .update({
            status:       'published',
            published_at: new Date().toISOString(),
            published_to: ['facebook'],
          })
          .eq('id', clip.id)
        published++
      }
    } catch (err) {
      console.error(`publish-clips: failed clip ${clip.id}:`, (err as Error).message)
    }
  }

  return NextResponse.json({ published })
}
