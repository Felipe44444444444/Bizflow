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

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data: clip, error } = await db()
    .from('xenttech_clips_ai')
    .select('id, status, video_url, script, video_prompt, generation_task_id, error_message, topic, tone, duration_seconds, auto_publish, created_at')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !clip) {
    return NextResponse.json({ error: 'Clip no encontrado' }, { status: 404 })
  }

  return NextResponse.json(clip)
}
