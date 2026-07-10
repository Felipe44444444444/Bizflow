import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  checkFalJobStatus,
  getFalJobResult,
  submitAudioMergeJob,
  submitSubtitleBurnJob,
  persistFinalVideo,
  getNicheSubtitleStyle,
  FAL_MERGE,
  FAL_COMPOSE,
} from '@/lib/xenttech/shorts'

export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = db()

  const { data: short, error } = await supabase
    .from('xenttech_shorts')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !short) return NextResponse.json({ error: 'Short no encontrado' }, { status: 404 })

  if (short.status !== 'composing' || !short.generation_task_id) {
    return NextResponse.json(short)
  }

  // Parse task ID: "merge:<rid>" | "audio_merge:<rid>" | "subtitle_burn:<rid>"
  const colonIdx  = (short.generation_task_id as string).indexOf(':')
  const phase     = (short.generation_task_id as string).slice(0, colonIdx)
  const requestId = (short.generation_task_id as string).slice(colonIdx + 1)
  const model     = phase === 'subtitle_burn' ? FAL_COMPOSE : FAL_MERGE

  console.log(`SHORTS_POLL short=${params.id} phase=${phase} request=${requestId}`)

  try {
    const falStatus = await checkFalJobStatus(requestId, model)
    console.log(`SHORTS_POLL_STATUS short=${params.id} phase=${phase} fal=${falStatus}`)

    if (falStatus === 'COMPLETED') {
      const result = await getFalJobResult(requestId, model)

      // ── Fase 1: clips concatenados → añadir audio ─────────────────────────
      if (phase === 'merge') {
        const mergedVideoUrl = result?.video_url
        if (!mergedVideoUrl) {
          await supabase.from('xenttech_shorts').update({ status: 'failed', error_message: 'Merge: no video_url' }).eq('id', params.id)
          return NextResponse.json({ ...short, status: 'failed' })
        }
        const { request_id } = await submitAudioMergeJob(mergedVideoUrl, short.voiceover_url)
        await supabase.from('xenttech_shorts').update({ generation_task_id: `audio_merge:${request_id}` }).eq('id', params.id)
        return NextResponse.json({ ...short, status: 'composing', _phase: 'audio_merge' })
      }

      // ── Fase 2: audio fusionado → quemar subtítulos ───────────────────────
      if (phase === 'audio_merge') {
        const videoWithAudioUrl = result?.video_url
        if (!videoWithAudioUrl) {
          await supabase.from('xenttech_shorts').update({ status: 'failed', error_message: 'AudioMerge: no video_url' }).eq('id', params.id)
          return NextResponse.json({ ...short, status: 'failed' })
        }

        const srtUrl = short.subtitles_srt_url as string | null
        if (!srtUrl) {
          // No SRT available — skip subtitle burn and go straight to finalize
          console.warn(`SHORTS_POLL short=${params.id} no subtitles_srt_url, skipping burn`)
          let finalUrl = videoWithAudioUrl
          try { finalUrl = await persistFinalVideo(videoWithAudioUrl, params.id) } catch (e) {
            console.error('SHORTS_PERSIST_ERROR', (e as Error).message)
          }
          await supabase.from('xenttech_shorts').update({
            status:             'ready',
            final_video_url:    finalUrl,
            generation_task_id: null,
          }).eq('id', params.id)
          return NextResponse.json({ ...short, status: 'ready', final_video_url: finalUrl })
        }

        // Fetch niche subtitle style
        const { data: niche } = await supabase.from('xenttech_niches').select('subtitle_style').eq('id', short.niche_id).maybeSingle()
        const subStyle = getNicheSubtitleStyle(niche)

        const { request_id } = await submitSubtitleBurnJob(videoWithAudioUrl, srtUrl, subStyle)
        await supabase.from('xenttech_shorts').update({ generation_task_id: `subtitle_burn:${request_id}` }).eq('id', params.id)
        return NextResponse.json({ ...short, status: 'composing', _phase: 'subtitle_burn' })
      }

      // ── Fase 3: subtítulos quemados → persistir video final ──────────────
      if (phase === 'subtitle_burn') {
        const finalFalUrl = result?.video_url
        if (!finalFalUrl) {
          await supabase.from('xenttech_shorts').update({ status: 'failed', error_message: 'SubtitleBurn: no video_url' }).eq('id', params.id)
          return NextResponse.json({ ...short, status: 'failed' })
        }

        let finalVideoUrl = finalFalUrl
        let thumbnailUrl  = result?.thumbnail_url ?? ''

        try {
          finalVideoUrl = await persistFinalVideo(finalFalUrl, params.id)
        } catch (persistErr) {
          console.error('SHORTS_PERSIST_ERROR', (persistErr as Error).message)
        }

        await supabase.from('xenttech_shorts').update({
          status:             'ready',
          final_video_url:    finalVideoUrl,
          thumbnail_url:      thumbnailUrl || null,
          generation_task_id: null,
        }).eq('id', params.id)

        return NextResponse.json({ ...short, status: 'ready', final_video_url: finalVideoUrl, thumbnail_url: thumbnailUrl })
      }

      // Legacy: old "compose" phase name (backward compat)
      if (phase === 'compose') {
        const finalFalUrl = result?.video_url
        if (!finalFalUrl) {
          await supabase.from('xenttech_shorts').update({ status: 'failed', error_message: 'Compose: no video_url' }).eq('id', params.id)
          return NextResponse.json({ ...short, status: 'failed' })
        }
        let finalVideoUrl = finalFalUrl
        try { finalVideoUrl = await persistFinalVideo(finalFalUrl, params.id) } catch (e) {
          console.error('SHORTS_PERSIST_ERROR', (e as Error).message)
        }
        await supabase.from('xenttech_shorts').update({
          status:             'ready',
          final_video_url:    finalVideoUrl,
          generation_task_id: null,
        }).eq('id', params.id)
        return NextResponse.json({ ...short, status: 'ready', final_video_url: finalVideoUrl })
      }
    }

    if (falStatus === 'FAILED') {
      await supabase.from('xenttech_shorts').update({ status: 'failed', error_message: `Fal.ai ${phase} job failed` }).eq('id', params.id)
      return NextResponse.json({ ...short, status: 'failed' })
    }

    return NextResponse.json({ ...short, _fal_status: falStatus, _phase: phase })

  } catch (err) {
    const msg = (err as Error).message
    console.error(`SHORTS_POLL_ERROR short=${params.id}`, msg)
    return NextResponse.json({ ...short, _fal_error: msg })
  }
}
