import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  generateShortScript,
  generateVoiceover,
  generateVoiceoverGoogle,
  saveSubtitlesVTT,
  saveSubtitlesSRT,
  submitMergeJob,
  FAL_MERGE,
  type Segment,
  type VoiceoverResult,
} from '@/lib/xenttech/shorts'

async function generateVoice(
  segments: Segment[],
  voiceId:  string | null,
  style:    string | null,
): Promise<VoiceoverResult> {
  if (process.env.ELEVENLABS_API_KEY) {
    return generateVoiceover(segments, voiceId, style)
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    console.log('VOICE: Using Google TTS (free tier)')
    const fullScript = segments.map(s => s.text).join(' ')
    return generateVoiceoverGoogle(fullScript, style ?? 'professional')
  }
  throw new Error('No hay proveedor de voz configurado. Agrega ELEVENLABS_API_KEY o GOOGLE_APPLICATION_CREDENTIALS_JSON en Vercel.')
}

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    agent_id:        string
    niche_id:        string
    source_clip_ids: string[]
    duration?:       number
  }
  const { agent_id, niche_id, source_clip_ids, duration = 30 } = body

  if (!agent_id || !niche_id || !source_clip_ids?.length) {
    return NextResponse.json({ error: 'agent_id, niche_id y source_clip_ids son requeridos' }, { status: 400 })
  }

  const supabase = db()

  const { data: clips } = await supabase
    .from('xenttech_clips_ai')
    .select('id, video_url, hook, script, topic, duration_seconds')
    .in('id', source_clip_ids)
    .eq('status', 'ready')
  if (!clips?.length) return NextResponse.json({ error: 'No se encontraron clips válidos (status=ready)' }, { status: 404 })

  const { data: niche } = await supabase
    .from('xenttech_niches')
    .select('*')
    .eq('id', niche_id)
    .maybeSingle()
  if (!niche) return NextResponse.json({ error: 'Nicho no encontrado' }, { status: 404 })

  const videoUrls     = clips.map(c => c.video_url as string).filter(Boolean)
  const sourceContext = clips.map(c => c.hook ?? c.script ?? c.topic).join(' | ')

  const { data: short, error: insertErr } = await supabase
    .from('xenttech_shorts')
    .insert({
      agent_id,
      niche_id,
      source_clips:     videoUrls,
      status:           'scripting',
      duration_seconds: duration,
    })
    .select()
    .single()
  if (insertErr || !short) return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })

  try {
    // PASO A — Claude genera guión con segmentos sincronizados
    const scriptData = await generateShortScript(niche, sourceContext, duration)

    await supabase.from('xenttech_shorts').update({
      script: scriptData.full_script,
      hook:   scriptData.hook,
      cta:    scriptData.cta,
      status: 'voiceover',
    }).eq('id', short.id)

    // PASO B — Genera voz (ElevenLabs si disponible, Google TTS como fallback)
    const { voiceUrl, wordTimestamps } = await generateVoice(
      scriptData.segments,
      niche.voice_id,
      niche.voice_style,
    )

    // PASO C — Guardar subtítulos VTT + SRT con timestamps exactos del guión
    const [subtitlesVttUrl, subtitlesSrtUrl] = await Promise.all([
      saveSubtitlesVTT(scriptData.segments, short.id),
      saveSubtitlesSRT(scriptData.segments, short.id),
    ])

    await supabase.from('xenttech_shorts').update({
      voiceover_url:     voiceUrl,
      subtitles_vtt_url: subtitlesVttUrl,
      subtitles_srt_url: subtitlesSrtUrl,
      word_timestamps:   wordTimestamps,
      status:            'merging',
    }).eq('id', short.id)

    // PASO D — Fal.ai: concatenar clips de video (fase 1 de 3)
    const { request_id } = await submitMergeJob(videoUrls)

    await supabase.from('xenttech_shorts').update({
      generation_task_id: `merge:${request_id}`,
      status:             'composing',
    }).eq('id', short.id)

    return NextResponse.json({
      short_id:    short.id,
      status:      'composing',
      fal_task_id: request_id,
      fal_model:   FAL_MERGE,
    })

  } catch (err) {
    const msg = (err as Error).message
    console.error('SHORTS_GENERATE_ERROR', short.id, msg)
    await supabase.from('xenttech_shorts').update({ status: 'failed', error_message: msg }).eq('id', short.id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
