import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// GET — list rules + recent log for this agent
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const supabase = db()

  const [agentRes, rulesRes, logsRes] = await Promise.all([
    supabase.from('xenttech_agents').select('id,name').eq('id', agentId).maybeSingle(),
    supabase
      .from('xenttech_retargeting_rules')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('xenttech_retargeting_log')
      .select('id,rule_id,conversation_id,contact_id,channel_type,message_sent,sent_at,status,error_message')
      .eq('agent_id', agentId)
      .order('sent_at', { ascending: false })
      .limit(30),
  ])

  return NextResponse.json({
    agent: agentRes.data ?? null,
    rules: rulesRes.data ?? [],
    logs:  logsRes.data  ?? [],
  })
}

// POST — create a new rule
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const body = await req.json().catch(() => null)

  const {
    name = 'Seguimiento automático',
    delay_minutes = 10,
    messages = [],
    message_strategy = 'random',
    max_retargeting_per_conversation = 2,
    min_hours_between_retargeting = 24,
    apply_to_channels = ['facebook', 'instagram', 'whatsapp'],
    is_active = true,
  } = body ?? {}

  if (!messages.length) {
    return NextResponse.json({ error: 'Se requiere al menos un mensaje' }, { status: 400 })
  }

  const supabase = db()
  const { data: agent } = await supabase
    .from('xenttech_agents').select('client_id').eq('id', agentId).maybeSingle()

  const { data, error } = await supabase
    .from('xenttech_retargeting_rules')
    .insert({
      agent_id: agentId,
      client_id: agent?.client_id ?? null,
      name,
      delay_minutes,
      messages,
      message_strategy,
      max_retargeting_per_conversation,
      min_hours_between_retargeting,
      apply_to_channels,
      is_active,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
