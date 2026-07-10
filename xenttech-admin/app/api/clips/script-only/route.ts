import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { generateClipScript } from '@/lib/xenttech/clips'

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
    agent_id:          string
    topic:             string
    tone?:             string
    duration_seconds?: number
    brand_colors?:     string[]
    reference_images?: string[]
  }

  const { agent_id, topic, tone = 'professional', duration_seconds = 10, brand_colors = [], reference_images = [] } = body

  if (!agent_id || !topic?.trim()) {
    return NextResponse.json({ error: 'agent_id y topic son requeridos' }, { status: 400 })
  }

  const supabase = db()

  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('id, name, system_prompt')
    .eq('id', agent_id)
    .maybeSingle()

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })

  try {
    const plan = await generateClipScript(agent, topic, tone, duration_seconds, brand_colors, reference_images)
    return NextResponse.json(plan)
  } catch (err) {
    const e = err as Error
    console.error('SCRIPT_ONLY_ERROR', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
