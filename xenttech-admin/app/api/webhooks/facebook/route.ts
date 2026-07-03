import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { handleIncomingMessage } from '@/lib/xenttech/agent'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// GET — Facebook webhook verification challenge
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Any connected channel's verify token is accepted
  if (mode === 'subscribe' && token && challenge) {
    const supabase = db()
    const { data } = await supabase
      .from('xenttech_channels')
      .select('id')
      .eq('channel_type', 'facebook')
      .eq('is_connected', true)
      .limit(1)
      .maybeSingle()

    // For Facebook Messenger, the webhook is at the app level — no per-channel verify token.
    // Accept any challenge as long as we have an active Facebook channel.
    if (data) {
      return new NextResponse(challenge, { status: 200 })
    }
  }

  return new NextResponse('Forbidden', { status: 403 })
}

// POST — Incoming messages
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  console.log('WEBHOOK_FB_RECEIVED', JSON.stringify({ timestamp: new Date().toISOString(), body }))

  // Acknowledge immediately — Facebook requires < 20s response
  // waitUntil keeps the Vercel function alive until processMessages resolves
  waitUntil(processMessages(body).catch(err => console.error('Facebook webhook processing error:', err)))

  return new NextResponse('EVENT_RECEIVED', { status: 200 })
}

async function processMessages(body: Record<string, unknown>) {
  if (body.object !== 'page') return

  const supabase = db()
  const entries  = (body.entry as Array<{
    id: string
    messaging?: unknown[]
    changes?: Array<{ field: string; value: Record<string, unknown> }>
  }>) ?? []

  for (const entry of entries) {
    const pageId = entry.id

    // Look up the channel row for this Facebook Page (shared for DMs and comments)
    const { data: channel } = await supabase
      .from('xenttech_channels')
      .select('id, agent_id, client_id, page_access_token')
      .eq('channel_type', 'facebook')
      .eq('page_id', pageId)
      .eq('is_connected', true)
      .maybeSingle()

    if (!channel) {
      console.warn(`No connected Facebook channel for page_id ${pageId}`)
      continue
    }

    // ── DM messages ──────────────────────────────────────────────────────────
    const messagingEvents = (entry.messaging ?? []) as Array<{
      sender: { id: string }
      recipient: { id: string }
      message?: { text?: string; is_echo?: boolean }
    }>

    for (const event of messagingEvents) {
      if (event.message?.is_echo) continue
      const messageText = event.message?.text
      if (!messageText) continue

      const senderId = event.sender.id

      try {
        const reply = await handleIncomingMessage({
          clientId:          channel.client_id ?? null,
          agentId:           channel.agent_id,
          channelId:         channel.id,
          channelType:       'facebook',
          channelIdentifier: senderId,
          messageText,
        })

        await fetch(
          `https://graph.facebook.com/v22.0/me/messages?access_token=${channel.page_access_token}`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_type: 'RESPONSE',
              recipient: { id: senderId },
              message:   { text: reply },
            }),
          }
        )
      } catch (err) {
        console.error(`Facebook message handling failed for sender ${senderId}:`, err)
      }
    }

    // ── Feed changes (comments on posts / ads) ───────────────────────────────
    const changes = entry.changes ?? []
    for (const change of changes) {
      if (change.field !== 'feed') continue
      const v = change.value

      // Only handle new comments (verb=add, item=comment)
      if (v.verb !== 'add' || v.item !== 'comment') continue

      const commentId    = String(v.comment_id ?? '')
      const commentText  = String(v.message    ?? '')
      const postId       = String(v.post_id    ?? '')
      const from         = (v.from as Record<string, string> | undefined)
      const commenterName = from?.name ?? null

      if (!commentId || !commentText) continue

      await handleComment({
        supabase,
        agentId:        channel.agent_id,
        pageAccessToken: channel.page_access_token ?? '',
        commentId,
        commentText,
        commenterName,
        postId,
      }).catch(err => console.error('Comment handling failed:', err))
    }
  }
}

// ── Comment handler ───────────────────────────────────────────────────────────

async function handleComment({
  supabase,
  agentId,
  pageAccessToken,
  commentId,
  commentText,
  commenterName,
  postId,
}: {
  supabase: ReturnType<typeof db>
  agentId: string
  pageAccessToken: string
  commentId: string
  commentText: string
  commenterName: string | null
  postId: string
}) {
  // 1. Check if auto-reply is enabled for this agent
  const { data: rule } = await supabase
    .from('xenttech_comment_rules')
    .select('is_active, reply_to_ads, reply_to_organic, tone, custom_instruction, ignore_negative')
    .eq('agent_id', agentId)
    .maybeSingle()

  if (!rule?.is_active) return

  // 2. Deduplicate — never reply to the same comment twice
  const { data: existing } = await supabase
    .from('xenttech_comment_log')
    .select('id')
    .eq('comment_id', commentId)
    .maybeSingle()

  if (existing) return

  // 3. Load agent persona
  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('name, system_prompt')
    .eq('id', agentId)
    .maybeSingle()

  if (!agent) return

  // 4. Generate reply with Claude Haiku
  let replyText = ''
  let status    = 'sent'
  let errorMsg: string | null = null

  try {
    replyText = await generateCommentReply(agent, commentText, commenterName, rule)
  } catch (err) {
    status   = 'failed'
    errorMsg = (err as Error).message
    console.error('Comment reply generation failed:', err)
  }

  // 5. Skip if AI decided to ignore (negative comment policy)
  if (replyText === 'SKIP') {
    await supabase.from('xenttech_comment_log').insert({
      agent_id:       agentId,
      post_id:        postId || null,
      comment_id:     commentId,
      commenter_name: commenterName,
      comment_text:   commentText,
      reply_text:     null,
      status:         'skipped',
      error_message:  'Comentario ignorado por política de negativos',
    })
    return
  }

  // 6. Post reply to Facebook
  if (replyText) {
    const fbRes = await fetch(
      `https://graph.facebook.com/v22.0/${commentId}/comments`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:      replyText,
          access_token: pageAccessToken,
        }),
      }
    )
    if (!fbRes.ok) {
      const fbErr = await fbRes.json().catch(() => ({})) as Record<string, unknown>
      status   = 'failed'
      errorMsg = String((fbErr.error as Record<string, unknown>)?.message ?? fbRes.status)
    }
  }

  // 7. Log the attempt
  await supabase.from('xenttech_comment_log').insert({
    agent_id:       agentId,
    post_id:        postId || null,
    comment_id:     commentId,
    commenter_name: commenterName,
    comment_text:   commentText,
    reply_text:     replyText || null,
    status,
    error_message:  errorMsg,
  })
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  professional: 'Responde de forma profesional y cordial',
  friendly:     'Responde de forma cercana y amigable, como si conocieras al cliente',
  direct:       'Responde directo y conciso, máximo 1 oración',
  sales:        'Responde con interés genuino e invita sutilmente a contactarte por DM para más información',
}

async function generateCommentReply(
  agent: { name: string; system_prompt: string | null },
  commentText: string,
  commenterName: string | null,
  rule: {
    tone?:               string | null
    custom_instruction?: string | null
    ignore_negative?:    boolean
  }
): Promise<string> {
  const name            = commenterName ?? 'alguien'
  const toneInstruction = TONE_INSTRUCTIONS[rule.tone ?? 'professional'] ?? TONE_INSTRUCTIONS.professional
  const customLine      = rule.custom_instruction?.trim()
    ? `\nInstrucción adicional: ${rule.custom_instruction.trim()}`
    : ''
  const negativeLine    = rule.ignore_negative
    ? '\nSi el comentario es una queja, crítica negativa o insulto, responde ÚNICAMENTE con la palabra: SKIP'
    : ''

  const prompt = `Eres ${agent.name}.
${agent.system_prompt ?? 'Eres un asistente amigable y profesional.'}
${customLine}

Tono: ${toneInstruction}${negativeLine}

${name} comentó en tu publicación de Facebook:
"${commentText}"

REGLAS:
- Escribe UNA respuesta corta (máximo 1-2 oraciones)
- Sé natural y humano, como si respondiera el dueño del negocio
- Si hacen una pregunta de producto/precio, invítalos a escribir por DM: "Escríbenos por mensaje privado y te ayudamos"
- No uses hashtags ni emojis excesivos (máximo 1)
- No repitas el comentario
- Responde en el mismo idioma del comentario

Solo el texto de la respuesta, sin comillas ni explicaciones.`

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurado')
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:       'claude-haiku-4-5-20251001',
      max_tokens:  150,
      temperature: 0.7,
      messages:    [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic API ${res.status}`)

  const data = await res.json() as { content?: Array<{ text: string }> }
  const text = data.content?.[0]?.text?.trim() ?? ''
  if (!text) throw new Error('Respuesta vacía de Claude')

  return text
}
