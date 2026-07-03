import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { handleIncomingMessage } from '@/lib/xenttech/agent'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// GET — verification challenge
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token && challenge) {
    const supabase = db()
    const { data } = await supabase
      .from('xenttech_channels')
      .select('id')
      .eq('channel_type', 'instagram')
      .eq('webhook_secret', token)
      .eq('is_connected', true)
      .maybeSingle()

    if (data) return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

// POST — Incoming messages
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  waitUntil(processMessages(body).catch(err => console.error('Instagram webhook error:', err)))
  return new NextResponse('EVENT_RECEIVED', { status: 200 })
}

async function processMessages(body: Record<string, unknown>) {
  if (body.object !== 'instagram') return

  const supabase = db()
  const entries = (body.entry as Array<{ id: string; messaging?: unknown[] }>) ?? []

  for (const entry of entries) {
    const pageId = entry.id
    const events = (entry.messaging ?? []) as Array<{
      sender: { id: string }
      message?: { text?: string; is_echo?: boolean }
    }>

    const { data: channel } = await supabase
      .from('xenttech_channels')
      .select('id, agent_id, client_id, page_id, page_access_token, instagram_account_id')
      .eq('channel_type', 'instagram')
      .eq('page_id', pageId)
      .eq('is_connected', true)
      .maybeSingle()

    if (!channel) {
      console.warn(`No connected Instagram channel for page_id ${pageId}`)
      continue
    }

    for (const event of events) {
      if (event.message?.is_echo) continue
      const messageText = event.message?.text
      if (!messageText) continue

      const senderId = event.sender.id

      try {
        const reply = await handleIncomingMessage({
          clientId:          channel.client_id ?? null,
          agentId:           channel.agent_id,
          channelId:         channel.id,
          channelType:       'instagram',
          channelIdentifier: senderId,
          messageText,
        })

        // Send reply via Instagram Messaging API (uses Page Access Token)
        await fetch(
          `https://graph.facebook.com/v22.0/me/messages?access_token=${channel.page_access_token}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_type: 'RESPONSE',
              recipient: { id: senderId },
              message: { text: reply },
            }),
          }
        )
      } catch (err) {
        console.error(`Instagram message handling failed for sender ${senderId}:`, err)
      }
    }
  }
}
