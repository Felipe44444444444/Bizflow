import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const origin = url.origin;
  const base   = `${origin}/agency/agents`;

  const code     = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');

  if (!code || !stateRaw) {
    return NextResponse.redirect(`${base}?error=missing_params`);
  }

  let state: { agent_id?: string; channel?: string } = {};
  try {
    state = JSON.parse(decodeURIComponent(stateRaw));
  } catch {
    return NextResponse.redirect(`${base}?error=invalid_state`);
  }

  const { agent_id, channel } = state;
  if (!agent_id || !channel) {
    return NextResponse.redirect(`${base}?error=invalid_state`);
  }

  const supabase    = serviceClient();
  const redirectUri = `${origin}/api/xenttech-oauth/callback`;

  // ── Facebook Messenger ────────────────────────────────────────────────────

  if (channel === 'facebook') {
    const appId     = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.redirect(`${base}?error=facebook_not_configured`);
    }

    // Exchange code for short-lived user access token
    const tokenRes  = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };

    if (!tokenData.access_token) {
      console.error('FB token error:', tokenData.error);
      return NextResponse.redirect(`${base}?error=facebook_token_failed`);
    }

    // Get user's pages
    const pagesRes  = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?access_token=${tokenData.access_token}&fields=id,name,access_token`
    );
    const pagesData = await pagesRes.json() as {
      data?: Array<{ id: string; name: string; access_token: string }>;
      error?: { message: string };
    };

    const page = pagesData.data?.[0];
    if (!page) {
      console.error('FB pages error:', pagesData.error);
      return NextResponse.redirect(`${base}?error=facebook_no_pages`);
    }

    // Subscribe page to webhooks
    await fetch(
      `https://graph.facebook.com/v22.0/${page.id}/subscribed_apps?access_token=${page.access_token}`,
      { method: 'POST', body: JSON.stringify({ subscribed_fields: 'messages,messaging_postbacks' }), headers: { 'Content-Type': 'application/json' } }
    );

    // Upsert channel
    const { error: dbErr } = await supabase.from('xenttech_channels').upsert({
      agent_id,
      channel_type:       'facebook',
      channel_name:       'Facebook Messenger',
      page_id:            page.id,
      page_name:          page.name,
      page_access_token:  page.access_token,
      is_connected:       true,
      connected_at:       new Date().toISOString(),
    }, { onConflict: 'agent_id,channel_type' });

    if (dbErr) console.error('FB DB error:', dbErr);

    return NextResponse.redirect(`${base}?connected=facebook`);
  }

  // ── Slack ─────────────────────────────────────────────────────────────────

  if (channel === 'slack') {
    const clientId     = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${base}?error=slack_not_configured`);
    }

    const form = new FormData();
    form.append('client_id',     clientId);
    form.append('client_secret', clientSecret);
    form.append('code',          code);
    form.append('redirect_uri',  redirectUri);

    const slackRes  = await fetch('https://slack.com/api/oauth.v2.access', { method: 'POST', body: form });
    const slackData = await slackRes.json() as {
      ok:              boolean;
      access_token?:   string;
      bot_user_id?:    string;
      team?:           { id: string; name: string };
      incoming_webhook?: { channel: string; channel_id: string };
      error?:          string;
    };

    if (!slackData.ok) {
      console.error('Slack OAuth error:', slackData.error);
      return NextResponse.redirect(`${base}?error=slack_oauth_failed`);
    }

    const channelName = slackData.incoming_webhook?.channel ?? slackData.team?.name ?? 'Slack';

    const { error: dbErr } = await supabase.from('xenttech_channels').upsert({
      agent_id,
      channel_type:   'slack',
      channel_name:   channelName,
      slack_bot_token: slackData.access_token,
      slack_team_id:   slackData.team?.id,
      slack_channel_id: slackData.incoming_webhook?.channel_id,
      is_connected:    true,
      connected_at:    new Date().toISOString(),
    }, { onConflict: 'agent_id,channel_type' });

    if (dbErr) console.error('Slack DB error:', dbErr);

    return NextResponse.redirect(`${base}?connected=slack`);
  }

  return NextResponse.redirect(base);
}
