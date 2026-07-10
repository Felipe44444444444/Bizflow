import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agent_id')
  const supabase = db()
  const query = supabase.from('xenttech_niches').select('*').order('created_at', { ascending: false })
  if (agentId) query.eq('agent_id', agentId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    agent_id?:        string
    name:             string
    voice_id?:        string
    voice_style?:     string
    music_style?:     string
    subtitle_style?:  object
    intro_template?:  string
    outro_template?:  string
  }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name es requerido' }, { status: 400 })

  const supabase = db()
  const { data, error } = await supabase.from('xenttech_niches').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
