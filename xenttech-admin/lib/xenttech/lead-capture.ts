import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ── Extraction ────────────────────────────────────────────────────────────────

const PHONE_RE = [
  // +52 with optional spaces/parens: +52 614 123 4567, +52(614)1234567
  /\+?52[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}/,
  // 10-digit groups with separators: 614-123-4567, 614 123 4567
  /\b\d{3}[\s\-]\d{3}[\s\-]\d{4}\b/,
  // Plain 10 digits: 6141234567
  /\b\d{10}\b/,
  // 11 digits starting with 1 (US) or 52 (MX without +): 526141234567
  /\b(?:1|52)\d{10}\b/,
]

const NAME_RE = [
  /(?:me llamo|mi nombre es|nombre\s*[:=]?)\s*([A-ZÁÉÍÓÚÑÜÀ-Ý][a-záéíóúñüà-ý]+(?:\s+[A-ZÁÉÍÓÚÑÜÀ-Ý][a-záéíóúñüà-ý]+)*)/i,
  /\bsoy\s+([A-ZÁÉÍÓÚÑÜÀ-Ý][a-záéíóúñüà-ý]+(?:\s+[A-ZÁÉÍÓÚÑÜÀ-Ý][a-záéíóúñüà-ý]+)?)\b/,
]

// Common words that aren't names
const NOT_A_NAME = new Set([
  'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches',
  'soy', 'claro', 'ok', 'si', 'no', 'aqui', 'gracias',
  'interesado', 'interesada', 'quiero', 'puedo', 'quería',
])

export function extractLeadData(message: string): {
  nombre?: string
  telefono?: string
  email?: string
  hasData: boolean
} {
  const result: { nombre?: string; telefono?: string; email?: string; hasData: boolean } = {
    hasData: false,
  }

  // Phone
  for (const re of PHONE_RE) {
    const m = message.match(re)
    if (m) {
      result.telefono = m[0].replace(/[\s\-()]/g, '')
      break
    }
  }

  // Email
  const emailMatch = message.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
  if (emailMatch) result.email = emailMatch[0].toLowerCase()

  // Name — explicit patterns first
  for (const re of NAME_RE) {
    const m = message.match(re)
    if (m) {
      result.nombre = m[1].trim()
      break
    }
  }

  // Name — heuristic: short message (<= 5 words) + phone → non-phone words are name
  if (!result.nombre && result.telefono) {
    const withoutPhone = message.replace(result.telefono, '').replace(/[^\wáéíóúñüÁÉÍÓÚÑÜ\s]/g, ' ').trim()
    const words = withoutPhone.split(/\s+/).filter(Boolean)
    if (words.length <= 5) {
      const candidates = words.filter(
        w => /^[A-ZÁÉÍÓÚÑÜÀ-Ý]/i.test(w) && w.length > 2 && !NOT_A_NAME.has(w.toLowerCase())
      )
      if (candidates.length > 0 && candidates.length <= 3) {
        result.nombre = candidates.join(' ')
      }
    }
  }

  result.hasData = !!(result.telefono || result.email)
  return result
}

// ── Trigger detection ─────────────────────────────────────────────────────────

const LEAD_TRIGGERS = [
  'nombre y teléfono',
  'nombre y número',
  'nombre y tel',
  '¿cómo te llamas',
  'como te llamas',
  'déjame tus datos',
  'dejame tus datos',
  'tu nombre y',
  'agendemos',
  'agendar una llamada',
  'agendar llamada',
  'te contactamos',
  'uno de nuestros asesores',
  'nuestro equipo te llama',
  'tu teléfono',
  'tu número',
  'tu numero',
  'número de teléfono',
]

type ConvMsg = { role: string; content: string }

// Checks if the bot recently asked for contact data (last 2 bot messages)
export function isAwaitingLeadData(messages: ConvMsg[]): boolean {
  const botMessages = messages
    .filter(m => m.role === 'assistant')
    .slice(-2)
    .map(m => m.content.toLowerCase())

  return botMessages.some(text => LEAD_TRIGGERS.some(trigger => text.includes(trigger)))
}

// ── Persistence ───────────────────────────────────────────────────────────────

export interface SaveLeadParams {
  agentId: string
  clientId: string | null
  contactId: string
  nombre?: string
  telefono?: string
  email?: string
  canal: string
  canalIdentifier: string
  sourceMessage: string
  conversationSummary?: string
}

export async function saveLead(params: SaveLeadParams): Promise<string> {
  const supabase = db()

  // Avoid duplicates: check if there's already a lead for this contact from
  // the same agent within the last 24 hours with the same phone/email
  if (params.telefono || params.email) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    let query = supabase
      .from('xenttech_leads')
      .select('id')
      .eq('agent_id', params.agentId)
      .eq('contact_id', params.contactId)
      .gte('captured_at', since)

    if (params.telefono) query = query.eq('telefono', params.telefono)

    const { data: existing } = await query.maybeSingle()
    if (existing?.id) return existing.id
  }

  const { data, error } = await supabase
    .from('xenttech_leads')
    .insert({
      agent_id:             params.agentId,
      client_id:            params.clientId,
      contact_id:           params.contactId,
      nombre:               params.nombre ?? null,
      telefono:             params.telefono ?? null,
      email:                params.email ?? null,
      canal:                params.canal,
      canal_identifier:     params.canalIdentifier,
      source_message:       params.sourceMessage,
      conversation_summary: params.conversationSummary ?? null,
      interest_level:       'medium',
      status:               'nuevo',
    })
    .select('id')
    .single()

  if (error) throw new Error(`saveLead: ${error.message}`)
  return data.id
}

// ── Post-capture actions ──────────────────────────────────────────────────────

export async function notifyLeadCaptured(params: {
  contactId: string
  telefono?: string
  email?: string
  nombre?: string
  agentId?: string
  canal?: string
  conversationId?: string
}): Promise<void> {
  const supabase = db()

  // 1. Enrich contact record with any new data (non-destructive)
  if (params.telefono || params.email || params.nombre) {
    const { data: contact } = await supabase
      .from('xenttech_contacts')
      .select('phone, email, canonical_name')
      .eq('id', params.contactId)
      .maybeSingle()

    const patch: Record<string, string> = {}
    if (params.telefono && !contact?.phone)          patch.phone          = params.telefono
    if (params.email    && !contact?.email)          patch.email          = params.email
    if (params.nombre   && !contact?.canonical_name) patch.canonical_name = params.nombre

    if (Object.keys(patch).length) {
      await supabase.from('xenttech_contacts').update(patch).eq('id', params.contactId)
    }
  }

  // 2. Update conversation record with extracted name/phone
  if (params.conversationId && (params.nombre || params.telefono)) {
    const convPatch: Record<string, string> = {}
    if (params.nombre)   convPatch.contact_name  = params.nombre
    if (params.telefono) convPatch.contact_phone = params.telefono

    await supabase
      .from('xenttech_conversations')
      .update(convPatch)
      .eq('id', params.conversationId)
  }

  // 3. Notify seller once both name + phone are captured (guard via notified_at)
  if (params.agentId && params.conversationId) {
    void checkAndNotify(params.conversationId, params.agentId, {
      name:  params.nombre,
      phone: params.telefono,
      canal: params.canal ?? 'desconocido',
    })
  }
}

// ── WhatsApp notification to agent owner ─────────────────────────────────────

// Fires at most once per conversation — uses notified_at as distributed lock.
async function checkAndNotify(
  conversationId: string,
  agentId: string,
  leadData: { name?: string; phone?: string; canal: string }
): Promise<void> {
  // Must have both name and phone before notifying
  if (!leadData.name || !leadData.phone) return

  const supabase = db()

  // Conditional update: only claims the row if notified_at IS NULL.
  // Returns the updated row if we won the race; empty array if already claimed.
  const { data: claimed } = await supabase
    .from('xenttech_conversations')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', conversationId)
    .is('notified_at', null)
    .select('channel_type, contact_phone, messages')

  if (!claimed?.length) return  // another invocation already sent the notification

  const conv = claimed[0]
  const psid = (conv.channel_type === 'facebook' || conv.channel_type === 'instagram')
    ? (conv.contact_phone as string | null)
    : null

  await notifyAgentWhatsApp(agentId, {
    name:           leadData.name,
    phone:          leadData.phone,
    channel:        leadData.canal,
    psid,
    conversationId,
    messages:       (conv.messages ?? []) as Array<{ role: string; content: string }>,
  })
}

export async function notifyAgentWhatsApp(
  agentId: string,
  leadData: {
    name?: string
    phone?: string
    channel: string
    psid?: string | null
    conversationId?: string
    messages?: Array<{ role: string; content: string }>
  }
): Promise<void> {
  const supabase = db()

  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('notification_phone, name')
    .eq('id', agentId)
    .maybeSingle()

  if (!agent?.notification_phone) return

  const to   = agent.notification_phone.replace(/\D/g, '')
  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Chihuahua' })

  // Last 5 messages from conversation JSONB array
  const recentMsgs = (leadData.messages ?? []).slice(-5)
  const resumen = recentMsgs.length
    ? recentMsgs
        .map(m => `${m.role === 'user' ? '👤' : '🤖'}: ${m.content.slice(0, 120)}`)
        .join('\n')
    : '(sin mensajes previos)'

  const waLink = leadData.phone
    ? `https://wa.me/${leadData.phone.replace(/\D/g, '')}`
    : null

  const fbLink = leadData.psid
    ? `https://m.me/${leadData.psid}`
    : null

  const body = [
    `🔥 *LEAD LISTO PARA CERRAR*`,
    `─────────────────────`,
    `👤 *${leadData.name ?? 'Sin nombre'}*`,
    leadData.phone ? `📱 ${leadData.phone}` : null,
    `📍 Canal: ${leadData.channel}`,
    `🕐 ${hora}`,
    ``,
    `💬 *Últimos mensajes:*`,
    resumen,
    ``,
    `─────────────────────`,
    waLink ? `👆 Escríbele AHORA: ${waLink}` : null,
    fbLink ? `💬 Facebook: ${fbLink}` : null,
    ``,
    `⚡ Este lead está caliente. Contáctalo en los próximos 5 minutos.`,
  ].filter((l): l is string => l !== null).join('\n')

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token         = process.env.WHATSAPP_TOKEN

  if (!phoneNumberId || !token) {
    console.warn('notifyAgentWhatsApp: WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TOKEN not set')
    return
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        }),
      }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('notifyAgentWhatsApp failed:', err)
    }
  } catch (err) {
    console.error('notifyAgentWhatsApp network error:', err)
  }

  // Mark lead as calificado — ready for human close
  if (leadData.conversationId) {
    await supabase
      .from('xenttech_leads')
      .update({
        status: 'calificado',
        metadata: {
          qualified_at:   new Date().toISOString(),
          notified_phone: agent.notification_phone,
          wa_link:        waLink,
          fb_link:        fbLink,
        },
      })
      .eq('conversation_id', leadData.conversationId)
      .neq('status', 'convertido')
  }
}

// ── Low-level WhatsApp send (reusable by other modules) ───────────────────────

export async function sendWhatsAppAlert(to: string, body: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token         = process.env.WHATSAPP_TOKEN

  if (!phoneNumberId || !token) {
    console.warn('sendWhatsAppAlert: WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TOKEN not set')
    return
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to.replace(/\D/g, ''),
          type: 'text',
          text: { body },
        }),
      }
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('sendWhatsAppAlert failed:', err)
    }
  } catch (err) {
    console.error('sendWhatsAppAlert network error:', err)
  }
}
