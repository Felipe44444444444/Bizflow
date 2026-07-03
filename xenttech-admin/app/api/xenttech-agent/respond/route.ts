import { NextRequest, NextResponse } from 'next/server'
import { handleIncomingMessage } from '@/lib/xenttech/agent'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const { clientId, agentId, channelType, channelIdentifier, messageText, contactHints } = body ?? {}

    if (!agentId || !channelType || !channelIdentifier || !messageText) {
      return NextResponse.json({ error: 'agentId, channelType, channelIdentifier, messageText required' }, { status: 400 })
    }

    const reply = await handleIncomingMessage({
      clientId: clientId ?? null,
      agentId,
      channelType,
      channelIdentifier,
      messageText,
      contactHints,
    })

    return NextResponse.json({ reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: msg === 'AI_UNAVAILABLE' ? 502 : 500 })
  }
}
