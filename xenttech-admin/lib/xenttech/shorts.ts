import { createClient } from '@supabase/supabase-js'
import { GoogleAuth } from 'google-auth-library'

// ── Niche prompt hints ────────────────────────────────────────────────────────

const NICHE_PROMPTS: Record<string, string> = {
  datos_curiosos: 'Usa tono emocionante y sorprendente. Empieza con "¿Sabías que...?" o "Dato impactante:". Genera curiosidad inmediata.',
  datos_comicos:  'Empieza con dato sorprendente o pregunta retórica. Usa humor sutil o ironía. Incluye "¿Sabías que...?" o "Esto es real:". Ritmo rápido, frases cortas. Termina con twist inesperado. Sé cercano, nunca corporativo.',
  inmobiliaria:   'Tono profesional pero accesible. Enfócate en el beneficio del cliente. Urgencia sutil.',
  bienes_raices:  'Tono profesional pero accesible. Enfócate en el beneficio del cliente. Urgencia sutil.',
  spa:            'Tono relajante y aspiracional. Evoca sensaciones de bienestar y lujo accesible.',
  fitness:        'Energético y motivador. Usa verbos de acción. Inspira transformación.',
  restaurante:    'Evocador y sensorial. Describe sabores, texturas, experiencias.',
  educacion:      'Claro, didáctico y memorable. Estructura: problema → solución → resultado.',
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Segment {
  start:       number
  end:         number
  text:        string
  subtitle:    string
  visual_note: string
}

export interface ShortScript {
  segments:    Segment[]
  full_script: string
  hook:        string
  cta:         string
}

export interface VoiceoverResult {
  voiceUrl:       string
  wordTimestamps: Record<string, unknown> | null
}

// ── MEJORA 1: generateShortScript con segmentos sincronizados ─────────────────

export async function generateShortScript(
  niche: {
    name:           string
    voice_style:    string | null
    intro_template: string | null
    outro_template: string | null
  },
  sourceContext: string,
  duration = 30,
): Promise<ShortScript> {
  const key      = niche.name.toLowerCase().replace(/[\s/]+/g, '_')
  const hint     = NICHE_PROMPTS[key] ?? `Adapta el tono al nicho "${niche.name}".`
  const segCount = Math.ceil(duration / 4)
  const segDur   = duration / segCount

  const segExample = Array.from({ length: segCount }, (_, i) => ({
    start:       parseFloat((i * segDur).toFixed(1)),
    end:         parseFloat(((i + 1) * segDur).toFixed(1)),
    text:        `texto del segmento ${i + 1}`,
    subtitle:    `subtítulo ${i + 1}`,
    visual_note: `descripción visual ${i + 1}`,
  }))

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role:    'user',
        content: `Eres experto en contenido viral para ${niche.name}.
${hint}
${niche.intro_template ? `Intro: ${niche.intro_template}` : ''}
${niche.outro_template ? `CTA: ${niche.outro_template}` : ''}

Crea un guión SINCRONIZADO para un Short/Reel de ${duration} segundos.
Contexto del video: ${sourceContext}
Segmentos: ${segCount} de ~${segDur.toFixed(1)}s cada uno.

REGLA: cada "text" debe poder leerse naturalmente en ${segDur.toFixed(1)}s (~${Math.round(segDur * 2.5)} palabras).
REGLA: "subtitle" es la versión ultra-corta e impactante para pantalla (máx 6 palabras, en mayúsculas de impacto).

Devuelve SOLO JSON (sin markdown, sin comentarios):
{
  "segments": ${JSON.stringify(segExample, null, 2)},
  "full_script": "guión completo concatenado",
  "hook": "primera frase gancho máx 8 palabras",
  "cta": "llamada a la acción final máx 10 palabras"
}`,
      }],
    }),
  })

  if (!res.ok) throw new Error(`Claude error: ${res.status}`)
  const data = await res.json() as { content?: Array<{ text: string }> }
  const text = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim()
  return JSON.parse(text) as ShortScript
}

// ── MEJORA 2: SRT / VTT con timestamps exactos ───────────────────────────────

function pad(n: number, len = 2) { return String(Math.floor(n)).padStart(len, '0') }

function toSRTTime(s: number): string {
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)},${pad((s % 1) * 1000, 3)}`
}

function toVTTTime(s: number): string {
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}.${pad((s % 1) * 1000, 3)}`
}

export function generateSRT(segments: Segment[]): string {
  return segments.map((seg, i) =>
    `${i + 1}\n${toSRTTime(seg.start)} --> ${toSRTTime(seg.end)}\n${seg.subtitle}`,
  ).join('\n\n')
}

export function generateVTT(segments: Segment[]): string {
  const cues = segments.map(seg =>
    `${toVTTTime(seg.start)} --> ${toVTTTime(seg.end)}\n${seg.subtitle}`,
  ).join('\n\n')
  return `WEBVTT\n\n${cues}`
}

export async function saveSubtitlesVTT(segments: Segment[], shortId: string): Promise<string> {
  const vtt      = generateVTT(segments)
  const supabase = db()
  const fileName = `subtitles/${shortId}.vtt`
  const { error } = await supabase.storage.from('clips')
    .upload(fileName, Buffer.from(vtt, 'utf-8'), { contentType: 'text/vtt', upsert: true })
  if (error) throw new Error(`VTT upload: ${error.message}`)
  return supabase.storage.from('clips').getPublicUrl(fileName).data.publicUrl
}

export async function saveSubtitlesSRT(segments: Segment[], shortId: string): Promise<string> {
  const srt      = generateSRT(segments)
  const supabase = db()
  const fileName = `subtitles/${shortId}.srt`
  const { error } = await supabase.storage.from('clips')
    .upload(fileName, Buffer.from(srt, 'utf-8'), { contentType: 'text/plain', upsert: true })
  if (error) throw new Error(`SRT upload: ${error.message}`)
  return supabase.storage.from('clips').getPublicUrl(fileName).data.publicUrl
}

// ── MEJORA 3: ElevenLabs with-timestamps ─────────────────────────────────────

export async function generateVoiceover(
  segments: Segment[],
  voiceId:  string | null,
  style:    string | null,
): Promise<VoiceoverResult> {
  const SETTINGS: Record<string, { stability: number; similarity_boost: number; style: number }> = {
    energetic:    { stability: 0.3, similarity_boost: 0.8,  style: 0.9 },
    calm:         { stability: 0.8, similarity_boost: 0.7,  style: 0.2 },
    professional: { stability: 0.6, similarity_boost: 0.8,  style: 0.4 },
    friendly:     { stability: 0.5, similarity_boost: 0.75, style: 0.6 },
    comico:       { stability: 0.2, similarity_boost: 0.9,  style: 1.0 },
  }
  const settings = SETTINGS[style ?? 'professional'] ?? SETTINGS.professional
  const vid      = voiceId ?? process.env.ELEVENLABS_VOICE_ID_DEFAULT
  if (!vid) throw new Error('No hay voice ID. Configura ELEVENLABS_VOICE_ID_DEFAULT o asigna una voz al nicho.')

  // Join segments with SSML break for natural pacing between sections
  const scriptWithPauses = segments.map(s => s.text).join(' <break time="0.5s"/> ')

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}/with-timestamps`, {
    method:  'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text:     scriptWithPauses,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability:         settings.stability,
        similarity_boost:  settings.similarity_boost,
        style:             settings.style,
        use_speaker_boost: true,
      },
    }),
  })

  if (!res.ok) throw new Error(`ElevenLabs error: ${await res.text()}`)
  const data = await res.json() as { audio_base64?: string; alignment?: Record<string, unknown> }

  if (!data.audio_base64) throw new Error('ElevenLabs /with-timestamps no devolvió audio_base64')

  const audioBuffer = Buffer.from(data.audio_base64, 'base64')
  const supabase    = db()
  const fileName    = `voiceovers/vo-${Date.now()}.mp3`
  const { error }   = await supabase.storage.from('clips')
    .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`Storage voiceover: ${error.message}`)

  return {
    voiceUrl:       supabase.storage.from('clips').getPublicUrl(fileName).data.publicUrl,
    wordTimestamps: data.alignment ?? null,
  }
}

// ── Google Cloud TTS (free tier fallback) ────────────────────────────────────

export async function generateVoiceoverGoogle(
  script: string,
  style = 'professional',
): Promise<VoiceoverResult> {
  const VOICE_PROFILES: Record<string, { name: string; gender: string }> = {
    professional: { name: 'es-US-Neural2-A', gender: 'FEMALE' },
    energetic:    { name: 'es-US-Neural2-B', gender: 'MALE'   },
    comico:       { name: 'es-US-Neural2-C', gender: 'MALE'   },
    calm:         { name: 'es-US-Neural2-A', gender: 'FEMALE' },
    friendly:     { name: 'es-US-Neural2-C', gender: 'MALE'   },
  }
  const SPEEDS: Record<string, number> = {
    comico: 1.15, energetic: 1.1, professional: 1.0, calm: 0.9, friendly: 1.05,
  }

  const voice = VOICE_PROFILES[style] ?? VOICE_PROFILES.professional
  const speed = SPEEDS[style] ?? 1.0

  const auth = new GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON!),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()
  const tokenResponse = await client.getAccessToken()
  const token = tokenResponse.token

  const res = await fetch(
    'https://texttospeech.googleapis.com/v1/text:synthesize',
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        input: { text: script },
        voice: { languageCode: 'es-US', name: voice.name, ssmlGender: voice.gender },
        audioConfig: {
          audioEncoding:    'MP3',
          speakingRate:     speed,
          pitch:            style === 'comico' ? 1.5 : 0.0,
          effectsProfileId: ['headphone-class-device'],
        },
      }),
    },
  )

  const data = await res.json() as { audioContent?: string; error?: { message: string } }
  if (data.error) throw new Error(`Google TTS error: ${data.error.message}`)
  if (!data.audioContent) throw new Error('Google TTS: no audioContent en respuesta')

  const audioBuffer = Buffer.from(data.audioContent, 'base64')
  const supabase    = db()
  const fileName    = `voiceovers/voice-google-${Date.now()}.mp3`
  const { error }   = await supabase.storage.from('clips')
    .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`Storage google voice: ${error.message}`)

  return {
    voiceUrl:       supabase.storage.from('clips').getPublicUrl(fileName).data.publicUrl,
    wordTimestamps: null,
  }
}

// ── MEJORA 4: Pipeline Fal.ai de 3 fases ─────────────────────────────────────

export const FAL_MERGE   = 'fal-ai/ffmpeg-api/merge-videos'
export const FAL_COMPOSE = 'fal-ai/ffmpeg-api/compose'

// Fase 1: concatenar clips fuente
export async function submitMergeJob(videoUrls: string[]): Promise<{ request_id: string }> {
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY })
  const submitted = await fal.queue.submit(FAL_MERGE, { input: { video_urls: videoUrls } })
  return { request_id: submitted.request_id }
}

// Fase 2: añadir voiceover al video concatenado (replace_audio)
export async function submitAudioMergeJob(videoUrl: string, audioUrl: string): Promise<{ request_id: string }> {
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const submitted = await fal.queue.submit(FAL_MERGE, {
    input: { video_url: videoUrl, audio_url: audioUrl, replace_audio: true } as any,
  })
  return { request_id: submitted.request_id }
}

// Fase 3: quemar subtítulos en el video con audio
export async function submitSubtitleBurnJob(
  videoUrl: string,
  srtUrl:   string,
  style:    string,
): Promise<{ request_id: string }> {
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const submitted = await fal.queue.submit(FAL_COMPOSE, {
    input: {
      video_url:  videoUrl,
      operations: [{ type: 'subtitles', subtitle_url: srtUrl, style }],
    } as any,
  })
  return { request_id: submitted.request_id }
}

// Alias para compatibilidad con status route existente
export async function submitComposeJob(videoUrl: string, voiceoverUrl: string): Promise<{ request_id: string }> {
  return submitAudioMergeJob(videoUrl, voiceoverUrl)
}

export function getNicheSubtitleStyle(
  niche: { subtitle_style?: { color?: string; fontSize?: number; bold?: boolean; outline?: number } | null } | null,
): string {
  const s = niche?.subtitle_style
  if (!s) return 'FontSize=26,PrimaryColour=&HFFFFFF&,Bold=1,Alignment=2,MarginV=80,BorderStyle=3,Outline=2,Shadow=1'
  const fontSize = s.fontSize ?? 26
  const bold     = s.bold !== false ? 1 : 0
  const outline  = s.outline ?? 2
  // ASS color: pass through value or use white default
  const color    = s.color ?? '#FFFFFF'
  const assColor = `&H${color.replace('#', '').toUpperCase()}&`
  return `FontSize=${fontSize},PrimaryColour=${assColor},Bold=${bold},Alignment=2,MarginV=80,BorderStyle=3,Outline=${outline},Shadow=1`
}

export async function checkFalJobStatus(requestId: string, model: string): Promise<string> {
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY })
  const s = await fal.queue.status(model, { requestId, logs: false })
  return s.status
}

export async function getFalJobResult(requestId: string, model: string): Promise<Record<string, string> | null> {
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY })
  const result = await fal.queue.result(model, { requestId })
  return (result as { data?: Record<string, string> }).data ?? null
}

export async function persistFinalVideo(sourceUrl: string, shortId: string): Promise<string> {
  const videoRes  = await fetch(sourceUrl)
  const buf       = await videoRes.arrayBuffer()
  const supabase  = db()
  const path      = `shorts/${shortId}.mp4`
  const { error } = await supabase.storage.from('clips')
    .upload(path, Buffer.from(buf), { contentType: 'video/mp4', upsert: true })
  if (error) throw new Error(`Persist video: ${error.message}`)
  return supabase.storage.from('clips').getPublicUrl(path).data.publicUrl
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
