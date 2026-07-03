import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const VALID_STATUSES = ['nuevo', 'contactado', 'calificado', 'convertido', 'agotado', 'perdido']

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const leadId = params.id
  let body: { status?: string; notes?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { status, notes } = body

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Status inválido. Opciones: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (status !== undefined) {
    patch.status = status
    if (status === 'contactado') patch.contacted_at = new Date().toISOString()
  }
  if (notes !== undefined) patch.notes = notes

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })

  const supabase = db()
  const { error } = await supabase.from('xenttech_leads').update(patch).eq('id', leadId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
