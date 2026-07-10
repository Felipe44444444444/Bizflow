import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MAX_SIZE = 2 * 1024 * 1024 * 1024 // 2 GB

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      filename:    string
      contentType: string
      fileSize:    number
      agent_id:    string
      topic?:      string
    }

    const { filename, contentType, fileSize, agent_id, topic } = body

    if (!filename || !contentType || !agent_id) {
      return NextResponse.json({ error: 'filename, contentType y agent_id son requeridos' }, { status: 400 })
    }
    if (fileSize > MAX_SIZE) {
      return NextResponse.json({ error: 'El video no puede superar 2 GB' }, { status: 400 })
    }

    const supabase = db()
    const ext      = filename.split('.').pop() ?? 'mp4'
    const path     = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    // Generar URL firmada para upload directo desde el browser
    const { data: signed, error: signErr } = await supabase.storage
      .from('clips')
      .createSignedUploadUrl(path)

    if (signErr || !signed) {
      throw new Error(signErr?.message ?? 'No se pudo generar URL de upload')
    }

    // Registrar clip en DB antes del upload (status: uploaded se pone después)
    const { data: clip, error: clipErr } = await supabase
      .from('xenttech_clips_ai')
      .insert({
        agent_id,
        video_url:          null,
        original_video_url: null,
        source_type:        'uploaded',
        status:             'uploading',
        topic:              topic ?? filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        duration_seconds:   0,
        tone:               'professional',
        auto_publish:       false,
        brand_colors:       [],
        reference_images:   [],
        published_to:       [],
        views:              0,
        likes:              0,
        processing_options: { storage_path: path, content_type: contentType },
      })
      .select('id')
      .single()

    if (clipErr || !clip) throw new Error(clipErr?.message ?? 'Error al crear registro')

    const publicUrl = supabase.storage.from('clips').getPublicUrl(path).data.publicUrl

    return NextResponse.json({
      signedUrl: signed.signedUrl,
      path,
      clip_id:   clip.id,
      publicUrl,
    })

  } catch (err) {
    console.error('UPLOAD_URL_ERROR:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
