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

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    agent_id: string
    video_url: string
    original_video_url?: string
    filename?: string
    duration_seconds?: number
    topic?: string
  }

  const { agent_id, video_url, filename, duration_seconds, topic } = body
  if (!agent_id || !video_url) {
    return NextResponse.json({ error: 'agent_id y video_url son requeridos' }, { status: 400 })
  }

  const supabase = db()
  const { data, error } = await supabase
    .from('xenttech_clips_ai')
    .insert({
      agent_id,
      video_url,
      original_video_url: video_url,
      source_type:        'uploaded',
      status:             'uploaded',
      topic:              topic ?? filename ?? 'Video subido',
      duration_seconds:   duration_seconds ?? 0,
      tone:               'professional',
      auto_publish:       false,
      brand_colors:       [],
      reference_images:   [],
      published_to:       [],
      views:              0,
      likes:              0,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
