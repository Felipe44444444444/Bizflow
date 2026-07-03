import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { generateClipScript, generateFalVideo } from '@/lib/xenttech/clips'

export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    agent_id:      string
    topic:         string
    tone?:         string
    duration_seconds?: number
    auto_publish?: boolean
  }

  const { agent_id, topic, tone = 'professional', duration_seconds = 10, auto_publish = false } = body

  if (!agent_id || !topic?.trim()) {
    return NextResponse.json({ error: 'agent_id y topic son requeridos' }, { status: 400 })
  }

  const supabase = db()

  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('id, name, system_prompt')
    .eq('id', agent_id)
    .maybeSingle()

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })

  // Insert immediately so frontend has a clip_id to poll
  const { data: clip, error: insertError } = await supabase
    .from('xenttech_clips_ai')
    .insert({
      agent_id,
      topic,
      tone,
      duration_seconds,
      auto_publish,
      status: 'generating',
    })
    .select()
    .single()

  if (insertError || !clip) {
    return NextResponse.json({ error: insertError?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Run generation in background — does not block response
  waitUntil((async () => {
    try {
      const plan = await generateClipScript(agent, topic, tone, duration_seconds)
      const { video_url, task_id } = await generateFalVideo(plan.video_prompt, duration_seconds)

      await supabase
        .from('xenttech_clips_ai')
        .update({
          script:             plan.script,
          video_prompt:       plan.video_prompt,
          generation_task_id: task_id,
          video_url,
          status: 'ready',
        })
        .eq('id', clip.id)

      if (auto_publish) {
        const { data: channel } = await supabase
          .from('xenttech_channels')
          .select('page_id, page_access_token')
          .eq('agent_id', agent_id)
          .eq('channel_type', 'facebook')
          .eq('is_connected', true)
          .maybeSingle()

        if (channel) {
          await fetch(`https://graph.facebook.com/v22.0/${channel.page_id}/videos`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_url:     video_url,
              description:  plan.script,
              published:    true,
              access_token: channel.page_access_token,
            }),
          })
          await supabase
            .from('xenttech_clips_ai')
            .update({ status: 'published', published_at: new Date().toISOString() })
            .eq('id', clip.id)
        }
      }
    } catch (err) {
      console.error('Fal generation failed:', err)
      await supabase
        .from('xenttech_clips_ai')
        .update({ status: 'failed', error_message: (err as Error).message })
        .eq('id', clip.id)
    }
  })())

  return NextResponse.json({
    clip_id: clip.id,
    status:  'generating',
    message: 'Generando tu clip… esto toma ~60 segundos',
  })
}
