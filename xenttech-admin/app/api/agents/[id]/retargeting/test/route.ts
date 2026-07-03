import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  findStaleConversations,
  pickRetargetingMessage,
  sendRetargetingMessage,
} from '@/lib/xenttech/retargeting'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// POST — dry-run or live test for a specific agent
// Body: { send: boolean }  — default dry run
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const body    = await req.json().catch(() => ({}))
  const doSend  = body?.send === true

  const all        = await findStaleConversations()
  const agentConvs = all.filter(c => c.agentId === agentId)

  if (!doSend) {
    // If no stale conversations, build a debug snapshot so the UI can
    // tell the user how close they are to triggering retargeting.
    let debug: RetargetingDebug | null = null
    if (agentConvs.length === 0) {
      debug = await buildDebugInfo(agentId)
    }

    return NextResponse.json({
      would_send: agentConvs.length,
      preview: agentConvs.map(c => ({
        conversationId:    c.conversationId,
        contactName:       c.contactName,
        channelType:       c.channelType,
        channelIdentifier: c.channelIdentifier,
        timeSilentMinutes: Math.round(c.timeSilentMinutes),
        retargetingCount:  c.retargetingCount,
        message:           pickRetargetingMessage(c.rule, c.retargetingCount, c.contactName),
      })),
      debug,
    })
  }

  // Live send
  const details: Array<{ conversationId: string; channelType: string; status: string; message: string }> = []
  let sent = 0, failed = 0

  for (const stale of agentConvs) {
    const message = pickRetargetingMessage(stale.rule, stale.retargetingCount, stale.contactName)
    if (!message) continue
    const ok = await sendRetargetingMessage(stale, message)
    if (ok) sent++; else failed++
    details.push({ conversationId: stale.conversationId, channelType: stale.channelType, status: ok ? 'sent' : 'failed', message })
  }

  return NextResponse.json({ success: true, report: { sent, failed, details } })
}

// ── Debug snapshot when 0 stale conversations ─────────────────────────────────

interface RetargetingDebug {
  totalConversations: number
  activeRuleDelay:    number | null
  nearest: {
    contactName:       string
    channelType:       string
    minutesSilent:     number
    lastRole:          string
    minutesUntilReady: number
  } | null
  reason: string
}

async function buildDebugInfo(agentId: string): Promise<RetargetingDebug> {
  const supabase = db()

  const [convRes, ruleRes] = await Promise.all([
    supabase
      .from('xenttech_conversations')
      .select('id, contact_name, channel_type, updated_at, messages, status')
      .eq('agent_id', agentId)
      .in('channel_type', ['facebook', 'instagram', 'whatsapp'])
      .order('updated_at', { ascending: false })
      .limit(10),

    supabase
      .from('xenttech_retargeting_rules')
      .select('delay_minutes, apply_to_channels, is_active')
      .eq('agent_id', agentId)
      .eq('is_active', true)
      .order('delay_minutes', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const convs = convRes.data ?? []
  const rule  = ruleRes.data

  const activeRuleDelay = rule?.delay_minutes ?? null

  if (!convs.length) {
    return {
      totalConversations: 0,
      activeRuleDelay,
      nearest: null,
      reason: !rule
        ? 'No hay reglas activas para este agente.'
        : 'No hay conversaciones de Facebook/Instagram/WhatsApp para este agente todavía.',
    }
  }

  // Find the most relevant candidate
  type Msg = { role: string }
  const nearest = convs[0]
  const msgs     = (nearest.messages ?? []) as Msg[]
  const lastRole = msgs.at(-1)?.role ?? 'unknown'
  const minutesSilent = (Date.now() - new Date(nearest.updated_at).getTime()) / 60_000

  let reason = ''
  if (!rule) {
    reason = 'No hay reglas de retargeting activas. Crea y activa una regla.'
  } else if (lastRole !== 'user') {
    reason = `La última respuesta fue del bot. El sistema espera que el usuario responda primero antes de hacer retargeting.`
  } else if (minutesSilent < (rule.delay_minutes ?? 0)) {
    const left = Math.ceil((rule.delay_minutes ?? 0) - minutesSilent)
    reason = `La conversación lleva ${Math.round(minutesSilent)} min en silencio. Faltan ${left} min para cumplir el criterio.`
  } else {
    reason = 'Las conversaciones candidatas no tienen identificador de canal (PSID). Verifica la integración del webhook.'
  }

  const minutesUntilReady = Math.max(0, (activeRuleDelay ?? 0) - minutesSilent)

  return {
    totalConversations: convs.length,
    activeRuleDelay,
    nearest: {
      contactName:       nearest.contact_name ?? 'Sin nombre',
      channelType:       nearest.channel_type,
      minutesSilent:     Math.round(minutesSilent),
      lastRole,
      minutesUntilReady: Math.ceil(minutesUntilReady),
    },
    reason,
  }
}
