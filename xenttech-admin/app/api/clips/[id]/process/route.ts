import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { generateVoiceover, saveSubtitlesVTT } from '@/lib/xenttech/shorts'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const FAL_COMPOSE = 'fal-ai/ffmpeg-api/compose'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// ── FFmpeg filter builder ─────────────────────────────────────────────────────

const COLOR_GRADE_FILTERS: Record<string, string> = {
  warm:       'colorchannelmixer=rr=1.1:gg=0.95:bb=0.85',
  cool:       'colorchannelmixer=rr=0.85:gg=0.95:bb=1.1',
  vibrant:    'eq=saturation=1.4:contrast=1.1',
  cinematic:  'eq=contrast=1.15:brightness=-0.05,curves=r=0/0 0.5/0.4 1/1',
  dark:       'eq=brightness=-0.1:contrast=1.2:saturation=0.9',
}

const FORMAT_FILTERS: Record<string, string> = {
  '9:16':     'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
  '16:9':     'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black',
  '1:1':      'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black',
  '4:5':      'scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:black',
}

function buildVideoFilters(opts: {
  color_grade?:  string
  video_format?: string
  title_text?:   string
  cta_text?:     string
  duration?:     number
  brand_colors?: string[]
}): string {
  const filters: string[] = []

  // Color grade
  if (opts.color_grade && COLOR_GRADE_FILTERS[opts.color_grade]) {
    filters.push(COLOR_GRADE_FILTERS[opts.color_grade])
  }

  // Formato
  if (opts.video_format && FORMAT_FILTERS[opts.video_format]) {
    filters.push(FORMAT_FILTERS[opts.video_format])
  }

  const textColor = opts.brand_colors?.[0]
    ? opts.brand_colors[0].replace('#', '0x')
    : 'white'

  // Título en primeros 3s
  if (opts.title_text) {
    const escaped = opts.title_text.replace(/'/g, "’").replace(/:/g, '\\:')
    filters.push(
      `drawtext=text='${escaped}':fontsize=48:fontcolor=${textColor}:` +
      `borderw=2:bordercolor=black:x=(w-text_w)/2:y=80:enable='between(t,0,3)'`
    )
  }

  // CTA en últimos 3s
  if (opts.cta_text && opts.duration) {
    const escaped = opts.cta_text.replace(/'/g, "’").replace(/:/g, '\\:')
    const start   = Math.max(0, opts.duration - 3)
    filters.push(
      `drawtext=text='${escaped}':fontsize=36:fontcolor=${textColor}:` +
      `borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-100:enable='gte(t,${start})'`
    )
  }

  return filters.join(',')
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = db()

  const { data: clip } = await supabase
    .from('xenttech_clips_ai')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (!clip) return NextResponse.json({ error: 'Clip no encontrado' }, { status: 404 })

  const body = await req.json() as {
    voiceover?:        boolean
    voiceover_script?: string
    voice_style?:      string
    voice_id?:         string
    subtitles?:        boolean
    duration_seconds?: number
    // Nuevos campos de edición
    color_grade?:  string
    video_format?: string
    title_text?:   string
    cta_text?:     string
    mute_original?: boolean
    brand_colors?: string[]
    niche_key?:    string
  }

  // Buscar URL del video — puede estar en video_url o en processing_options.storage_path
  let videoUrl = (clip.original_video_url ?? clip.video_url) as string | null

  // Si el clip acaba de ser subido y video_url es null, reconstruir desde storage_path
  if (!videoUrl && clip.processing_options?.storage_path) {
    videoUrl = supabase.storage
      .from('clips')
      .getPublicUrl(clip.processing_options.storage_path as string).data.publicUrl
    // Persistir para próximas llamadas
    await supabase.from('xenttech_clips_ai')
      .update({ video_url: videoUrl, original_video_url: videoUrl })
      .eq('id', params.id)
  }

  if (!videoUrl) return NextResponse.json({ error: 'No hay video para procesar' }, { status: 400 })

  const duration = body.duration_seconds ?? (clip.duration_seconds as number) ?? 30
  const hasVisualEdits = !!(body.color_grade && body.color_grade !== 'none') || !!(body.title_text) || !!(body.cta_text) || !!(body.video_format && body.video_format !== 'original')
  const hasAudio = body.voiceover && body.voiceover_script

  // Sin nada que procesar → marcar como listo
  if (!hasAudio && !hasVisualEdits && !body.subtitles) {
    await supabase.from('xenttech_clips_ai').update({ status: 'ready', video_url: videoUrl }).eq('id', params.id)
    return NextResponse.json({ status: 'ready' })
  }

  await supabase.from('xenttech_clips_ai').update({ status: 'generating' }).eq('id', params.id)

  try {
    let voiceoverUrl: string | null = null
    let subtitlesUrl: string | null = null

    // 1. Voiceover ElevenLabs — wraps the plain script in a single segment
    if (hasAudio) {
      const seg = [{
        start:       0,
        end:         duration,
        text:        body.voiceover_script!,
        subtitle:    body.voiceover_script!.slice(0, 40),
        visual_note: '',
      }]
      const vo = await generateVoiceover(seg, body.voice_id ?? null, body.voice_style ?? null)
      voiceoverUrl = vo.voiceUrl
    }

    // 2. Subtítulos WebVTT
    if (body.subtitles && body.voiceover_script) {
      const lines   = body.voiceover_script.split(/[.!?]+/).map((s: string) => s.trim()).filter(Boolean)
      const segDur  = duration / (lines.length || 1)
      const segs    = lines.map((text: string, i: number) => ({
        start:       i * segDur,
        end:         (i + 1) * segDur,
        text,
        subtitle:    text.slice(0, 40),
        visual_note: '',
      }))
      subtitlesUrl = await saveSubtitlesVTT(segs, params.id)
    }

    // 3. Construir filtros FFmpeg para edición visual
    const videoFilters = buildVideoFilters({
      color_grade:  body.color_grade,
      video_format: body.video_format,
      title_text:   body.title_text,
      cta_text:     body.cta_text,
      duration,
      brand_colors: body.brand_colors,
    })

    // 4. Si solo hay edición visual sin audio → compose solo con filtros
    //    Si no hay audio ni filtros → el video ya está listo
    if (!voiceoverUrl && !hasVisualEdits) {
      await supabase.from('xenttech_clips_ai').update({
        status:             'ready',
        video_url:          videoUrl,
        processing_options: { subtitles_url: subtitlesUrl, ...(clip.processing_options ?? {}) },
      }).eq('id', params.id)
      return NextResponse.json({ status: 'ready', subtitles_url: subtitlesUrl })
    }

    // 5. Submit compose job a Fal.ai
    const { fal } = await import('@fal-ai/client')
    fal.config({ credentials: process.env.FAL_KEY })

    const videoTrack: Record<string, unknown> = {
      id:        'video',
      type:      'video',
      keyframes: [{ url: videoUrl }],
    }
    if (videoFilters) videoTrack.filters = videoFilters
    if (body.mute_original) videoTrack.volume = 0

    const tracks: Record<string, unknown>[] = [videoTrack]
    if (voiceoverUrl) {
      tracks.push({ id: 'audio', type: 'audio', keyframes: [{ url: voiceoverUrl }] })
    }

    const submitted = await fal.queue.submit(FAL_COMPOSE, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: { tracks } as any,
    })

    await supabase.from('xenttech_clips_ai').update({
      status:             'generating',
      fal_model:          FAL_COMPOSE,
      generation_task_id: submitted.request_id,
      brand_colors:       body.brand_colors ?? [],
      processing_options: {
        voiceover_url:  voiceoverUrl,
        subtitles_url:  subtitlesUrl,
        color_grade:    body.color_grade,
        video_format:   body.video_format,
        niche_key:      body.niche_key,
        video_filters:  videoFilters,
        ...(clip.processing_options ?? {}),
      },
    }).eq('id', params.id)

    return NextResponse.json({ status: 'generating', request_id: submitted.request_id })

  } catch (err) {
    const msg = (err as Error).message
    await supabase.from('xenttech_clips_ai')
      .update({ status: 'failed', error_message: msg })
      .eq('id', params.id)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
