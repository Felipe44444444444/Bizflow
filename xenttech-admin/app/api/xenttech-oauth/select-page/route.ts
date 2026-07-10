import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const { agentId, pageId, pageName, pageAccessToken } = body ?? {}

    if (!agentId || !pageId || !pageName || !pageAccessToken) {
      return NextResponse.json(
        { error: 'agentId, pageId, pageName, pageAccessToken required' },
        { status: 400 }
      )
    }

    const supabase = db()

    const { data: agent } = await supabase
      .from('xenttech_agents')
      .select('client_id')
      .eq('id', agentId)
      .maybeSingle()

    const { error } = await supabase.from('xenttech_channels').upsert(
      {
        agent_id:          agentId,
        client_id:         agent?.client_id ?? null,
        channel_type:      'facebook',
        channel_name:      pageName,
        page_id:           pageId,
        page_name:         pageName,
        page_access_token: pageAccessToken,
        is_connected:      true,
        connected_at:      new Date().toISOString(),
      },
      { onConflict: 'agent_id,channel_type' }
    )

    if (error) {
      console.error('select-page upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Subscribe page to app webhook so Facebook delivers events to our handler
    try {
      const subscribeRes = await fetch(
        `https://graph.facebook.com/v22.0/${pageId}/subscribed_apps`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscribed_fields: 'messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,feed',
            access_token: pageAccessToken,
          }),
        }
      )
      const subscribeData = await subscribeRes.json()
      console.log('WEBHOOK_SUBSCRIBE:', pageId, subscribeData)
    } catch (err) {
      console.error('WEBHOOK_SUBSCRIBE_ERROR:', err)
      // Non-fatal — channel is saved, subscription can be retried
    }

    return NextResponse.json({ success: true, pageName })
  } catch (err) {
    console.error('select-page error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
