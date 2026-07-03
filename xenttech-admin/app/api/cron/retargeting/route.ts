import { NextRequest, NextResponse } from 'next/server'
import { runRetargetingCycle } from '@/lib/xenttech/retargeting'

// GET is called by Vercel Cron every 2 minutes.
// Manual trigger: GET /api/cron/retargeting  (with Authorization header)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await runRetargetingCycle()
    console.log('Retargeting cycle:', report)
    return NextResponse.json({ success: true, report })
  } catch (err) {
    console.error('Retargeting cron error:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}
