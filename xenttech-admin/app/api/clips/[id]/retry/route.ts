import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { generateClipScript, submitFalJob } from '@/lib/xenttech/clips'

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

  const { data: clip, error } = await supabase
    .from('xenttech_clips_ai')
    .select('id, status, agent_id, topic, tone, duration_seconds, video_prompt, auto_publish, reference_images')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !clip) {
    return NextResponse.json({ error: 'Clip no encontrado' }, { status: 404 })
  }

  if (clip.status !== 'failed') {
    return NextResponse.json({ error: 'Solo se pueden reintentar clips fallidos' }, { status: 400 })
  }

  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('id, name, system_prompt')
    .eq('id', clip.agent_id)
    .maybeSingle()

  const tone      = clip.tone ?? 'professional'
  const duration  = clip.duration_seconds ?? 10
  const agentObj  = agent ?? { name: 'Asistente', system_prompt: null }
  const refImages = (clip.reference_images as string[] | null) ?? []

  let videoPrompt = clip.video_prompt as string | null
  let script:      string | null = null

  if (!videoPrompt) {
    try {
      const plan  = await generateClipScript(agentObj, clip.topic, tone, duration)
      videoPrompt = plan.video_prompt
      script      = plan.script
    } catch (err) {
      return NextResponse.json({ error: `Claude error: ${(err as Error).message}` }, { status: 502 })
    }
  }

  let requestId: string
  let falModel:  string
  try {
    const referenceImageUrl = refImages.length > 0 ? refImages[0] : undefined
    const submitted = await submitFalJob(videoPrompt!, duration, referenceImageUrl)
    requestId = submitted.request_id
    falModel  = submitted.model
  } catch (err) {
    return NextResponse.json({ error: `Fal.ai submit error: ${(err as Error).message}` }, { status: 502 })
  }

  await supabase
    .from('xenttech_clips_ai')
    .update({
      status:             'generating',
      error_message:      null,
      generation_task_id: requestId,
      fal_model:          falModel,
      ...(script      ? { script }           : {}),
      ...(videoPrompt ? { video_prompt: videoPrompt } : {}),
    })
    .eq('id', params.id)

  return NextResponse.json({ ok: true, status: 'generating' })
}
