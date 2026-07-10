import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('image') as File | null

  if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Image must be under 10 MB' }, { status: 400 })

  const ext      = file.name.split('.').pop() ?? 'jpg'
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const supabase = db()
  const { error: uploadError } = await supabase.storage
    .from('clip-references')
    .upload(fileName, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error('upload-reference error:', uploadError.message)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data } = supabase.storage.from('clip-references').getPublicUrl(fileName)
  return NextResponse.json({ url: data.publicUrl })
}
