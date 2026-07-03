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

// GET — return the comment rule + recent logs for this agent
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId  = params.id
  const supabase = db()

  const [ruleRes, logsRes] = await Promise.all([
    supabase
      .from('xenttech_comment_rules')
      .select('*')
      .eq('agent_id', agentId)
      .maybeSingle(),
    supabase
      .from('xenttech_comment_log')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return NextResponse.json({
    rule: ruleRes.data ?? null,
    logs: logsRes.data ?? [],
  })
}

// PATCH — upsert the comment rule for this agent
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id
  const body    = await req.json() as {
    is_active?:           boolean
    reply_to_ads?:        boolean
    reply_to_organic?:    boolean
    channel_id?:          string | null
    tone?:                string
    custom_instruction?:  string | null
    ignore_negative?:     boolean
  }

  const supabase = db()

  // Get the agent's main Facebook channel if not provided
  let channelId = body.channel_id ?? null
  if (!channelId) {
    const { data: ch } = await supabase
      .from('xenttech_channels')
      .select('id')
      .eq('agent_id', agentId)
      .eq('channel_type', 'facebook')
      .eq('is_connected', true)
      .limit(1)
      .maybeSingle()
    channelId = ch?.id ?? null
  }

  const payload = {
    agent_id:           agentId,
    channel_id:         channelId,
    is_active:          body.is_active           ?? false,
    reply_to_ads:       body.reply_to_ads        ?? true,
    reply_to_organic:   body.reply_to_organic    ?? true,
    tone:               body.tone                ?? 'professional',
    custom_instruction: body.custom_instruction  ?? null,
    ignore_negative:    body.ignore_negative     ?? false,
    updated_at:         new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('xenttech_comment_rules')
    .upsert(payload, { onConflict: 'agent_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Subscribe to Facebook feed events when activating
  if (body.is_active && channelId) {
    const { data: ch } = await supabase
      .from('xenttech_channels')
      .select('page_id, page_access_token')
      .eq('id', channelId)
      .maybeSingle()

    if (ch?.page_id && ch?.page_access_token) {
      // Subscribe page to receive feed (comment) events
      await fetch(
        `https://graph.facebook.com/v22.0/${ch.page_id}/subscribed_apps`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscribed_fields: 'feed,messages',
            access_token:      ch.page_access_token,
          }),
        }
      ).catch(err => console.error('Feed subscription error:', err))
    }
  }

  return NextResponse.json({ rule: data })
}
