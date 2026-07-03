import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { handleIncomingMessage } from '@/lib/xenttech/agent'
import { buildSystemPrompt, sanitizeResponse } from '@/lib/xenttech/human-voice'

const CORS = {
  'Access-Control-Allow-Origin': 'https://xenttech.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const FALLBACK_AGENT_ID = 'web-fallback'
const FALLBACK_SYSTEM_PROMPT = `Eres el asistente virtual de XENTTECH, una agencia de IA y marketing digital en Chihuahua, México.

SERVICIOS:
- Chatbots IA: Agentes que responden, califican y captan leads en WhatsApp, Instagram y Facebook. Sin intervención humana.
- Meta Ads IA: Campañas creadas y optimizadas con IA. Más conversiones, menor costo por resultado.
- Diseño & Marca: Identidad visual que posiciona. Logotipo, paleta, tipografía, manual de marca completo.
- Automatización: Flujos que conectan herramientas, nutren leads y cierran ventas mientras duermes.

PRECIOS:
- Plan Esencial: $2,490/mes + setup $5,990. Chatbot 1 canal, portal de cliente, onboarding, soporte WhatsApp.
- Plan Crecimiento (más popular): $4,490/mes + setup $8,990. Chatbot multicanal (WhatsApp + Instagram + Facebook), Meta Ads IA, 4 diseños mensuales, estrategia digital, reporte mensual.
- Plan Escala: $7,990/mes + setup $14,990. Todo lo anterior + manual de marca completo, reportes semanales, optimización continua, llamada estratégica mensual.

CONTACTO: WhatsApp 614 250 9452

INSTRUCCIONES:
- Responde siempre en español mexicano, tono profesional pero cercano.
- Sé conciso: máximo 3 párrafos por respuesta.
- Cuando el visitante muestre interés real en contratar, invítalo a una llamada de diagnóstico gratuita por WhatsApp al 614 250 9452.
- No inventes información que no esté en este prompt.
- No menciones precios de competidores ni hagas comparaciones.`

// Module-level agent cache (survives warm lambda restarts)
let agentCache: { id: string; clientId: string | null } | null | undefined

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function resolveWebAgent(): Promise<{ id: string; clientId: string | null }> {
  if (agentCache !== undefined) return agentCache ?? { id: FALLBACK_AGENT_ID, clientId: null }

  const { data } = await supabase()
    .from('xenttech_agents')
    .select('id, client_id, system_prompt')
    .eq('name', 'Asistente Web XENTTECH')
    .maybeSingle()

  if (data) {
    agentCache = { id: data.id, clientId: data.client_id ?? null }
  } else {
    // Cache the fallback so we don't keep querying
    agentCache = null
  }

  return agentCache ?? { id: FALLBACK_AGENT_ID, clientId: null }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const message: string = body?.message?.trim()
    const sessionId: string = body?.sessionId?.trim()

    if (!message || !sessionId) {
      return NextResponse.json({ error: 'message and sessionId required' }, { status: 400, headers: CORS })
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: 'message too long' }, { status: 400, headers: CORS })
    }

    const { id: agentId, clientId } = await resolveWebAgent()

    // If we have a real agent in DB, use the unified pipeline.
    // If using fallback, run a lightweight direct call so we don't break the live site.
    if (agentId === FALLBACK_AGENT_ID) {
      const reply = await callAnthropicDirect(message, sessionId)
      return NextResponse.json({ reply }, { headers: CORS })
    }

    const reply = await handleIncomingMessage({
      clientId,
      agentId,
      channelType:       'web',
      channelIdentifier: sessionId,
      messageText:       message,
    })

    return NextResponse.json({ reply }, { headers: CORS })
  } catch (err) {
    console.error('widget-chat error:', err)
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg === 'AI_UNAVAILABLE' ? 'AI unavailable, try again' : 'Server error' }, {
      status: msg === 'AI_UNAVAILABLE' ? 502 : 500,
      headers: CORS,
    })
  }
}

// Lightweight fallback — used only when no 'Asistente Web XENTTECH' agent exists in DB
async function callAnthropicDirect(message: string, sessionId: string): Promise<string> {
  const db = supabase()

  const { data: conv } = await db
    .from('xenttech_conversations')
    .select('id, messages')
    .eq('channel_type', 'web')
    .eq('contact_phone', sessionId)
    .maybeSingle()

  type Msg = { role: string; content: string; timestamp?: string }
  const allMsgs: Msg[] = conv?.messages ?? []
  const history = allMsgs.slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      temperature: 0.7,
      system: buildSystemPrompt(FALLBACK_SYSTEM_PROMPT),
      messages: [...history, { role: 'user', content: message }],
    }),
  })

  if (!aiRes.ok) throw new Error('AI_UNAVAILABLE')

  const aiJson = await aiRes.json()
  const reply: string = sanitizeResponse(aiJson.content?.[0]?.text ?? '...')

  const now = new Date().toISOString()
  const updatedMsgs: Msg[] = [...allMsgs,
    { role: 'user', content: message, timestamp: now },
    { role: 'assistant', content: reply, timestamp: now },
  ]

  if (conv?.id) {
    await db.from('xenttech_conversations').update({ messages: updatedMsgs, updated_at: now }).eq('id', conv.id)
  } else {
    await db.from('xenttech_conversations').insert({
      contact_name: 'Visitante Web', contact_phone: sessionId,
      channel_type: 'web', messages: updatedMsgs, lead_captured: false, status: 'active', updated_at: now,
    })
  }

  return reply
}
