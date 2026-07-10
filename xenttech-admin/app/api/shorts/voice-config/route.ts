import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY
  const hasGoogle     = !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON

  const provider = hasElevenLabs ? 'elevenlabs' : hasGoogle ? 'google' : 'none'

  return NextResponse.json({ provider, hasElevenLabs, hasGoogle })
}
