import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { checkFalStatus, getFalResult, FAL_TEXT_TO_VIDEO } from '@/lib/xenttech/clips'

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
  const supabase = db()

  const { data: clip, error } = await supabase
    .from('xenttech_clips_ai')
    .select('id, status, video_url, script, hook, cta, video_prompt, generation_task_id, fal_model, error_message, topic, tone, duration_seconds, auto_publish, brand_colors, reference_images, created_at')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !clip) {
    return NextResponse.json({ error: 'Clip no encontrado' }, { status: 404 })
  }

  // If still generating and we have a Fal request ID, poll Fal.ai now
  if (clip.status === 'generating' && clip.generation_task_id) {
    const model = (clip.fal_model as string | null) ?? FAL_TEXT_TO_VIDEO
    console.log(`FAL_POLL clip=${params.id} request=${clip.generation_task_id} model=${model}`)

    let falStatus: Awaited<ReturnType<typeof checkFalStatus>>
    try {
      falStatus = await checkFalStatus(clip.generation_task_id, model)
      console.log(`FAL_POLL_STATUS clip=${params.id} status=${falStatus.status}`)
    } catch (err) {
      const msg = (err as Error).message
      console.error(`FAL_POLL_ERROR clip=${params.id}`, msg)
      return NextResponse.json({ ...clip, fal_status: 'CHECK_ERROR', fal_error: msg })
    }

    if (falStatus.status === 'COMPLETED') {
      let videoUrl: string | null = null
      try {
        videoUrl = await getFalResult(clip.generation_task_id, model)
      } catch (err) {
        console.error('FAL_RESULT_FETCH_ERROR', (err as Error).message)
      }

      if (!videoUrl) {
        await supabase
          .from('xenttech_clips_ai')
          .update({ status: 'failed', error_message: 'Fal.ai completed but returned no video URL' })
          .eq('id', clip.id)
        return NextResponse.json({ ...clip, status: 'failed' })
      }

      // Download and persist in Supabase Storage
      let finalVideoUrl = videoUrl
      try {
        const videoRes    = await fetch(videoUrl)
        const videoBuffer = await videoRes.arrayBuffer()
        const { error: uploadErr } = await supabase.storage
          .from('clips')
          .upload(`${clip.id}.mp4`, Buffer.from(videoBuffer), {
            contentType: 'video/mp4',
            upsert:      true,
          })
        if (!uploadErr) {
          finalVideoUrl = supabase.storage
            .from('clips')
            .getPublicUrl(`${clip.id}.mp4`).data.publicUrl
        } else {
          console.error('CLIPS_STORAGE_UPLOAD_ERROR', uploadErr.message)
        }
      } catch (storageErr) {
        console.error('CLIPS_STORAGE_FETCH_ERROR', (storageErr as Error).message)
      }

      await supabase
        .from('xenttech_clips_ai')
        .update({ video_url: finalVideoUrl, status: 'ready' })
        .eq('id', clip.id)

      return NextResponse.json({ ...clip, status: 'ready', video_url: finalVideoUrl })
    }

    if (falStatus.status === 'FAILED') {
      await supabase
        .from('xenttech_clips_ai')
        .update({ status: 'failed', error_message: 'Fal.ai job failed' })
        .eq('id', clip.id)
      return NextResponse.json({ ...clip, status: 'failed', error_message: 'Fal.ai job failed' })
    }

    // IN_QUEUE or IN_PROGRESS — still waiting
    return NextResponse.json({ ...clip, fal_status: falStatus.status })
  }

  return NextResponse.json(clip)
}
