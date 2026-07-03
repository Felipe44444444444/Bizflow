import { createClient } from '@supabase/supabase-js'
import { sanitizeResponse } from './human-voice'
import { sendWhatsAppAlert } from './lead-capture'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetargetingRule {
  id: string
  agent_id: string
  name: string
  is_active: boolean
  delay_minutes: number
  messages: Array<{ id: string; text: string; order: number }>
  message_strategy: 'random' | 'sequential'
  max_retargeting_per_conversation: number
  min_hours_between_retargeting: number
  apply_to_channels: string[]
}

export interface StaleConversation {
  conversationId: string
  contactId: string
  agentId: string
  channelType: string
  channelIdentifier: string
  contactName: string | null
  ruleId: string
  rule: RetargetingRule
  retargetingCount: number       // real sends only — TEST-FIRE excluded
  timeSilentMinutes: number
  convMessages: Array<{ role: string; content: string }>
}

export interface RetargetingReport {
  checked: number
  sent: number
  failed: number
  details: Array<{
    conversationId: string
    channelType: string
    status: 'sent' | 'failed' | 'skipped'
    message?: string
    error?: string
  }>
}

// ── AI message generation ─────────────────────────────────────────────────────

export async function generateRetargetingMessage(params: {
  agentId: string
  contactName: string | null
  channelType: string
  convMessages: Array<{ role: string; content: string }>
  timeSilentMinutes: number
  sendCount: number  // 0=suave, 1=urgente con valor, 2=último intento
  rule: RetargetingRule
}): Promise<string> {
  const supabase = db()

  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('name, system_prompt')
    .eq('id', params.agentId)
    .maybeSingle()

  // Fallback to static template if agent not found or no API key
  if (!agent || !process.env.ANTHROPIC_API_KEY) {
    return pickRetargetingMessage(params.rule, params.sendCount, params.contactName)
  }

  const tones = ['suave y amigable', 'urgente destacando el valor', 'último intento definitivo']
  const tone = tones[Math.min(params.sendCount, 2)]
  const silentHours = Math.max(1, Math.round(params.timeSilentMinutes / 60))

  const history = params.convMessages
    .slice(-10)
    .map(m => `${m.role === 'user' ? 'Cliente' : 'Bot'}: ${m.content}`)
    .join('\n')

  const userPrompt = `Eres ${agent.name}.

Tu personalidad e instrucciones: ${agent.system_prompt ?? 'Responde en español de forma amigable y profesional.'}

El cliente dejó de responder hace ${silentHours} hora${silentHours !== 1 ? 's' : ''}. Este es el historial:
${history || '(Sin mensajes previos)'}

Cliente: ${params.contactName ?? 'desconocido'} · Canal: ${params.channelType}

Escribe UN mensaje de seguimiento con tono "${tone}".
REGLAS:
- Máximo 2 oraciones
- No suenes robótico ni spam
- Referencia algo concreto de la conversación si hay historial
- Máximo 1 emoji
- No inventes información que no esté en el historial
- Habla como hablaría ${agent.name}

Responde SOLO con el mensaje, sin comillas ni explicaciones.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:       'claude-haiku-4-5-20251001',
        max_tokens:  200,
        temperature: 0.7,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) throw new Error(`Anthropic ${res.status}`)

    const data = await res.json()
    const text = (data.content?.[0]?.text ?? '').trim()
    if (!text) throw new Error('Empty response')

    return sanitizeResponse(text)
  } catch (err) {
    console.error('generateRetargetingMessage failed, using template fallback:', err)
    return pickRetargetingMessage(params.rule, params.sendCount, params.contactName)
  }
}

// ── Find stale conversations ──────────────────────────────────────────────────

export async function findStaleConversations(): Promise<StaleConversation[]> {
  const supabase = db()

  const { data: rules } = await supabase
    .from('xenttech_retargeting_rules')
    .select('*')
    .eq('is_active', true)

  if (!rules?.length) return []

  const agentIds = [...new Set(rules.map((r: RetargetingRule) => r.agent_id))]

  // No updated_at filter at DB level — retargeting sends update updated_at,
  // so we'd incorrectly exclude conversations awaiting a second follow-up.
  // Staleness is determined in JS using the last USER message timestamp.
  const { data: convs } = await supabase
    .from('xenttech_conversations')
    .select('id, contact_id, agent_id, channel_type, contact_name, contact_phone, messages, updated_at')
    .eq('status', 'active')
    .in('agent_id', agentIds)
    .not('contact_phone', 'is', null)   // must have a sender identifier
    .order('updated_at', { ascending: false })
    .limit(500)

  if (!convs?.length) return []

  const convIds = convs.map(c => c.id)

  // Only count real sends — exclude TEST-FIRE logs
  const { data: logs } = await supabase
    .from('xenttech_retargeting_log')
    .select('conversation_id, sent_at, status, error_message')
    .in('conversation_id', convIds)
    .eq('status', 'sent')
    .not('error_message', 'like', '%[TEST-FIRE]%')

  const logMap: Record<string, { count: number; lastSentAt: string | null }> = {}
  for (const log of logs ?? []) {
    const entry = logMap[log.conversation_id]
    if (!entry) {
      logMap[log.conversation_id] = { count: 1, lastSentAt: log.sent_at }
    } else {
      entry.count++
      if (!entry.lastSentAt || log.sent_at > entry.lastSentAt) {
        entry.lastSentAt = log.sent_at
      }
    }
  }

  // Count real failures per conversation to detect permanently broken channels.
  // Error #100 (invalid PSID), blocked users, etc. will never succeed on retry.
  const { data: failedLogs } = await supabase
    .from('xenttech_retargeting_log')
    .select('conversation_id, error_message')
    .in('conversation_id', convIds)
    .eq('status', 'failed')
    .not('error_message', 'like', '%[TEST-FIRE]%')

  const failedMap: Record<string, { count: number; lastError: string | null }> = {}
  for (const log of failedLogs ?? []) {
    const entry = failedMap[log.conversation_id]
    if (!entry) {
      failedMap[log.conversation_id] = { count: 1, lastError: log.error_message ?? null }
    } else {
      entry.count++
    }
  }

  type Msg = { role: string; content: string; timestamp?: string }
  const result: StaleConversation[] = []

  for (const conv of convs) {
    const msgs = (conv.messages ?? []) as Msg[]

    // Find the last message sent by the USER (search backwards).
    // We intentionally look past any retargeting/assistant messages that were
    // appended after the user went silent — those don't reset the staleness clock.
    let lastUserAt = 0
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserAt = msgs[i].timestamp
          ? new Date(msgs[i].timestamp!).getTime()
          : new Date(conv.updated_at).getTime()
        break
      }
    }
    if (!lastUserAt) continue   // conversation has no user message yet

    const timeSilentMs      = Date.now() - lastUserAt
    const timeSilentMinutes = timeSilentMs / 60_000

    const matchingRule = (rules as RetargetingRule[]).find(r =>
      r.agent_id === conv.agent_id &&
      r.apply_to_channels.includes(conv.channel_type) &&
      timeSilentMinutes >= r.delay_minutes
    )
    if (!matchingRule) continue

    const logInfo = logMap[conv.id] ?? { count: 0, lastSentAt: null }

    if (logInfo.count >= matchingRule.max_retargeting_per_conversation) continue

    // 2+ failures = permanently broken channel/PSID, stop wasting API quota
    const failedEntry = failedMap[conv.id]
    const failedCount = failedEntry?.count ?? 0
    if (failedCount >= 2) {
      // Best-effort lead update (0 rows affected is fine if no lead exists)
      await supabase
        .from('xenttech_leads')
        .update({ status: 'failed_permanent' })
        .eq('contact_id', conv.contact_id)
        .eq('agent_id', conv.agent_id)
        .neq('status', 'convertido')

      // Alert exactly once — when 2nd failure is first detected this run
      if (failedCount === 2) {
        const { data: agent } = await supabase
          .from('xenttech_agents')
          .select('notification_phone')
          .eq('id', conv.agent_id)
          .maybeSingle()

        if (agent?.notification_phone) {
          const razon = failedEntry?.lastError ?? 'desconocido'
          const alerta = [
            `⚠️ Retargeting falló permanentemente`,
            `Lead: ${conv.contact_name ?? 'sin nombre'}`,
            `Conversación: ${conv.id}`,
            `Razón: ${razon}`,
            `Esta conversación ya no recibirá más intentos.`,
          ].join('\n')
          await sendWhatsAppAlert(agent.notification_phone, alerta)
        }
      }

      continue
    }

    if (logInfo.lastSentAt) {
      const hoursSinceLast = (Date.now() - new Date(logInfo.lastSentAt).getTime()) / 3_600_000
      if (hoursSinceLast < matchingRule.min_hours_between_retargeting) continue
    }

    // Use contact_phone directly — it stores the PSID/phone needed to send
    const channelIdentifier = conv.contact_phone as string
    if (!channelIdentifier) continue

    const convMessages = msgs.map(m => ({ role: m.role, content: m.content }))

    result.push({
      conversationId:    conv.id,
      contactId:         conv.contact_id,
      agentId:           conv.agent_id,
      channelType:       conv.channel_type,
      channelIdentifier,
      contactName:       conv.contact_name ?? null,
      ruleId:            matchingRule.id,
      rule:              matchingRule,
      retargetingCount:  logInfo.count,
      timeSilentMinutes,
      convMessages,
    })
  }

  return result
}

// ── Pick static message (fallback) ───────────────────────────────────────────

export function pickRetargetingMessage(
  rule: RetargetingRule,
  retargetingCount: number,
  contactName?: string | null
): string {
  const msgs = rule.messages
  if (!msgs.length) return ''

  let template: string
  if (rule.message_strategy === 'sequential') {
    const sorted = [...msgs].sort((a, b) => a.order - b.order)
    template = sorted[retargetingCount % sorted.length].text
  } else {
    template = msgs[Math.floor(Math.random() * msgs.length)].text
  }

  const name = contactName?.trim()
  const filled = name
    ? template.replace(/\{nombre\}/gi, name)
    : template.replace(/,?\s*\{nombre\}/gi, '').replace(/\{nombre\},?\s*/gi, '')

  return sanitizeResponse(filled)
}

// ── Send via the right channel ────────────────────────────────────────────────

async function sendViaFacebook(
  channelIdentifier: string,
  pageAccessToken: string,
  message: string
): Promise<void> {
  // Try RESPONSE first (within 24h window), fall back to POST_PURCHASE_UPDATE
  const attempt1 = await fetch(
    `https://graph.facebook.com/v22.0/me/messages?access_token=${pageAccessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_type: 'RESPONSE',
        recipient: { id: channelIdentifier },
        message: { text: message },
      }),
    }
  )
  if (attempt1.ok) return

  const err1 = await attempt1.json().catch(() => ({}))
  const code = (err1?.error?.code as number) ?? 0
  if ([10, 200, 613].includes(code)) {
    const attempt2 = await fetch(
      `https://graph.facebook.com/v22.0/me/messages?access_token=${pageAccessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_type: 'MESSAGE_TAG',
          tag: 'POST_PURCHASE_UPDATE',
          recipient: { id: channelIdentifier },
          message: { text: message },
        }),
      }
    )
    if (attempt2.ok) return
    const err2 = await attempt2.json().catch(() => ({}))
    throw new Error(`Facebook API (tagged): ${err2?.error?.message ?? attempt2.status}`)
  }

  throw new Error(`Facebook API: ${err1?.error?.message ?? attempt1.status}`)
}

async function sendViaInstagram(
  channelIdentifier: string,
  pageAccessToken: string,
  message: string
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v22.0/me/messages?access_token=${pageAccessToken}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_type: 'MESSAGE_TAG',
        tag:            'POST_PURCHASE_UPDATE',
        recipient:      { id: channelIdentifier },
        message:        { text: message },
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Instagram API ${res.status}: ${body}`)
  }
}

async function sendViaWhatsApp(
  channelIdentifier: string,
  pageAccessToken: string,
  phoneNumberId: string,
  message: string
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${pageAccessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                channelIdentifier,
        type:              'text',
        text:              { body: message },
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`WhatsApp API ${res.status}: ${body}`)
  }
}

export async function sendRetargetingMessage(
  stale: StaleConversation,
  message: string
): Promise<boolean> {
  const supabase = db()

  const { data: channel } = await supabase
    .from('xenttech_channels')
    .select('page_access_token, whatsapp_phone_number_id')
    .eq('agent_id', stale.agentId)
    .eq('channel_type', stale.channelType)
    .eq('is_connected', true)
    .maybeSingle()

  let success = false
  let errorMsg: string | undefined

  try {
    if (!channel?.page_access_token) throw new Error('No channel credentials found')

    switch (stale.channelType) {
      case 'facebook':
        await sendViaFacebook(stale.channelIdentifier, channel.page_access_token, message)
        break
      case 'instagram':
        await sendViaInstagram(stale.channelIdentifier, channel.page_access_token, message)
        break
      case 'whatsapp':
        if (!channel.whatsapp_phone_number_id) throw new Error('No WhatsApp phone_number_id')
        await sendViaWhatsApp(
          stale.channelIdentifier,
          channel.page_access_token,
          channel.whatsapp_phone_number_id,
          message
        )
        break
      default:
        throw new Error(`Unsupported channel for retargeting: ${stale.channelType}`)
    }

    success = true
  } catch (err) {
    errorMsg = (err as Error).message
    console.error(`Retargeting send failed [${stale.channelType}] conv=${stale.conversationId}:`, err)
  }

  await supabase.from('xenttech_retargeting_log').insert({
    rule_id:            stale.ruleId,
    conversation_id:    stale.conversationId,
    contact_id:         stale.contactId,
    agent_id:           stale.agentId,
    message_sent:       message,
    channel_type:       stale.channelType,
    channel_identifier: stale.channelIdentifier,
    status:             success ? 'sent' : 'failed',
    error_message:      errorMsg ?? null,
  })

  if (success) {
    // Append to conversation history for context continuity
    const { data: conv } = await supabase
      .from('xenttech_conversations')
      .select('messages')
      .eq('id', stale.conversationId)
      .maybeSingle()

    if (conv) {
      type Msg = { role: string; content: string; timestamp: string; retargeting?: boolean }
      const msgs: Msg[] = conv.messages ?? []
      msgs.push({
        role:        'assistant',
        content:     message,
        timestamp:   new Date().toISOString(),
        retargeting: true,
      })
      await supabase
        .from('xenttech_conversations')
        .update({ messages: msgs, updated_at: new Date().toISOString() })
        .eq('id', stale.conversationId)
    }

    // Mark lead as exhausted when this was the last allowed follow-up
    const newCount = stale.retargetingCount + 1
    if (newCount >= stale.rule.max_retargeting_per_conversation) {
      await supabase
        .from('xenttech_leads')
        .update({ status: 'agotado' })
        .eq('contact_id', stale.contactId)
        .eq('agent_id', stale.agentId)
        .neq('status', 'convertido')  // never downgrade a converted lead
    }
  }

  return success
}

// ── Main cycle (called by cron) ───────────────────────────────────────────────

export async function runRetargetingCycle(): Promise<RetargetingReport> {
  const staleConvs = await findStaleConversations()

  const report: RetargetingReport = {
    checked: staleConvs.length,
    sent:    0,
    failed:  0,
    details: [],
  }

  for (const stale of staleConvs) {
    let message: string

    try {
      message = await generateRetargetingMessage({
        agentId:           stale.agentId,
        contactName:       stale.contactName,
        channelType:       stale.channelType,
        convMessages:      stale.convMessages,
        timeSilentMinutes: stale.timeSilentMinutes,
        sendCount:         stale.retargetingCount,
        rule:              stale.rule,
      })
    } catch {
      message = pickRetargetingMessage(stale.rule, stale.retargetingCount, stale.contactName)
    }

    if (!message) {
      report.details.push({
        conversationId: stale.conversationId,
        channelType:    stale.channelType,
        status:         'skipped',
        error:          'No message generated',
      })
      continue
    }

    const ok = await sendRetargetingMessage(stale, message)

    if (ok) {
      report.sent++
      report.details.push({ conversationId: stale.conversationId, channelType: stale.channelType, status: 'sent', message })
    } else {
      report.failed++
      report.details.push({ conversationId: stale.conversationId, channelType: stale.channelType, status: 'failed', message })
    }
  }

  return report
}
