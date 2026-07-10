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
  duration: number,
  brandColors: string[] = [],
  referenceImages: string[] = [],
): Promise<{ hook_options: string[]; script: string; video_prompt: string; cta: string }> {
  const brandContext = [
    brandColors.length > 0
      ? `Brand colors: ${brandColors.join(', ')} — the video_prompt MUST explicitly reference these colors in lighting, environment, or props.`
      : '',
    referenceImages.length > 0
      ? `There are ${referenceImages.length} reference image(s) provided for visual style. The video_prompt must describe a cinematic look consistent with professional photography at the same color temperature, composition, and mood as those references.`
      : '',
  ].filter(Boolean).join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{
        role:    'user',
        content: `Eres ${agent.name}.
Personalidad: ${agent.system_prompt ?? 'Eres un asistente profesional.'}

Crea contenido para un clip de ${duration} segundos sobre: "${topic}"
Tono: ${TONE_MAP[tone] ?? tone}
${brandContext ? `\nBrand context:\n${brandContext}` : ''}

Devuelve SOLO JSON válido sin markdown:
{
  "hook_options": ["gancho variante 1 (máx 8 palabras)", "gancho variante 2 (máx 8 palabras)", "gancho variante 3 (máx 8 palabras)"],
  "script": "guión corto para voz en off (máx 30 palabras)",
  "video_prompt": "visual description in English, cinematic, for AI video generation. Include: shot type, lighting, camera movement, atmosphere. No text on screen. Max 50 words.",
  "cta": "llamada a la acción corta (máx 10 palabras)"
}`,
      }],
    }),
  })

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
  const data = await res.json() as { content?: Array<{ text: string }> }
  const text = (data.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim()
  return JSON.parse(text)
}

export const FAL_TEXT_TO_VIDEO  = 'fal-ai/kling-video/v2.0/standard/text-to-video'
export const FAL_IMAGE_TO_VIDEO = 'fal-ai/kling-video/v2.0/standard/image-to-video'

// Submit job to Fal.ai queue and return immediately (no blocking wait)
export async function submitFalJob(
  videoPrompt: string,
  duration: number,
  referenceImageUrl?: string,
): Promise<{ request_id: string; model: string }> {
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY })
  console.log('FAL_KEY_CHECK:', { exists: !!process.env.FAL_KEY, length: process.env.FAL_KEY?.length, prefix: process.env.FAL_KEY?.slice(0, 8) })

  const model       = referenceImageUrl ? FAL_IMAGE_TO_VIDEO : FAL_TEXT_TO_VIDEO
  const durationStr = (duration <= 5 ? '5' : '10') as '5' | '10'

  const submitted = await fal.queue.submit(model, {
    input: {
      prompt:       videoPrompt,
      duration:     durationStr,
      ...(referenceImageUrl ? { image_url: referenceImageUrl } : { aspect_ratio: '9:16' }),
    },
  })

  return { request_id: submitted.request_id, model }
}

// Poll job status from Fal.ai queue
export async function checkFalStatus(
  requestId: string,
  model: string,
): Promise<{ status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' }> {
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY })
  const s = await fal.queue.status(model, { requestId, logs: false })
  return { status: s.status as 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' }
}

// Retrieve result once COMPLETED
export async function getFalResult(
  requestId: string,
  model: string,
): Promise<string | null> {
  const { fal } = await import('@fal-ai/client')
  fal.config({ credentials: process.env.FAL_KEY })
  const result = await fal.queue.result(model, { requestId })
  return (result as { data?: { video?: { url?: string } } }).data?.video?.url ?? null
}
