import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  generateRetargetingMessage,
  pickRetargetingMessage,
  sendRetargetingMessage,
} from '@/lib/xenttech/retargeting'
import type { RetargetingRule, StaleConversation } from '@/lib/xenttech/retargeting'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const conversationId = params.conversationId
  const supabase = db()

  // 1. Load conversation
  const { data: conv } = await supabase
    .from('xenttech_conversations')
    .select('id, agent_id, contact_id, contact_name, contact_phone, channel_type, messages, updated_at')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  if (!conv.contact_phone) {
    return NextResponse.json({ error: 'La conversación no tiene identificador de canal (PSID/teléfono)' }, { status: 400 })
  }

  // 2. Load active rule for this agent
  const { data: rules } = await supabase
    .from('xenttech_retargeting_rules')
    .select('*')
    .eq('agent_id', conv.agent_id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)

  if (!rules?.length) {
    return NextResponse.json({ error: 'No hay reglas de retargeting activas para este agente' }, { status: 400 })
  }
  const rule = rules[0] as RetargetingRule

  // 3. Count existing real sends (exclude TEST-FIRE)
  const { data: logs } = await supabase
    .from('xenttech_retargeting_log')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('status', 'sent')
    .not('error_message', 'like', '%[TEST-FIRE]%')

  const sendCount = logs?.length ?? 0

  // 4. Generate message
  type ConvMsg = { role: string; content: string }
  const convMessages = ((conv.messages ?? []) as ConvMsg[]).map(m => ({ role: m.role, content: m.content }))
  const timeSilentMinutes = (Date.now() - new Date(conv.updated_at).getTime()) / 60_000

  const message = await generateRetargetingMessage({
    agentId:           conv.agent_id,
    contactName:       conv.contact_name,
    channelType:       conv.channel_type,
    convMessages,
    timeSilentMinutes,
    sendCount,
    rule,
  }).catch(() => pickRetargetingMessage(rule, sendCount, conv.contact_name))

  if (!message) return NextResponse.json({ error: 'No se pudo generar mensaje' }, { status: 400 })

  // 5. Build a StaleConversation-compatible object and send
  const stale: StaleConversation = {
    conversationId:    conv.id,
    contactId:         conv.contact_id,
    agentId:           conv.agent_id,
    channelType:       conv.channel_type,
    channelIdentifier: conv.contact_phone,
    contactName:       conv.contact_name,
    ruleId:            rule.id,
    rule,
    retargetingCount:  sendCount,
    timeSilentMinutes,
    convMessages,
  }

  const ok = await sendRetargetingMessage(stale, message)

  if (!ok) {
    return NextResponse.json({ success: false, error: 'Error al enviar el mensaje' }, { status: 502 })
  }

  return NextResponse.json({
    success:      true,
    message_sent: message,
    send_count:   sendCount + 1,
  })
}
