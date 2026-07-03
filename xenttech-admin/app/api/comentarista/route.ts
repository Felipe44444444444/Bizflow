import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId') ?? undefined

  const supabase = db()

  // Connected Facebook channels with their agent info
  const { data: channelRows } = await supabase
    .from('xenttech_channels')
    .select('id, agent_id, page_name, page_id, config')
    .eq('channel_type', 'facebook')
    .eq('is_connected', true)

  const connectedChannels = (channelRows ?? []).map(c => ({
    id:        c.id,
    agent_id:  c.agent_id,
    page_name: c.page_name,
    page_id:   c.page_id,
  }))

  // All comment rules (not filtered by channel — agents without a channel can still have rules)
  const { data: ruleRows } = await supabase
    .from('xenttech_comment_rules')
    .select('*')

  // Comment logs (filtered by agentId if provided)
  let logsQuery = supabase
    .from('xenttech_comment_log')
    .select('*, xenttech_agents(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (agentId) logsQuery = logsQuery.eq('agent_id', agentId)

  const { data: rawLogs, error } = await logsQuery
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const logs = (rawLogs ?? []).map(l => ({
    ...l,
    agent_name:      (l.xenttech_agents as { name: string } | null)?.name ?? null,
    xenttech_agents: undefined,
  }))

  // Metrics
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count: todayCount } = await supabase
    .from('xenttech_comment_log')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString())
    .eq('status', 'sent')

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { data: recentPosts } = await supabase
    .from('xenttech_comment_log')
    .select('post_id')
    .gte('created_at', weekAgo)
    .not('post_id', 'is', null)

  const activePosts = new Set((recentPosts ?? []).map(r => r.post_id as string)).size

  const { count: activeAgents } = await supabase
    .from('xenttech_comment_rules')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  const { data: agentRows } = await supabase
    .from('xenttech_agents')
    .select('id, name, system_prompt')
    .order('name')

  return NextResponse.json({
    logs,
    agents:            agentRows ?? [],
    connectedChannels,
    rules:             ruleRows  ?? [],
    metrics: {
      todayCount:   todayCount  ?? 0,
      activePosts,
      activeAgents: activeAgents ?? 0,
      total:        logs.length,
    },
  })
}
