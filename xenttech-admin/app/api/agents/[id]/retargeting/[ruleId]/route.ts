import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// PATCH — update a rule
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; ruleId: string } }
) {
  const { ruleId } = params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'No body' }, { status: 400 })

  const supabase = db()
  const { data, error } = await supabase
    .from('xenttech_retargeting_rules')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', ruleId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — remove a rule and its log entries
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; ruleId: string } }
) {
  const { ruleId } = params
  const supabase = db()

  const { error } = await supabase
    .from('xenttech_retargeting_rules')
    .delete()
    .eq('id', ruleId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
