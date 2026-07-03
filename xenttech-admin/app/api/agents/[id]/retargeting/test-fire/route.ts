import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { pickRetargetingMessage, generateRetargetingMessage } from '@/lib/xenttech/retargeting'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ── Token verification ────────────────────────────────────────────────────────

async function verifyToken(token: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/me?access_token=${token}`
    )
    const body = await res.json()
    if (!res.ok) {
      const code = body?.error?.code
      if (code === 190) return { valid: false, error: 'TOKEN_EXPIRED' }
      return { valid: false, error: body?.error?.message ?? 'TOKEN_INVALID' }
    }
    return { valid: true }
  } catch {
    return { valid: false, error: 'TOKEN_UNREACHABLE' }
  }
}

// ── Facebook send with fallback strategy ──────────────────────────────────────

interface SendResult {
  ok: boolean
  body: Record<string, unknown>
  errorCode?: number
}

async function postToMessenger(
  psid: string,
  token: string,
  message: string,
  strategy: 'RESPONSE' | 'POST_PURCHASE_UPDATE'
): Promise<SendResult> {
  const payload =
    strategy === 'RESPONSE'
      ? {
          messaging_type: 'RESPONSE',
          recipient:      { id: psid },
          message:        { text: message },
        }
      : {
          messaging_type: 'MESSAGE_TAG',
          tag:            'POST_PURCHASE_UPDATE',
          recipient:      { id: psid },
          message:        { text: message },
        }

  const res = await fetch(
    `https://graph.facebook.com/v22.0/me/messages?access_token=${token}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }
  )
  const body = await res.json()
  return {
    ok:        res.ok,
    body:      body as Record<string, unknown>,
    errorCode: body?.error?.code as number | undefined,
  }
}

async function sendViaFacebook(
  psid: string,
  token: string,
  message: string
): Promise<Record<string, unknown>> {
  // Intento 1: RESPONSE (funciona dentro de la ventana de 24h)
  const attempt1 = await postToMessenger(psid, token, message, 'RESPONSE')
  if (attempt1.ok) return attempt1.body

  // Error 10 o 200 = fuera de ventana / permiso denegado → probar tag
  const windowCodes = new Set([10, 200, 613])
  if (windowCodes.has(attempt1.errorCode ?? 0)) {
    // Intento 2: POST_PURCHASE_UPDATE tag (más permisivo que ACCOUNT_UPDATE)
    const attempt2 = await postToMessenger(psid, token, message, 'POST_PURCHASE_UPDATE')
    if (attempt2.ok) return attempt2.body

    // Ambos fallaron — ventana expirada sin tag aprobado
    const metaError =
      (attempt2.body?.error as Record<string, unknown>)?.message ??
      JSON.stringify(attempt2.body)
    const err = new Error('WINDOW_EXPIRED') as Error & { metaError: string }
    err.metaError = String(metaError)
    throw err
  }

  // Otro error (PSID inválido, parámetro, etc.)
  const detail =
    (attempt1.body?.error as Record<string, unknown>)?.message ??
    JSON.stringify(attempt1.body)
  throw new Error(String(detail))
}

async function sendViaWhatsApp(
  phone: string,
  token: string,
  phoneNumberId: string,
  message: string
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                phone,
        type:              'text',
        text:              { body: message },
      }),
    }
  )
  const body = await res.json()
  if (!res.ok) {
    const detail = (body?.error as Record<string, unknown>)?.message ?? JSON.stringify(body)
    throw new Error(String(detail))
  }
  return body as Record<string, unknown>
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const supabase = db()

  // 1. Get the agent's first active retargeting rule
  const { data: rules } = await supabase
    .from('xenttech_retargeting_rules')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)

  if (!rules?.length) {
    return NextResponse.json(
      { error: 'No hay reglas de retargeting activas. Crea una regla primero.' },
      { status: 400 }
    )
  }
  const rule = rules[0]

  // 2. Most recent social conversation with a known sender ID
  const { data: conv } = await supabase
    .from('xenttech_conversations')
    .select(`
      id, contact_name, contact_id, channel_type, contact_phone, updated_at, messages,
      xenttech_channels!channel_id (
        page_access_token,
        whatsapp_phone_number_id,
        channel_type
      )
    `)
    .eq('agent_id', agentId)
    .in('channel_type', ['facebook', 'instagram', 'whatsapp'])
    .not('contact_phone', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conv) {
    return NextResponse.json(
      { error: 'No se encontró ninguna conversación de Facebook/Instagram/WhatsApp. Inicia una conversación primero.' },
      { status: 404 }
    )
  }

  const channel = Array.isArray(conv.xenttech_channels)
    ? conv.xenttech_channels[0]
    : conv.xenttech_channels

  if (!channel?.page_access_token) {
    return NextResponse.json(
      { error: 'El canal no tiene token de acceso. Reconecta el canal en la sección Canales.' },
      { status: 400 }
    )
  }

  // 3. Verify token before attempting send
  const tokenCheck = await verifyToken(channel.page_access_token)
  if (!tokenCheck.valid) {
    if (tokenCheck.error === 'TOKEN_EXPIRED') {
      return NextResponse.json(
        {
          success: false,
          error:   'TOKEN_EXPIRED',
          action:  'Reconecta el canal Facebook desde la sección Canales.',
        },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { success: false, error: tokenCheck.error ?? 'TOKEN_INVALID' },
      { status: 401 }
    )
  }

  const recipientId = conv.contact_phone
  const contactName = conv.contact_name ?? null

  // 4. Generate AI message (falls back to static template)
  type ConvMsg = { role: string; content: string }
  const convMessages: ConvMsg[] = ((conv.messages ?? []) as ConvMsg[]).map(m => ({
    role:    m.role,
    content: m.content,
  }))

  const timeSilentMinutes = (Date.now() - new Date(conv.updated_at).getTime()) / 60_000

  const messageText = await generateRetargetingMessage({
    agentId:           agentId,
    contactName,
    channelType:       conv.channel_type,
    convMessages,
    timeSilentMinutes,
    sendCount:         0,
    rule,
  }).catch(() => pickRetargetingMessage(rule, 0, contactName))

  if (!messageText) {
    return NextResponse.json(
      { error: 'La regla no tiene mensajes configurados.' },
      { status: 400 }
    )
  }

  // 5. Send with fallback strategy
  let messengerResponse: Record<string, unknown> = {}
  try {
    if (conv.channel_type === 'whatsapp') {
      if (!channel.whatsapp_phone_number_id) {
        return NextResponse.json({ error: 'No hay phone_number_id de WhatsApp configurado.' }, { status: 400 })
      }
      messengerResponse = await sendViaWhatsApp(
        recipientId,
        channel.page_access_token,
        channel.whatsapp_phone_number_id,
        messageText
      )
    } else {
      // facebook or instagram
      messengerResponse = await sendViaFacebook(recipientId, channel.page_access_token, messageText)
    }
  } catch (err) {
    const e = err as Error & { metaError?: string }
    const isWindowError = e.message === 'WINDOW_EXPIRED'

    await supabase.from('xenttech_retargeting_log').insert({
      rule_id:            rule.id,
      conversation_id:    conv.id,
      contact_id:         conv.contact_id ?? null,
      agent_id:           agentId,
      message_sent:       messageText,
      channel_type:       conv.channel_type,
      channel_identifier: recipientId,
      status:             'failed',
      error_message:      `[TEST-FIRE] ${isWindowError ? 'WINDOW_EXPIRED' : e.message}`,
    })

    if (isWindowError) {
      return NextResponse.json(
        {
          success:    false,
          error:      'WINDOW_EXPIRED',
          meta_error: e.metaError ?? '',
        },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { success: false, error: e.message },
      { status: 502 }
    )
  }

  // 6. Log success
  await supabase.from('xenttech_retargeting_log').insert({
    rule_id:            rule.id,
    conversation_id:    conv.id,
    contact_id:         conv.contact_id ?? null,
    agent_id:           agentId,
    message_sent:       messageText,
    channel_type:       conv.channel_type,
    channel_identifier: recipientId,
    status:             'sent',
    error_message:      '[TEST-FIRE]',
  })

  // 7. Append to conversation thread
  const { data: convMsgs } = await supabase
    .from('xenttech_conversations')
    .select('messages')
    .eq('id', conv.id)
    .maybeSingle()

  if (convMsgs) {
    type Msg = { role: string; content: string; timestamp: string; retargeting?: boolean }
    const msgs: Msg[] = convMsgs.messages ?? []
    msgs.push({ role: 'assistant', content: messageText, timestamp: new Date().toISOString(), retargeting: true })
    await supabase
      .from('xenttech_conversations')
      .update({ messages: msgs, updated_at: new Date().toISOString() })
      .eq('id', conv.id)
  }

  return NextResponse.json({
    success:            true,
    conversation_id:    conv.id,
    recipient_name:     contactName ?? 'Desconocido',
    channel:            conv.channel_type,
    message_sent:       messageText,
    messenger_response: messengerResponse,
  })
}
