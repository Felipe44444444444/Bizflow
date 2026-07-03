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
      .eq('channel_type', 'whatsapp')
      .eq('whatsapp_verify_token', token)
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

  waitUntil(processMessages(body).catch(err => console.error('WhatsApp webhook error:', err)))
  return new NextResponse('EVENT_RECEIVED', { status: 200 })
}

async function processMessages(body: Record<string, unknown>) {
  if (body.object !== 'whatsapp_business_account') return

  const supabase = db()

  type WAChange = {
    value: {
      metadata?: { phone_number_id?: string }
      messages?: Array<{
        from: string
        type: string
        text?: { body: string }
        id: string
      }>
      statuses?: unknown[]
    }
  }

  const entries = (body.entry as Array<{ id: string; changes?: WAChange[] }>) ?? []

  for (const entry of entries) {
    const changes = entry.changes ?? []

    for (const change of changes) {
      const phoneNumberId = change.value?.metadata?.phone_number_id
      const messages = change.value?.messages ?? []
      if (!phoneNumberId || !messages.length) continue

      const { data: channel } = await supabase
        .from('xenttech_channels')
        .select('id, agent_id, client_id, page_access_token, whatsapp_phone_number_id')
        .eq('channel_type', 'whatsapp')
        .eq('whatsapp_phone_number_id', phoneNumberId)
        .eq('is_connected', true)
        .maybeSingle()

      if (!channel) {
        console.warn(`No connected WhatsApp channel for phone_number_id ${phoneNumberId}`)
        continue
      }

      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.text?.body) continue

        const userPhone = msg.from
        const messageText = msg.text.body

        try {
          const reply = await handleIncomingMessage({
            clientId:          channel.client_id ?? null,
            agentId:           channel.agent_id,
            channelId:         channel.id,
            channelType:       'whatsapp',
            channelIdentifier: userPhone,
            messageText,
            contactHints:      { phone: userPhone },
          })

          // Send reply via WhatsApp Business API
          await fetch(
            `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${channel.page_access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type:    'individual',
                to:                userPhone,
                type:              'text',
                text:              { body: reply },
              }),
            }
          )
        } catch (err) {
          console.error(`WhatsApp message handling failed for ${userPhone}:`, err)
        }
      }
    }
  }
}
