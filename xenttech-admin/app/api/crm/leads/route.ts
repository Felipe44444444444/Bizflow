import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId  = searchParams.get('agentId')
  const status   = searchParams.get('status')
  const channel  = searchParams.get('channel')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo   = searchParams.get('dateTo')
  const limit    = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const offset   = parseInt(searchParams.get('offset') ?? '0')

  const supabase = db()

  // 1. Query conversations
  let convQ = supabase
    .from('xenttech_conversations')
    .select('id, agent_id, contact_id, contact_name, contact_phone, channel_type, messages, status, updated_at, created_at')
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (agentId)  convQ = convQ.eq('agent_id', agentId)
  if (channel)  convQ = convQ.eq('channel_type', channel)
  if (dateFrom) convQ = convQ.gte('updated_at', dateFrom)
  if (dateTo)   convQ = convQ.lte('updated_at', dateTo + 'T23:59:59Z')

  const { data: convs, error: convErr } = await convQ
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 })
  if (!convs?.length) return NextResponse.json({ data: [], total: 0 })

  const convIds    = convs.map(c => c.id)
  const contactIds = [...new Set(convs.map(c => c.contact_id).filter(Boolean))]
  const agentIds   = [...new Set(convs.map(c => c.agent_id).filter(Boolean))]

  // 2. Batch fetch retargeting logs per conversation
  const { data: logs } = await supabase
    .from('xenttech_retargeting_log')
    .select('conversation_id, sent_at, message_sent, status, error_message')
    .in('conversation_id', convIds)
    .order('sent_at', { ascending: false })

  type LogEntry = { conversation_id: string; sent_at: string; message_sent: string; status: string; error_message: string | null }
  const logMap: Record<string, { count: number; lastSentAt: string | null; lastMessage: string | null; testCount: number }> = {}
  for (const log of (logs ?? []) as LogEntry[]) {
    const isTest = log.error_message?.includes('[TEST-FIRE]') ?? false
    if (!logMap[log.conversation_id]) {
      logMap[log.conversation_id] = { count: 0, lastSentAt: null, lastMessage: null, testCount: 0 }
    }
    const entry = logMap[log.conversation_id]
    if (isTest) {
      entry.testCount++
    } else if (log.status === 'sent') {
      entry.count++
      if (!entry.lastSentAt || log.sent_at > entry.lastSentAt) {
        entry.lastSentAt = log.sent_at
        entry.lastMessage = log.message_sent
      }
    }
  }

  // 3. Batch fetch leads by contact_id + agent_id
  const { data: leads } = contactIds.length
    ? await supabase
        .from('xenttech_leads')
        .select('id, contact_id, agent_id, nombre, telefono, email, status, canal, captured_at')
        .in('contact_id', contactIds)
    : { data: [] }

  // Build lead lookup: contact_id:agent_id → lead
  type Lead = { id: string; contact_id: string; agent_id: string; nombre: string | null; telefono: string | null; email: string | null; status: string; canal: string | null; captured_at: string }
  const leadMap: Record<string, Lead> = {}
  for (const lead of (leads ?? []) as Lead[]) {
    const key = `${lead.contact_id}:${lead.agent_id}`
    // Keep the most recent if multiple
    if (!leadMap[key]) leadMap[key] = lead
  }

  // 4. Batch fetch agent names
  const { data: agents } = agentIds.length
    ? await supabase
        .from('xenttech_agents')
        .select('id, name')
        .in('id', agentIds)
    : { data: [] }

  type Agent = { id: string; name: string }
  const agentMap: Record<string, string> = {}
  for (const a of (agents ?? []) as Agent[]) {
    agentMap[a.id] = a.name
  }

  // 5. Assemble CRM rows
  type ConvMsg = { role: string; content: string; timestamp?: string; retargeting?: boolean }
  const rows = convs.map(c => {
    const logInfo = logMap[c.id] ?? { count: 0, lastSentAt: null, lastMessage: null, testCount: 0 }
    const lead    = leadMap[`${c.contact_id}:${c.agent_id}`] ?? null
    const msgs    = (c.messages ?? []) as ConvMsg[]

    return {
      conversationId:        c.id,
      agentId:               c.agent_id,
      agentName:             agentMap[c.agent_id] ?? null,
      contactId:             c.contact_id,
      contactName:           c.contact_name,
      contactPhone:          c.contact_phone,
      channelType:           c.channel_type,
      lastActivity:          c.updated_at,
      createdAt:             c.created_at,
      retargetingCount:      logInfo.count,
      lastRetargetingAt:     logInfo.lastSentAt,
      lastRetargetingMessage: logInfo.lastMessage,
      leadId:                lead?.id ?? null,
      leadStatus:            lead?.status ?? null,
      leadNombre:            lead?.nombre ?? null,
      leadTelefono:          lead?.telefono ?? null,
      messages:              msgs,
    }
  })

  // Apply lead status filter after join (Supabase can't filter on joined data)
  const filtered = status
    ? rows.filter(r => r.leadStatus === status)
    : rows

  return NextResponse.json({ data: filtered, total: filtered.length })
}
