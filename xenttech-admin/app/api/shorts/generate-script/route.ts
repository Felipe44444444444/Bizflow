import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic    = 'force-dynamic'
export const maxDuration = 30

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    agent_id?:      string
    niche_id?:      string
    clips_context?: string
    duration?:      number
  }

  const { agent_id, niche_id, clips_context, duration = 30 } = body

  const supabase = db()

  const [{ data: agent }, { data: niche }] = await Promise.all([
    supabase
      .from('xenttech_agents')
      .select('name, system_prompt, client_id')
      .eq('id', agent_id ?? '')
      .maybeSingle(),
    supabase
      .from('xenttech_niches')
      .select('name, voice_style, intro_template, outro_template')
      .eq('id', niche_id ?? '')
      .maybeSingle(),
  ])

  // Try to get client business name for extra context
  let clientName = ''
  if (agent?.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', agent.client_id)
      .maybeSingle()
    clientName = client?.name ?? ''
  }

  const maxWords = Math.ceil(duration * 2.5)
  const toneNote = niche?.voice_style === 'comico'
    ? 'Usa humor inteligente, datos sorprendentes y un ritmo dinámico.'
    : niche?.voice_style === 'energetic'
    ? 'Sé energético y motivador. Usa verbos de acción.'
    : 'Sé cercano, claro y directo.'

  const prompt = `Eres un experto en contenido viral para redes sociales.

INFORMACIÓN DEL NEGOCIO:
${clientName ? `- Empresa: ${clientName}` : ''}
${agent?.name ? `- Bot / Asistente: ${agent.name}` : ''}
${agent?.system_prompt ? `- Personalidad: ${agent.system_prompt.slice(0, 300)}` : ''}

NICHO DE CONTENIDO: ${niche?.name ?? 'General'}
DURACIÓN: ${duration} segundos (máximo ${maxWords} palabras)
${clips_context ? `CONTEXTO DE LOS CLIPS: ${clips_context}` : ''}

Escribe el script de voz en off para un Short/Reel de ${duration} segundos.

REGLAS:
- Máximo ${maxWords} palabras (ritmo de lectura natural ~2.5 palabras/segundo)
- Primer frase: GANCHO que enganche en los primeros 3 segundos
- ${toneNote}
- Termina con CTA claro y específico
- Español natural, sin tecnicismos
- NO incluyas indicaciones de escena, corchetes ni formato — solo el texto hablado

Solo el script de voz, sin explicaciones ni comillas.`

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 350,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `Anthropic error: ${err}` }, { status: 500 })
  }

  const data = await res.json() as { content?: Array<{ text: string }> }
  const script = data.content?.[0]?.text?.trim() ?? ''

  if (!script) return NextResponse.json({ error: 'Respuesta vacía de Claude' }, { status: 500 })

  return NextResponse.json({ script })
}
