import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentId = params.id

  let body: { notification_phone?: string; notification_email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { notification_phone, notification_email } = body

  // Validate phone: must start with country code (digits only after stripping non-numeric)
  if (notification_phone !== undefined && notification_phone !== '') {
    const digits = notification_phone.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 15) {
      return NextResponse.json(
        { error: 'Teléfono inválido. Debe incluir código de país (ej: 521XXXXXXXXXX)' },
        { status: 400 }
      )
    }
    // Must start with country code (not 0, and at least 11 digits for international)
    if (digits.length < 11) {
      return NextResponse.json(
        { error: 'Incluye el código de país (ej: 52 para México → 521XXXXXXXXXX)' },
        { status: 400 }
      )
    }
  }

  const patch: Record<string, string | null> = {}
  if (notification_phone !== undefined) patch.notification_phone = notification_phone || null
  if (notification_email !== undefined) patch.notification_email = notification_email || null

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const supabase = db()
  const { error } = await supabase
    .from('xenttech_agents')
    .update(patch)
    .eq('id', agentId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
