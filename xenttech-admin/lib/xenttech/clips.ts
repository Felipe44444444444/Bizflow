import { fal } from '@fal-ai/client'

const TONE_MAP: Record<string, string> = {
  professional:  'profesional y autoritativo',
  inspirational: 'inspiracional y motivador',
  educational:   'educativo y claro, con ejemplos',
  sales:         'orientado a ventas, persuasivo y con urgencia',
}

export async function generateClipScript(
  agent: { name: string; system_prompt: string | null },
  topic: string,
  tone: string,
  duration: number
): Promise<{ script: string; video_prompt: string; hook: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{
        role:    'user',
        content: `Eres ${agent.name}.
Personalidad: ${agent.system_prompt ?? 'Eres un asistente profesional.'}

Crea contenido para un clip de ${duration} segundos sobre: "${topic}"
Tono: ${TONE_MAP[tone] ?? tone}

Devuelve SOLO JSON válido sin markdown:
{
  "script": "guión corto para voz en off (máx 30 palabras)",
  "video_prompt": "visual description in English, cinematic, for AI video generation. Include: shot type, lighting, camera movement, atmosphere. No text on screen. Max 50 words.",
  "hook": "primera oración gancho (máx 8 palabras)"
}`,
      }],
    }),
  })

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
  const data = await res.json() as { content?: Array<{ text: string }> }
  const text = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim()
  return JSON.parse(text)
}

export async function generateFalVideo(
  videoPrompt: string,
  duration: number
): Promise<{ video_url: string; task_id: string }> {
  fal.config({ credentials: process.env.FAL_KEY })

  const result = await fal.subscribe('fal-ai/kling-video/v2.1/standard/text-to-video', {
    input: {
      prompt:       videoPrompt,
      duration:     duration <= 5 ? '5' : '10',
      aspect_ratio: '9:16',
    },
    logs: false,
  })

  const videoUrl = (result as { data?: { video?: { url?: string } }; requestId?: string })
    .data?.video?.url
  if (!videoUrl) throw new Error('Fal.ai no devolvió URL de video: ' + JSON.stringify(result))

  return {
    video_url: videoUrl,
    task_id:   (result as { requestId?: string }).requestId ?? ('fal-' + Date.now()),
  }
}
