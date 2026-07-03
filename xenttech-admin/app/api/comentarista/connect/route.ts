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

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    pageId:           string
    pageName:         string
    pageAccessToken:  string
    agentId:          string
  }

  const { pageId, pageName, pageAccessToken, agentId } = body
  if (!pageId || !pageAccessToken || !agentId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = db()

  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('client_id')
    .eq('id', agentId)
    .maybeSingle()

  const { error } = await supabase
    .from('xenttech_channels')
    .upsert(
      {
        agent_id:          agentId,
        client_id:         agent?.client_id ?? null,
        channel_type:      'facebook',
        page_id:           pageId,
        page_name:         pageName,
        page_access_token: pageAccessToken,
        is_connected:      true,
        connected_at:      new Date().toISOString(),
        config:            { comments_enabled: true },
      },
      { onConflict: 'agent_id,channel_type' }
    )

  if (error) {
    console.error('Channel connect error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Subscribe page to webhook feed + messages events
  const subRes = await fetch(
    `https://graph.facebook.com/v22.0/${pageId}/subscribed_apps`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: 'messages,feed',
        access_token:      pageAccessToken,
      }),
    }
  )
  if (!subRes.ok) {
    console.error('Feed subscription warning:', await subRes.text())
    // Non-fatal — channel is saved, subscription can be retried on next activate
  }

  return NextResponse.json({ ok: true })
}
