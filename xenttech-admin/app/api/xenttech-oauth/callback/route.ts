import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ── Helpers ───────────────────────────────────────────────────────────────────

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function redirectTo(req: NextRequest, path: string) {
  const base = new URL(req.url).origin
  return NextResponse.redirect(`${base}${path}`)
}

// ── Facebook ──────────────────────────────────────────────────────────────────

async function handleFacebook(req: NextRequest, code: string, agentId: string, source?: string) {
  const appId     = process.env.NEXT_PUBLIC_META_APP_ID
  const appSecret = process.env.META_APP_SECRET

  if (!appId || !appSecret) {
    console.error('Facebook OAuth: missing NEXT_PUBLIC_META_APP_ID or META_APP_SECRET')
    return redirectTo(req, '/agency/agents?oauth_error=facebook_env_missing')
  }

  // Pin to canonical domain — avoids mismatch when Vercel routes via deployment URL internally
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const callbackUri = `${origin}/api/xenttech-oauth/callback`

  // 1. Exchange code → short-lived user token
  const tokenUrl =
    `https://graph.facebook.com/v22.0/oauth/access_token` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(callbackUri)}` +
    `&client_secret=${appSecret}` +
    `&code=${code}`

  const tokenRes = await fetch(tokenUrl)
  if (!tokenRes.ok) {
    const fbError = await tokenRes.text()
    console.error('Facebook token exchange failed. redirect_uri:', callbackUri, '| response:', fbError)
    // Surface the real Graph API error in the URL so it's visible without log access
    let detail: string
    try { detail = (JSON.parse(fbError) as { error?: { message?: string } }).error?.message ?? fbError }
    catch { detail = fbError }
    return redirectTo(req, `/agency/agents?oauth_error=${encodeURIComponent('fb_token_failed: ' + detail)}`)
  }
  const { access_token: shortToken } = await tokenRes.json() as { access_token: string }

  // 2. Exchange short-lived → long-lived user token (60-day lifetime)
  const longUrl =
    `https://graph.facebook.com/v22.0/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${appId}` +
    `&client_secret=${appSecret}` +
    `&fb_exchange_token=${shortToken}`

  const longRes  = await fetch(longUrl)
  const longJson = longRes.ok ? await longRes.json() as { access_token?: string } : {}
  const longToken: string = longJson.access_token ?? shortToken

  // 3. Get pages the user manages (including category for display)
  const pagesUrl =
    `https://graph.facebook.com/v22.0/me/accounts` +
    `?access_token=${longToken}` +
    `&fields=id,name,access_token,category`

  const pagesRes = await fetch(pagesUrl)
  if (!pagesRes.ok) {
    console.error('Facebook /me/accounts failed:', await pagesRes.text())
    return redirectTo(req, '/agency/agents?oauth_error=fb_pages_failed')
  }

  const { data: pages } = await pagesRes.json() as {
    data: Array<{ id: string; name: string; access_token: string; category?: string }>
  }

  if (!pages?.length) {
    return redirectTo(req, '/agency/agents?oauth_error=fb_no_pages')
  }

  // 4. Pass page list to UI for user selection — upsert happens after user picks a page
  const pageList = pages.map(p => ({
    id:           p.id,
    name:         p.name,
    access_token: p.access_token,
    category:     p.category,
  }))
  const b64 = Buffer.from(JSON.stringify(pageList)).toString('base64')
  const returnPath = source === 'comentarista' ? '/agency/comentarista' : '/agency/agents'
  return redirectTo(req, `${returnPath}?fb_pages=${encodeURIComponent(b64)}&agent_id=${encodeURIComponent(agentId)}`)
}

// ── Slack ─────────────────────────────────────────────────────────────────────

async function handleSlack(req: NextRequest, code: string, agentId: string) {
  const clientId     = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('Slack OAuth: missing NEXT_PUBLIC_SLACK_CLIENT_ID or SLACK_CLIENT_SECRET')
    return redirectTo(req, '/agency/agents?oauth_error=slack_env_missing')
  }

  const callbackUri = `${new URL(req.url).origin}/api/xenttech-oauth/callback`

  const slackRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  callbackUri,
    }),
  })

  const slackJson = await slackRes.json() as {
    ok: boolean; error?: string
    access_token?: string
    team?: { id: string; name: string }
    bot_user_id?: string
  }

  if (!slackJson.ok) {
    console.error('Slack oauth.v2.access error:', slackJson.error)
    return redirectTo(req, `/agency/agents?oauth_error=${encodeURIComponent('slack_' + (slackJson.error ?? 'unknown'))}`)
  }

  const supabase = db()
  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('client_id')
    .eq('id', agentId)
    .maybeSingle()

  const now = new Date().toISOString()
  const { error } = await supabase.from('xenttech_channels').upsert(
    {
      agent_id:       agentId,
      client_id:      agent?.client_id ?? null,
      channel_type:   'slack',
      channel_name:   slackJson.team?.name ?? 'Slack',
      slack_bot_token: slackJson.access_token ?? null,
      slack_team_id:  slackJson.team?.id ?? null,
      is_connected:   true,
      connected_at:   now,
    },
    { onConflict: 'agent_id,channel_type' }
  )
  if (error) console.error('xenttech_channels Slack upsert error:', error)

  const teamName = slackJson.team?.name ?? 'Slack'
  return redirectTo(req, `/agency/agents?connected=slack&page=${encodeURIComponent(teamName)}`)
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // Provider denied or cancelled
  const oauthError = searchParams.get('error')
  if (oauthError) {
    return redirectTo(req, `/agency/agents?oauth_error=${encodeURIComponent(oauthError)}`)
  }

  const code     = searchParams.get('code')
  const stateRaw = searchParams.get('state')

  if (!code || !stateRaw) {
    return redirectTo(req, '/agency/agents?oauth_error=missing_params')
  }

  let state: { agent_id: string; channel: string; source?: string }
  try {
    state = JSON.parse(decodeURIComponent(stateRaw))
  } catch {
    return redirectTo(req, '/agency/agents?oauth_error=invalid_state')
  }

  const { agent_id, channel, source } = state

  if (!agent_id || !channel) {
    return redirectTo(req, '/agency/agents?oauth_error=invalid_state')
  }

  try {
    switch (channel) {
      case 'facebook':
        return await handleFacebook(req, code, agent_id, source)
      case 'slack':
        return await handleSlack(req, code, agent_id)
      default:
        return redirectTo(req, `/agency/agents?oauth_error=unknown_channel_${channel}`)
    }
  } catch (err) {
    console.error('OAuth callback unhandled error:', err)
    return redirectTo(req, '/agency/agents?oauth_error=server_error')
  }
}
