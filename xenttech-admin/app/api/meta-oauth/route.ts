import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Redirects the browser to Facebook's OAuth dialog.
// After the user grants permissions, Facebook redirects to /api/meta-oauth/callback.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id') ?? ''

  const appId       = process.env.NEXT_PUBLIC_META_APP_ID
  const baseUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://admin.xenttech.com'
  const redirectUri = `${baseUrl}/api/meta-oauth/callback`

  if (!appId) {
    return NextResponse.json({ error: 'META_APP_ID no configurado' }, { status: 500 })
  }

  const scopes = [
    'ads_management',
    'ads_read',
    'business_management',
    'pages_show_list',
    'pages_read_engagement',
  ].join(',')

  const oauthUrl = new URL('https://www.facebook.com/dialog/oauth')
  oauthUrl.searchParams.set('client_id',     appId)
  oauthUrl.searchParams.set('redirect_uri',  redirectUri)
  oauthUrl.searchParams.set('scope',         scopes)
  oauthUrl.searchParams.set('response_type', 'code')
  oauthUrl.searchParams.set('state',         clientId)

  return NextResponse.redirect(oauthUrl.toString())
}
