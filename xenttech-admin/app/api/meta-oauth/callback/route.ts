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

// Facebook redirects here after the user grants permissions.
// Exchanges the short-lived code for a long-lived token and stores it on the client record.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code     = searchParams.get('code')
  const clientId = searchParams.get('state') ?? ''
  const error    = searchParams.get('error')

  const baseUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://admin.xenttech.com'
  const redirectUri = `${baseUrl}/api/meta-oauth/callback`
  const adsPage     = `${baseUrl}/agency/ads`

  if (error || !code) {
    const reason = searchParams.get('error_description') ?? error ?? 'Usuario canceló'
    return NextResponse.redirect(`${adsPage}?meta_error=${encodeURIComponent(reason)}`)
  }

  const appId     = process.env.NEXT_PUBLIC_META_APP_ID
  const appSecret = process.env.META_APP_SECRET

  if (!appId || !appSecret) {
    return NextResponse.redirect(`${adsPage}?meta_error=Configuración+incompleta+(META_APP_ID+o+META_APP_SECRET)`)
  }

  try {
    // Exchange code → short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
    )
    const tokenData = await tokenRes.json() as { access_token?: string; error?: Record<string, unknown> }
    if (!tokenData.access_token) {
      throw new Error(String(tokenData.error?.message ?? 'No se obtuvo access_token'))
    }

    // Exchange short-lived → long-lived token (60 days)
    const llRes = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
    )
    const llData = await llRes.json() as { access_token?: string; expires_in?: number }
    const longToken = llData.access_token ?? tokenData.access_token

    // Get Meta user info
    const meRes  = await fetch(`https://graph.facebook.com/v22.0/me?access_token=${longToken}`)
    const meData = await meRes.json() as { id?: string; name?: string }

    // Calculate expiry (default 60 days if not provided)
    const expiresIn = llData.expires_in ?? 5184000
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Save token to DB
    if (clientId) {
      await db()
        .from('clients')
        .update({
          meta_access_token:   longToken,
          meta_user_id:        meData.id ?? null,
          meta_token_expires_at: expiresAt,
          meta_connected:      true,
        })
        .eq('id', clientId)
    }

    return NextResponse.redirect(`${adsPage}?meta_connected=1&client_id=${clientId}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.redirect(`${adsPage}?meta_error=${encodeURIComponent(msg)}`)
  }
}
