const express      = require('express');
const crypto       = require('crypto');
const router       = express.Router();
const { supabaseAdmin }  = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');
const agentService   = require('../services/agentService');
const channelService = require('../services/channelService');
const { upsertLead, notifyNewLead } = require('../services/leadService');
const { scheduleRetargeting } = require('../services/retargetingService');
const { webhookLimiter } = require('../middleware/rateLimit');

const FRONTEND = process.env.FRONTEND_URL || 'https://app.conectaachat.com';

// ── Slack signature verification ─────────────────────────────────────────────
function verifySlackSig(rawBody, secret, timestamp, sig) {
  if (!rawBody || !secret || !timestamp || !sig) return false;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;
  const base     = `v0:${timestamp}:${rawBody.toString()}`;
  const computed = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig));
  } catch {
    return false;
  }
}

// In-memory event dedup
const seenEventIds = new Set();
function dedupEvent(eventId) {
  if (!eventId) return false;
  if (seenEventIds.has(eventId)) return true;
  seenEventIds.add(eventId);
  setTimeout(() => seenEventIds.delete(eventId), 120_000);
  return false;
}

async function getFirstAgentId(organizationId) {
  const { data } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

// ── GET /api/integrations/slack/connect?agent_id=xxx ─────────────────────────
router.get('/slack/connect', authMiddleware, (req, res) => {
  const clientId    = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Slack app not configured on server' });
  }

  const { agent_id } = req.query;
  // State encodes "orgId:agentId" — agentId optional for backward compat
  const state = agent_id
    ? `${req.organizationId}:${agent_id}`
    : req.organizationId;

  const scope = [
    'chat:write',
    'channels:read',
    'channels:history',
    'im:write',
    'im:history',
    'app_mentions:read',
    'users:read',
  ].join(',');

  const url = 'https://slack.com/oauth/v2/authorize'
    + `?client_id=${encodeURIComponent(clientId)}`
    + `&scope=${encodeURIComponent(scope)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&state=${encodeURIComponent(state)}`;

  res.json({ url });
});

// ── GET /api/integrations/slack/callback ─────────────────────────────────────
router.get('/slack/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND}/dashboard?slack_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return res.redirect(`${FRONTEND}/dashboard?slack_error=invalid_callback_params`);
  }

  // Parse state: "orgId:agentId" or legacy "orgId"
  const parts          = String(state).split(':');
  const organizationId = parts[0];
  const agentId        = parts[1] || null;

  const successUrl = agentId
    ? `${FRONTEND}/agents/${agentId}?tab=canales&slack=connected`
    : `${FRONTEND}/dashboard?slack=connected`;
  const errorUrl = (msg) => agentId
    ? `${FRONTEND}/agents/${agentId}?tab=canales&slack_error=${encodeURIComponent(msg)}`
    : `${FRONTEND}/dashboard?slack_error=${encodeURIComponent(msg)}`;

  try {
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri:  process.env.SLACK_REDIRECT_URI,
      }),
    });

    const data = await tokenRes.json();
    if (!data.ok) throw new Error(data.error || 'oauth.v2.access failed');

    const accessToken = data.access_token;
    const teamId      = data.team?.id;
    const teamName    = data.team?.name;
    const botUserId   = data.bot_user_id;

    // Upsert slack_integrations keyed on agent_id (preferred) or org
    const upsertRow = {
      organization_id:    organizationId,
      agent_id:           agentId || undefined,
      slack_access_token: accessToken,
      slack_team_id:      teamId,
      slack_team_name:    teamName,
      slack_bot_user_id:  botUserId,
      updated_at:         new Date().toISOString(),
    };

    const { error: siErr } = await supabaseAdmin
      .from('slack_integrations')
      .upsert(upsertRow, { onConflict: agentId ? 'agent_id' : 'organization_id' });

    if (siErr) throw siErr;

    // Sync channels table
    const channelConfig = {
      bot_token:      accessToken,
      team_id:        teamId,
      team_name:      teamName,
      bot_user_id:    botUserId,
      signing_secret: process.env.SLACK_SIGNING_SECRET,
    };
    const targetAgentId = agentId || await getFirstAgentId(organizationId);

    if (targetAgentId) {
      const { data: existingCh } = await supabaseAdmin
        .from('channels')
        .select('id')
        .eq('agent_id', targetAgentId)
        .eq('type', 'slack')
        .maybeSingle();

      if (existingCh) {
        await supabaseAdmin
          .from('channels')
          .update({ config: channelConfig, is_active: true, connected_at: new Date().toISOString() })
          .eq('id', existingCh.id);
      } else {
        await supabaseAdmin
          .from('channels')
          .insert({
            agent_id:        targetAgentId,
            organization_id: organizationId,
            type:            'slack',
            name:            `Slack — ${teamName}`,
            config:          channelConfig,
            is_active:       true,
            connected_at:    new Date().toISOString(),
          });
      }
    }

    console.log(`[Slack OAuth] Connected: ${teamName} (${teamId}) org=${organizationId} agent=${agentId}`);
    res.redirect(successUrl);
  } catch (err) {
    console.error('[Slack OAuth] callback error:', err.message);
    res.redirect(errorUrl(err.message));
  }
});

// ── GET /api/integrations/slack/status?agent_id=xxx ──────────────────────────
router.get('/slack/status', authMiddleware, async (req, res) => {
  const { agent_id } = req.query;

  let query = supabaseAdmin
    .from('slack_integrations')
    .select('slack_team_name, updated_at');

  query = agent_id
    ? query.eq('agent_id', agent_id)
    : query.eq('organization_id', req.organizationId);

  const { data } = await query.maybeSingle();
  res.json({ connected: !!data, team_name: data?.slack_team_name ?? null });
});

// ── DELETE /api/integrations/slack?agent_id=xxx ───────────────────────────────
router.delete('/slack', authMiddleware, async (req, res) => {
  const { agent_id } = req.query;

  if (agent_id) {
    await Promise.all([
      supabaseAdmin.from('slack_integrations').delete().eq('agent_id', agent_id),
      supabaseAdmin.from('channels').update({ is_active: false }).eq('agent_id', agent_id).eq('type', 'slack'),
    ]);
  } else {
    await Promise.all([
      supabaseAdmin.from('slack_integrations').delete().eq('organization_id', req.organizationId),
      supabaseAdmin.from('channels').update({ is_active: false }).eq('organization_id', req.organizationId).eq('type', 'slack'),
    ]);
  }

  res.json({ disconnected: true });
});

// ── GET /api/integrations/slack/public-install/:agentId ─────────────────────
// Public — no auth. Returns agent info + Slack OAuth install URL.
router.get('/slack/public-install/:agentId', async (req, res) => {
  const { agentId } = req.params;
  const clientId    = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Slack no configurado en el servidor' });
  }

  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('id, name, company_name, organization_id, is_active')
    .eq('id', agentId)
    .single();

  if (error || !agent) return res.status(404).json({ error: 'Agente no encontrado' });
  if (!agent.is_active) return res.status(404).json({ error: 'Agente no disponible' });

  const scope = [
    'chat:write',
    'channels:history',
    'im:write',
    'im:history',
    'app_mentions:read',
  ].join(',');

  const state = `${agent.organization_id}:${agentId}`;

  const install_url = 'https://slack.com/oauth/v2/authorize'
    + `?client_id=${encodeURIComponent(clientId)}`
    + `&scope=${encodeURIComponent(scope)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&state=${encodeURIComponent(state)}`;

  res.json({
    agent_name:   agent.name,
    company_name: agent.company_name,
    install_url,
  });
});

// ── POST /api/integrations/slack/events ──────────────────────────────────────
router.post('/slack/events', webhookLimiter, async (req, res) => {
  const { type, challenge, team_id, event, event_id } = req.body;
  const secret = process.env.SLACK_SIGNING_SECRET;
  const ts     = req.headers['x-slack-request-timestamp'];
  const sig    = req.headers['x-slack-signature'];

  if (type === 'url_verification') {
    if (secret && !verifySlackSig(req.rawBody, secret, ts, sig)) {
      return res.status(401).send('Invalid signature');
    }
    return res.json({ challenge });
  }

  if (!verifySlackSig(req.rawBody, secret, ts, sig)) {
    console.warn('[Slack Events] Invalid signature — rejected');
    return res.status(401).send('Invalid signature');
  }

  if (type !== 'event_callback' || !event || !team_id) return res.status(200).send();

  if (dedupEvent(event_id)) return res.status(200).send();

  // ACK within 3 s — processing is async
  res.status(200).send();

  // Skip bot messages, edits, deletions
  if (event.bot_id || event.bot_profile || event.subtype) return;
  if (event.type !== 'message' && event.type !== 'app_mention') return;

  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  // Reply in-thread for mentions, direct for DMs
  const threadTs = event.type === 'app_mention' ? event.ts : undefined;

  setImmediate(() =>
    handleSlackEvent({ team_id, userId: event.user, slackChannel: event.channel, text, threadTs })
      .catch(err => console.error('[Slack Events] handleSlackEvent:', err.message))
  );
});

async function handleSlackEvent({ team_id, userId, slackChannel, text, threadTs }) {
  // 1. Look up integration by team_id
  const { data: integration } = await supabaseAdmin
    .from('slack_integrations')
    .select('*')
    .eq('slack_team_id', team_id)
    .maybeSingle();

  if (!integration) {
    console.warn(`[Slack Events] No integration for team ${team_id}`);
    return;
  }

  // 2. Resolve agent — use stored agent_id or fall back to first active agent
  const agentId = integration.agent_id || await getFirstAgentId(integration.organization_id);
  if (!agentId) {
    console.warn(`[Slack Events] No active agent for org ${integration.organization_id}`);
    return;
  }

  // 3. Find or lazy-create the channels record for this agent
  let { data: channel } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('agent_id', agentId)
    .eq('type', 'slack')
    .eq('is_active', true)
    .maybeSingle();

  if (!channel) {
    const { data: newCh } = await supabaseAdmin
      .from('channels')
      .insert({
        agent_id:        agentId,
        organization_id: integration.organization_id,
        type:            'slack',
        name:            `Slack — ${integration.slack_team_name}`,
        config: {
          bot_token:      integration.slack_access_token,
          team_id:        integration.slack_team_id,
          team_name:      integration.slack_team_name,
          bot_user_id:    integration.slack_bot_user_id,
          signing_secret: process.env.SLACK_SIGNING_SECRET,
        },
        is_active:    true,
        connected_at: new Date().toISOString(),
      })
      .select()
      .single();

    channel = newCh;
  }

  if (!channel) return;

  // 4. Always use fresh token from integration record
  const channelWithToken = {
    ...channel,
    config: { ...channel.config, bot_token: integration.slack_access_token },
  };

  // 5. Find or create conversation keyed by team+user
  const conversationId = await agentService.findOrCreateConversation({
    agentId,
    channelId:      channel.id,
    organizationId: integration.organization_id,
    externalId:     `${team_id}_${userId}`,
  });

  // 6. RAG + Claude pipeline
  const result = await agentService.processMessage({
    agentId,
    conversationId,
    userMessage:    text,
    organizationId: integration.organization_id,
  });

  // 7. Reply to Slack
  if (!result.handoffRequested) {
    const opts = threadTs ? { thread_ts: threadTs } : {};
    await channelService.sendMessage(channelWithToken, slackChannel, result.message, opts);
  }

  // 8. Capture lead (fire and forget)
  setImmediate(() => captureSlackLead({
    orgId:          integration.organization_id,
    agentId,
    teamId:         team_id,
    userId,
    text,
    token:          integration.slack_access_token,
  }).catch(e => console.error('[Slack Lead]', e.message)));
}

async function captureSlackLead({ orgId, agentId, teamId, userId, text, token }) {
  let nombre = null, email = null, telefono = null;

  try {
    const infoRes = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const info = await infoRes.json();
    if (info.ok && info.user) {
      nombre   = info.user.real_name || info.user.profile?.real_name || null;
      email    = info.user.profile?.email  || null;
      telefono = info.user.profile?.phone  || null;
    }
  } catch {}

  const { lead, isNew } = await upsertLead({
    orgId,
    agentId,
    canal:         'slack',
    canalUserId:   `${teamId}_${userId}`,
    canalUsername: nombre,
    nombre,
    email,
    telefono,
    adSource:      'organic',
    primerMensaje: text,
  });

  if (isNew && lead) {
    const { data: agent } = await supabaseAdmin.from('agents').select('name').eq('id', agentId).maybeSingle();
    notifyNewLead({ lead, agentName: agent?.name, orgId }).catch(() => {});
    console.log(`[Lead] new Slack lead — org=${orgId} user=${userId}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// META (FACEBOOK / INSTAGRAM / WHATSAPP) INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

const FB_BASE = 'https://graph.facebook.com/v18.0';
const IG_BASE = 'https://graph.instagram.com';

// Railway uses META_APP_SECRET / META_VERIFY_TOKEN; fall back to FACEBOOK_ variants
const metaAppSecret   = () => process.env.META_APP_SECRET   || process.env.FACEBOOK_APP_SECRET   || '';
const metaVerifyToken = () => process.env.META_VERIFY_TOKEN || process.env.FACEBOOK_VERIFY_TOKEN  || '';
const metaAppId       = () => process.env.FACEBOOK_APP_ID   || process.env.META_APP_ID            || '';
const igAppId         = () => process.env.INSTAGRAM_APP_ID  || metaAppId();
const igAppSecret     = () => process.env.INSTAGRAM_APP_SECRET || metaAppSecret();

// ── Meta webhook signature verification ──────────────────────────────────────
function verifyMetaSig(rawBody, secret, sig) {
  if (!rawBody || !secret || !sig) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig)); } catch { return false; }
}

// ── Upsert channel record for Meta channels ───────────────────────────────────
async function upsertMetaChannel({ agentId, organizationId, type, name, config }) {
  const { data: existing } = await supabaseAdmin
    .from('channels')
    .select('id')
    .eq('agent_id', agentId)
    .eq('type', type)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin.from('channels')
      .update({ config, name, is_active: true, connected_at: new Date().toISOString() })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data: ch } = await supabaseAdmin.from('channels')
    .insert({ agent_id: agentId, organization_id: organizationId, type, name, config, is_active: true, connected_at: new Date().toISOString() })
    .select('id').single();
  return ch?.id;
}

// ── Auto-detect and connect Instagram Business from a Facebook Page ───────────
async function detectAndConnectInstagram(pageId, pageAccessToken, pageName, orgId, agentId) {
  const detailRes = await fetch(
    `${FB_BASE}/${pageId}?fields=instagram_business_account{id,username,name}&access_token=${encodeURIComponent(pageAccessToken)}`
  );
  const detailData = await detailRes.json();
  const ig = detailData.instagram_business_account;

  if (!ig?.id) {
    console.log(`[Instagram Auto-Detect] No IG Business account linked to page: ${pageName} (${pageId})`);
    return null;
  }

  console.log(`[Instagram Auto-Detect] Found IG account: @${ig.username} (${ig.id}) for page: ${pageName}`);

  // Upsert instagram_integrations (needed by webhook handler)
  const row = {
    organization_id:   orgId,
    agent_id:          agentId || undefined,
    ig_account_id:     ig.id,
    ig_username:       ig.username || null,
    page_id:           pageId,
    page_name:         pageName,
    page_access_token: pageAccessToken,
    is_active:         true,
    updated_at:        new Date().toISOString(),
  };
  const { error: dbErr } = await supabaseAdmin
    .from('instagram_integrations')
    .upsert(row, { onConflict: agentId ? 'agent_id' : 'organization_id' });
  if (dbErr) console.error('[Instagram Auto-Detect] DB error:', dbErr.message);

  // Upsert channel record
  if (agentId) {
    await upsertMetaChannel({
      agentId, organizationId: orgId,
      type: 'instagram',
      name: ig.username ? `Instagram — @${ig.username}` : `Instagram — ${ig.name || ig.id}`,
      config: { access_token: pageAccessToken, ig_account_id: ig.id, ig_account_id_alias: ig.id, page_id: pageId },
    });
  }

  // Subscribe IG account to webhook messaging events (best effort)
  try {
    const subRes = await fetch(
      `${FB_BASE}/${ig.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(pageAccessToken)}`,
      { method: 'POST' }
    );
    const subData = await subRes.json();
    console.log(`[Instagram Auto-Detect] Webhook subscription:`, JSON.stringify(subData));
  } catch (e) {
    console.warn('[Instagram Auto-Detect] Webhook subscription failed:', e.message);
  }

  return { ig_account_id: ig.id, ig_username: ig.username };
}

// ═════════════════════════ FACEBOOK ═══════════════════════════════════════════

// ── GET /api/integrations/facebook/connect?agent_id=xxx ──────────────────────
router.get('/facebook/connect', authMiddleware, (req, res) => {
  const appId       = metaAppId();
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
  if (!appId || !redirectUri) return res.status(500).json({ error: 'Facebook app not configured' });

  const state = req.query.agent_id
    ? `${req.organizationId}:${req.query.agent_id}`
    : req.organizationId;

  const scope = [
    'pages_messaging',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_metadata',
    'instagram_basic',
    'instagram_manage_messages',
    'instagram_manage_comments',
  ].join(',');

  res.json({
    url: `https://www.facebook.com/v18.0/dialog/oauth`
      + `?client_id=${encodeURIComponent(appId)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&scope=${encodeURIComponent(scope)}`
      + `&state=${encodeURIComponent(state)}`,
  });
});

// ── GET /api/integrations/facebook/callback ───────────────────────────────────
router.get('/facebook/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${FRONTEND}/dashboard?fb_error=${encodeURIComponent(error)}`);
  if (!code || !state) return res.redirect(`${FRONTEND}/dashboard?fb_error=invalid_callback_params`);

  const [organizationId, agentId = null] = String(state).split(':');
  const baseUrl = agentId ? `${FRONTEND}/agents/${agentId}?tab=canales` : `${FRONTEND}/dashboard`;
  const errorUrl = (m) => `${baseUrl}&fb_error=${encodeURIComponent(m)}`;

  try {
    const appId       = metaAppId();
    const appSecret   = metaAppSecret();
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

    if (!appSecret) throw new Error('META_APP_SECRET not configured on server');

    // Short-lived → long-lived token
    const tkRes  = await fetch(`${FB_BASE}/oauth/access_token?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`);
    const tkData = await tkRes.json();
    if (!tkData.access_token) throw new Error(tkData.error?.message || 'Token exchange failed');

    const llRes  = await fetch(`${FB_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(tkData.access_token)}`);
    const llData = await llRes.json();
    const longToken = llData.access_token || tkData.access_token;

    // Pages list — store all, auto-select first
    const pgRes  = await fetch(`${FB_BASE}/me/accounts?fields=instagram_business_account,name,access_token&access_token=${encodeURIComponent(longToken)}`);
    const pgData = await pgRes.json();
    const pages  = pgData.data || [];
    if (pages.length === 0) throw new Error('No tienes páginas de Facebook administradas. Crea una página primero.');

    const { id: pageId, name: pageName, access_token: pageToken } = pages[0];

    // Subscribe page to messaging webhook (best effort)
    try {
      await fetch(`${FB_BASE}/${pageId}/subscribed_apps`, {
        method: 'POST',
        body: new URLSearchParams({ subscribed_fields: 'messages,messaging_postbacks', access_token: pageToken }),
      });
    } catch {}

    // Store all pages (with tokens) so user can switch without re-OAuth
    const availablePages = pages.map(p => ({ id: p.id, name: p.name, access_token: p.access_token }));

    const row = {
      organization_id:   organizationId,
      agent_id:          agentId || undefined,
      page_id:           pageId,
      page_name:         pageName,
      page_access_token: pageToken,
      user_access_token: longToken,
      available_pages:   availablePages,
      is_active:         true,
      updated_at:        new Date().toISOString(),
    };
    const { error: dbErr } = await supabaseAdmin.from('facebook_integrations')
      .upsert(row, { onConflict: agentId ? 'agent_id' : 'organization_id' });
    if (dbErr) throw dbErr;

    const targetAgentId = agentId || await getFirstAgentId(organizationId);
    if (targetAgentId) {
      await upsertMetaChannel({ agentId: targetAgentId, organizationId, type: 'facebook', name: `Facebook — ${pageName}`, config: { access_token: pageToken, page_id: pageId, page_name: pageName } });
    }

    // Auto-detect Instagram Business account linked to this Facebook Page
    detectAndConnectInstagram(pageId, pageToken, pageName, organizationId, targetAgentId)
      .catch(e => console.warn('[Instagram Auto-Detect] Error:', e.message));

    console.log(`[Facebook OAuth] Connected: ${pageName} (${pageId}) total_pages=${pages.length} org=${organizationId}`);

    // If multiple pages, redirect with page list so dashboard can show a picker
    if (pages.length > 1) {
      const pageList = encodeURIComponent(JSON.stringify(pages.map(p => ({ id: p.id, name: p.name }))));
      return res.redirect(`${baseUrl}&fb=connected&fb_pages=${pageList}`);
    }
    res.redirect(`${baseUrl}&fb=connected`);
  } catch (err) {
    console.error('[Facebook OAuth] callback error:', err.message);
    res.redirect(errorUrl(err.message));
  }
});

// ── POST /api/integrations/facebook/select-page — switch active page ──────────
router.post('/facebook/select-page', authMiddleware, async (req, res) => {
  const { agent_id, page_id } = req.body;
  if (!agent_id || !page_id) return res.status(400).json({ error: 'agent_id and page_id required' });

  const { data: integration } = await supabaseAdmin
    .from('facebook_integrations')
    .select('*')
    .eq('agent_id', agent_id)
    .maybeSingle();

  if (!integration) return res.status(404).json({ error: 'Integration not found' });

  const page = (integration.available_pages || []).find(p => p.id === page_id);
  if (!page) return res.status(404).json({ error: 'Page not found in saved list' });

  // Subscribe new page to webhook (best effort)
  try {
    await fetch(`${FB_BASE}/${page.id}/subscribed_apps`, {
      method: 'POST',
      body: new URLSearchParams({ subscribed_fields: 'messages,messaging_postbacks', access_token: page.access_token }),
    });
  } catch {}

  await supabaseAdmin.from('facebook_integrations')
    .update({ page_id: page.id, page_name: page.name, page_access_token: page.access_token, updated_at: new Date().toISOString() })
    .eq('agent_id', agent_id);

  await upsertMetaChannel({ agentId: agent_id, organizationId: req.organizationId, type: 'facebook', name: `Facebook — ${page.name}`, config: { access_token: page.access_token, page_id: page.id, page_name: page.name } });

  // Auto-detect Instagram on page switch
  detectAndConnectInstagram(page.id, page.access_token, page.name, req.organizationId, agent_id)
    .catch(e => console.warn('[Instagram Auto-Detect] Error on page switch:', e.message));

  res.json({ ok: true, page_id: page.id, page_name: page.name });
});

// ── GET /api/integrations/facebook/status?agent_id=xxx ───────────────────────
router.get('/facebook/status', authMiddleware, async (req, res) => {
  const { agent_id } = req.query;
  let q = supabaseAdmin.from('facebook_integrations').select('page_name, available_pages, updated_at');
  q = agent_id ? q.eq('agent_id', agent_id) : q.eq('organization_id', req.organizationId);
  const { data } = await q.maybeSingle();
  res.json({
    connected:        !!data,
    page_name:        data?.page_name        ?? null,
    available_pages:  data?.available_pages  ?? [],
  });
});

// ── DELETE /api/integrations/facebook?agent_id=xxx ───────────────────────────
router.delete('/facebook', authMiddleware, async (req, res) => {
  const { agent_id } = req.query;
  const filter = agent_id ? { agent_id } : { organization_id: req.organizationId };
  await Promise.all([
    supabaseAdmin.from('facebook_integrations').delete().match(filter),
    supabaseAdmin.from('channels').update({ is_active: false }).match(agent_id ? { agent_id, type: 'facebook' } : { organization_id: req.organizationId, type: 'facebook' }),
  ]);
  res.json({ disconnected: true });
});

// ── GET /api/integrations/facebook/webhook (verify) ──────────────────────────
router.get('/facebook/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === metaVerifyToken()) return res.send(challenge);
  res.sendStatus(403);
});

// ── POST /api/integrations/facebook/webhook (Messenger + Instagram DM) ───────
router.post('/facebook/webhook', webhookLimiter, (req, res) => {
  const sig = req.headers['x-hub-signature-256'];
  const validFb = verifyMetaSig(req.rawBody, metaAppSecret(), sig);
  const validIg = verifyMetaSig(req.rawBody, igAppSecret(), sig);
  if (!validFb && !validIg) {
    console.warn('[FB Webhook] Invalid signature — rejected');
    return res.sendStatus(401);
  }
  res.sendStatus(200); // ACK immediately

  const body = req.body;
  setImmediate(async () => {
    try {
      console.log(`[Meta Webhook] object=${body.object} entries=${body.entry?.length}`);
      if (body.object === 'page') {
        for (const entry of (body.entry || [])) {
          for (const evt of (entry.messaging || [])) {
            if (!evt.message?.text || evt.message?.is_echo) continue;
            if (dedupEvent(evt.message.mid)) continue;
            await handleMetaMessage({
              lookupField: 'page_id', lookupValue: entry.id,
              senderId: evt.sender.id, text: evt.message.text, platform: 'facebook',
              referral: evt.referral || null,
            }).catch(e => console.error('[FB Webhook]', e.message));
          }
        }
      } else if (body.object === 'instagram') {
        for (const entry of (body.entry || [])) {
          console.log(`[IG Webhook] entry.id=${entry.id} messaging_count=${entry.messaging?.length}`);
          for (const evt of (entry.messaging || [])) {
            if (!evt.message?.text || evt.message?.is_echo) continue;
            if (dedupEvent(evt.message.mid)) continue;
            await handleMetaMessage({
              lookupField: 'ig_account_id', lookupValue: entry.id,
              senderId: evt.sender.id, text: evt.message.text, platform: 'instagram',
              referral: evt.referral || null,
            }).catch(e => console.error('[IG Webhook]', e.message));
          }
        }
      } else {
        console.log('[Meta Webhook] unhandled object type:', body.object);
      }
    } catch (e) {
      console.error('[Meta Webhook] unhandled error:', e.message);
    }
  });
});

async function handleMetaMessage({ lookupField, lookupValue, senderId, text, platform, referral }) {
  const table = platform === 'instagram' ? 'instagram_integrations' : 'facebook_integrations';
  const { data: rows } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq(lookupField, lookupValue)
    .eq('is_active', true)
    .limit(1);
  const integration = rows?.[0];
  if (!integration) return console.warn(`[Meta/${platform}] No integration for ${lookupField}=${lookupValue}`);

  const agentId = integration.agent_id || await getFirstAgentId(integration.organization_id);
  if (!agentId) return;

  const channelConfig = platform === 'instagram'
    ? { access_token: integration.page_access_token, ig_account_id: integration.ig_account_id, page_id: integration.page_id }
    : { access_token: integration.page_access_token, page_id: integration.page_id };

  const channelId = await upsertMetaChannel({
    agentId, organizationId: integration.organization_id, type: platform,
    name: platform === 'instagram'
      ? `Instagram — ${integration.ig_username || integration.page_name}`
      : `Facebook — ${integration.page_name}`,
    config: channelConfig,
  });
  if (!channelId) return;

  const fakeChannel = { id: channelId, type: platform, config: channelConfig };
  const conversationId = await agentService.findOrCreateConversation({
    agentId, channelId, organizationId: integration.organization_id,
    externalId:    `${lookupValue}_${senderId}`,
    sourceChannel: platform,
  });

  const result = await agentService.processMessage({ agentId, conversationId, userMessage: text, organizationId: integration.organization_id });
  if (!result.handoffRequested) {
    await channelService.sendMessage(fakeChannel, senderId, result.message);
  }

  // Capture lead (fire and forget)
  setImmediate(() => captureMetaLead({
    orgId:        integration.organization_id,
    agentId,
    platform,
    senderId,
    text,
    referral,
    integration,
    conversationId,
    lookupValue,
  }).catch(e => console.error(`[${platform} Lead]`, e.message)));
}

async function captureMetaLead({ orgId, agentId, platform, senderId, text, referral, integration, conversationId, lookupValue }) {
  const token = integration.page_access_token;

  // Fetch user profile from Graph API
  let nombre = null;
  try {
    const fields = platform === 'instagram' ? 'name,username' : 'name';
    const profileRes = await fetch(`${FB_BASE}/${senderId}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
    const profileData = await profileRes.json();
    nombre = profileData.name || profileData.username || null;
  } catch {}

  // Update conversation contact_name if not set yet
  if (nombre && conversationId) {
    supabaseAdmin
      .from('conversations')
      .update({ contact_name: nombre })
      .eq('id', conversationId)
      .is('contact_name', null)
      .then(() => {}).catch(() => {});
  }

  // Extract ad/referral data
  const adId         = referral?.ad_id    || null;
  const adName       = referral?.headline || null;
  const campaignId   = referral?.ref      || null;
  const adSource     = referral?.source === 'ADS' ? `${platform}_ad` : 'organic';
  const referralUrl  = referral?.ref_type === 'OPEN_THREAD' ? null : (referral?.referral_url || null);

  const { lead, isNew } = await upsertLead({
    orgId,
    agentId,
    canal:          platform,
    canalUserId:    senderId,
    canalUsername:  nombre,
    nombre,
    adId,
    adName,
    campaignId,
    adSource,
    referralUrl,
    primerMensaje:  text,
    conversationId,
    fbPageId:       platform === 'facebook' ? lookupValue : null,
    igAccountId:    platform === 'instagram' ? lookupValue : null,
  });

  if (isNew && lead) {
    const { data: agent } = await supabaseAdmin.from('agents').select('name').eq('id', agentId).maybeSingle();
    notifyNewLead({ lead, agentName: agent?.name, orgId }).catch(() => {});
    scheduleRetargeting(lead.id, agentId, orgId, platform).catch(e => console.error('[Meta Retargeting]', e.message));
    console.log(`[Lead] new ${platform} lead — org=${orgId} sender=${senderId}`);
  }
}

// ═════════════════════════ INSTAGRAM ══════════════════════════════════════════

// ── GET /api/integrations/instagram/connect?agent_id=xxx ─────────────────────
// Uses Instagram Business Login — works without a Facebook Page connection
const IG_REDIRECT_URI = 'https://api.conectaachat.com/api/integrations/instagram/callback';

router.get('/instagram/connect', authMiddleware, (req, res) => {
  const appId = igAppId();
  if (!appId) return res.status(500).json({ error: 'Instagram app not configured' });

  const state = req.query.agent_id
    ? `${req.organizationId}:${req.query.agent_id}`
    : req.organizationId;

  const scope = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
  ].join(',');

  const url = `https://www.instagram.com/oauth/authorize`
    + `?client_id=${encodeURIComponent(appId)}`
    + `&redirect_uri=${encodeURIComponent(IG_REDIRECT_URI)}`
    + `&scope=${encodeURIComponent(scope)}`
    + `&response_type=code`
    + `&state=${encodeURIComponent(state)}`;

  console.log('[Instagram connect] ig_app_id:', appId, '| redirect_uri:', IG_REDIRECT_URI);
  console.log('[Instagram connect] full URL:', url);
  res.json({ url });
});

// ── GET /api/integrations/instagram/callback ──────────────────────────────────
router.get('/instagram/callback', async (req, res) => {
  const { code, state, error } = req.query;
  console.log('[Instagram callback] raw req.url:', req.url);
  console.log('[Instagram callback] params:', { code: code ? 'present' : 'missing', state, error });
  if (error) {
    const agentId = String(state || '').split(':')[1] || null;
    const dest    = agentId ? `${FRONTEND}/channels/instagram/callback` : `${FRONTEND}/dashboard`;
    return res.redirect(`${dest}?error=${encodeURIComponent(error)}&agent_id=${agentId || ''}`);
  }
  if (!code || !state) {
    return res.redirect(`${FRONTEND}/channels/instagram/callback?error=${encodeURIComponent('invalid_callback_params')}`);
  }

  const [organizationId, agentId = null] = String(state).split(':');
  const cbUrl   = `${FRONTEND}/channels/instagram/callback`;
  const errDest = (m) => `${cbUrl}?error=${encodeURIComponent(m)}&agent_id=${agentId || ''}`;

  try {
    const appId     = igAppId();
    const appSecret = igAppSecret();
    if (!appId || !appSecret) throw new Error('Instagram app not configured');

    // Step 1: exchange code → short-lived Instagram token
    const tkBody = new URLSearchParams({
      client_id:     appId,
      client_secret: appSecret,
      grant_type:    'authorization_code',
      redirect_uri:  IG_REDIRECT_URI,
      code,
    });
    console.log('[Instagram callback] POST body:', tkBody.toString());
    console.log('[Instagram callback] client_id used:', appId);
    console.log('[Instagram callback] redirect_uri used:', IG_REDIRECT_URI);
    const tkRes  = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body:   tkBody,
    });
    const tkRaw  = await tkRes.text();
    console.log('[Instagram callback] token raw response:', tkRaw);
    const tkData = JSON.parse(tkRaw);
    if (!tkData.access_token) throw new Error(tkData.error_message || 'Instagram token exchange failed');

    // Step 2: exchange → long-lived token (60 days)
    const llRes  = await fetch(
      `${IG_BASE}/access_token`
      + `?grant_type=ig_exchange_token`
      + `&client_id=${encodeURIComponent(appId)}`
      + `&client_secret=${encodeURIComponent(appSecret)}`
      + `&access_token=${encodeURIComponent(tkData.access_token)}`
    );
    const llData = await llRes.json();
    console.log('[Instagram callback] long token:', { has_token: !!llData.access_token, error: llData.error?.message });
    const longToken = llData.access_token || tkData.access_token;

    // Step 3: get Instagram user info
    const meRes  = await fetch(
      `${IG_BASE}/me?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(longToken)}`
    );
    const meData = await meRes.json();
    console.log('[Instagram callback] me:', JSON.stringify(meData));
    if (!meData.id) throw new Error(meData.error?.message || 'Could not retrieve Instagram account info');

    const igAccountId = meData.id;
    const igUsername  = meData.username || null;
    const igName      = meData.name     || null;

    // Save to DB
    const row = {
      organization_id:   organizationId,
      agent_id:          agentId || undefined,
      ig_account_id:     igAccountId,
      ig_username:       igUsername,
      page_id:           null,
      page_name:         null,
      page_access_token: longToken,
      is_active:         true,
      updated_at:        new Date().toISOString(),
    };
    const { error: dbErr } = await supabaseAdmin.from('instagram_integrations')
      .upsert(row, { onConflict: agentId ? 'agent_id' : 'organization_id' });
    if (dbErr) throw dbErr;

    const targetAgentId = agentId || await getFirstAgentId(organizationId);
    if (targetAgentId) {
      await upsertMetaChannel({
        agentId:        targetAgentId,
        organizationId,
        type:           'instagram',
        name:           `Instagram — ${igUsername || igName || igAccountId}`,
        config:         { access_token: longToken, ig_account_id: igAccountId, page_id: null },
      });
    }

    // Subscribe this account to receive webhook message events.
    // Must use /{ig-user-id}/subscribed_apps — /me alias is not reliable here.
    const subRes = await fetch(
      `${IG_BASE}/v21.0/${igAccountId}/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(longToken)}`,
      { method: 'POST' }
    );
    const subData = await subRes.json();
    console.log('[Instagram OAuth] webhook subscription:', JSON.stringify(subData));

    console.log(`[Instagram OAuth] Connected: @${igUsername} (ig=${igAccountId}) org=${organizationId}`);
    res.redirect(`${cbUrl}?ig_account_id=${encodeURIComponent(igAccountId)}&ig_username=${encodeURIComponent(igUsername || '')}&agent_id=${agentId || ''}`);
  } catch (err) {
    console.error('[Instagram callback] error:', err.message);
    res.redirect(errDest(err.message));
  }
});

// ── GET /api/integrations/instagram/webhook (verify — for IG Business Login app) ─
router.get('/instagram/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === metaVerifyToken()) return res.send(challenge);
  res.sendStatus(403);
});

// ── POST /api/integrations/instagram/webhook (IG Business Login app webhooks) ──
router.post('/instagram/webhook', webhookLimiter, (req, res) => {
  const sig = req.headers['x-hub-signature-256'];
  if (!verifyMetaSig(req.rawBody, igAppSecret(), sig) && !verifyMetaSig(req.rawBody, metaAppSecret(), sig)) {
    console.warn('[IG Webhook] Invalid signature — rejected');
    return res.sendStatus(401);
  }
  res.sendStatus(200);

  const body = req.body;
  setImmediate(async () => {
    try {
      console.log(`[IG Webhook] object=${body.object} entries=${body.entry?.length}`);
      for (const entry of (body.entry || [])) {
        console.log(`[IG Webhook] entry.id=${entry.id} messaging_count=${entry.messaging?.length}`);
        for (const evt of (entry.messaging || [])) {
          if (!evt.message?.text || evt.message?.is_echo) continue;
          if (dedupEvent(evt.message.mid)) continue;
          await handleMetaMessage({ lookupField: 'ig_account_id', lookupValue: entry.id, senderId: evt.sender.id, text: evt.message.text, platform: 'instagram' })
            .catch(e => console.error('[IG Webhook]', e.message));
        }
      }
    } catch (e) {
      console.error('[IG Webhook] unhandled error:', e.message);
    }
  });
});

// ── GET /api/integrations/instagram/status?agent_id=xxx ──────────────────────
router.get('/instagram/status', authMiddleware, async (req, res) => {
  const { agent_id } = req.query;
  let q = supabaseAdmin.from('instagram_integrations').select('ig_account_id, ig_username, page_name, updated_at');
  q = agent_id ? q.eq('agent_id', agent_id) : q.eq('organization_id', req.organizationId);
  const { data } = await q.maybeSingle();
  res.json({ connected: !!(data?.ig_account_id), ig_username: data?.ig_username ?? null, page_name: data?.page_name ?? null });
});

// ── DELETE /api/integrations/instagram?agent_id=xxx ──────────────────────────
router.delete('/instagram', authMiddleware, async (req, res) => {
  const { agent_id } = req.query;
  const filter = agent_id ? { agent_id } : { organization_id: req.organizationId };
  await Promise.all([
    supabaseAdmin.from('instagram_integrations').delete().match(filter),
    supabaseAdmin.from('channels').update({ is_active: false }).match(agent_id ? { agent_id, type: 'instagram' } : { organization_id: req.organizationId, type: 'instagram' }),
  ]);
  res.json({ disconnected: true });
});

// ═════════════════════════ WHATSAPP ════════════════════════════════════════════

// ── GET /api/integrations/whatsapp/connect?agent_id=xxx ──────────────────────
router.get('/whatsapp/connect', authMiddleware, (req, res) => {
  const appId       = metaAppId();
  const redirectUri = process.env.WHATSAPP_REDIRECT_URI;
  if (!appId || !redirectUri) return res.status(500).json({ error: 'WhatsApp app not configured' });

  const state = req.query.agent_id
    ? `${req.organizationId}:${req.query.agent_id}`
    : req.organizationId;

  const scope = [
    'whatsapp_business_messaging',
    'whatsapp_business_management',
  ].join(',');

  res.json({
    url: `https://www.facebook.com/v18.0/dialog/oauth`
      + `?client_id=${encodeURIComponent(appId)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&scope=${encodeURIComponent(scope)}`
      + `&state=${encodeURIComponent(state)}`,
  });
});

// ── GET /api/integrations/whatsapp/callback ───────────────────────────────────
router.get('/whatsapp/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${FRONTEND}/dashboard?wa_error=${encodeURIComponent(error)}`);
  if (!code || !state) return res.redirect(`${FRONTEND}/dashboard?wa_error=invalid_callback_params`);

  const [organizationId, agentId = null] = String(state).split(':');
  const baseUrl  = agentId ? `${FRONTEND}/agents/${agentId}?tab=canales` : `${FRONTEND}/dashboard`;
  const errorUrl = (m) => `${baseUrl}&wa_error=${encodeURIComponent(m)}`;

  try {
    const appId       = metaAppId();
    const appSecret   = metaAppSecret();
    const redirectUri = process.env.WHATSAPP_REDIRECT_URI;

    if (!appSecret) throw new Error('META_APP_SECRET not configured on server');

    const tkRes  = await fetch(`${FB_BASE}/oauth/access_token?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`);
    const tkData = await tkRes.json();
    if (!tkData.access_token) throw new Error(tkData.error?.message || 'Token exchange failed');

    const llRes  = await fetch(`${FB_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(tkData.access_token)}`);
    const llData = await llRes.json();
    const longToken = llData.access_token || tkData.access_token;

    // Try /me/whatsapp_business_accounts first, fall back to /me/businesses
    let wabaId = null, displayPhone = null, phoneNumberId = null;

    const wabaRes  = await fetch(`${FB_BASE}/me/whatsapp_business_accounts?access_token=${encodeURIComponent(longToken)}`);
    const wabaData = await wabaRes.json();
    const wabas    = wabaData.data || [];

    if (wabas.length > 0) {
      wabaId = wabas[0].id;
    } else {
      // Fallback: get via business manager
      const bizRes  = await fetch(`${FB_BASE}/me/businesses?access_token=${encodeURIComponent(longToken)}`);
      const bizData = await bizRes.json();
      const businesses = bizData.data || [];
      if (businesses.length === 0) throw new Error('No tienes una cuenta de WhatsApp Business asociada. Necesitas una cuenta de Meta Business Suite.');

      for (const biz of businesses) {
        const wRes  = await fetch(`${FB_BASE}/${biz.id}/owned_whatsapp_business_accounts?access_token=${encodeURIComponent(longToken)}`);
        const wData = await wRes.json();
        if (wData.data?.length > 0) { wabaId = wData.data[0].id; break; }
      }
      if (!wabaId) throw new Error('No se encontró ninguna cuenta WABA asociada a tu negocio.');
    }

    const phoneRes  = await fetch(`${FB_BASE}/${wabaId}/phone_numbers?access_token=${encodeURIComponent(longToken)}`);
    const phoneData = await phoneRes.json();
    const phones    = phoneData.data || [];
    if (phones.length === 0) throw new Error('La cuenta WABA no tiene números de teléfono registrados');

    phoneNumberId = phones[0].id;
    displayPhone  = phones[0].display_phone_number;

    const row = {
      organization_id: organizationId,
      agent_id:        agentId || undefined,
      phone_number_id: phoneNumberId,
      waba_id:         wabaId,
      display_phone:   displayPhone,
      access_token:    longToken,
      is_active:       true,
      updated_at:      new Date().toISOString(),
    };
    const { error: dbErr } = await supabaseAdmin.from('whatsapp_integrations')
      .upsert(row, { onConflict: agentId ? 'agent_id' : 'organization_id' });
    if (dbErr) throw dbErr;

    const targetAgentId = agentId || await getFirstAgentId(organizationId);
    if (targetAgentId) {
      await upsertMetaChannel({ agentId: targetAgentId, organizationId, type: 'whatsapp', name: `WhatsApp — ${displayPhone}`, config: { access_token: longToken, phone_number_id: phoneNumberId, waba_id: wabaId, display_phone: displayPhone } });
    }

    console.log(`[WhatsApp OAuth] Connected: ${displayPhone} waba=${wabaId} org=${organizationId}`);
    res.redirect(`${baseUrl}&wa=connected`);
  } catch (err) {
    console.error('[WhatsApp OAuth] callback error:', err.message);
    res.redirect(errorUrl(err.message));
  }
});

// ── POST /api/integrations/whatsapp/manual-setup (admin use — no self-service OAuth) ─
router.post('/whatsapp/manual-setup', authMiddleware, async (req, res) => {
  const { agent_id, organization_id, phone_number_id, waba_id, display_phone, access_token: waToken } = req.body;

  if (!agent_id || !phone_number_id || !waba_id || !display_phone || !waToken) {
    return res.status(400).json({ error: 'agent_id, phone_number_id, waba_id, display_phone, access_token are required' });
  }

  const orgId = organization_id || req.organizationId;

  try {
    // Validate agent exists and belongs to org
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!agent) return res.status(404).json({ error: 'Agent not found or does not belong to this organization' });

    // Probe the token — mark inactive if it fails
    let tokenValid = false;
    let tokenWarning = null;
    try {
      const probeRes  = await fetch(`${FB_BASE}/${phone_number_id}?fields=id,verified_name,display_phone_number,status&access_token=${encodeURIComponent(waToken)}`);
      const probeData = await probeRes.json();
      if (probeRes.ok && probeData.id) {
        tokenValid = true;
        console.log(`[WA Manual Setup] Token valid — number: ${probeData.display_phone_number} status: ${probeData.status}`);
      } else {
        tokenWarning = probeData?.error?.message || 'Token verification failed';
        console.warn(`[WA Manual Setup] Token probe failed: ${tokenWarning}`);
      }
    } catch (e) {
      tokenWarning = e.message;
    }

    const row = {
      organization_id: orgId,
      agent_id,
      phone_number_id,
      waba_id,
      display_phone,
      access_token: waToken,
      is_active:    tokenValid,
      updated_at:   new Date().toISOString(),
    };

    const { data: integration, error: dbErr } = await supabaseAdmin
      .from('whatsapp_integrations')
      .upsert(row, { onConflict: 'agent_id' })
      .select()
      .single();

    if (dbErr) throw dbErr;

    // Upsert channel record
    await upsertMetaChannel({
      agentId: agent_id,
      organizationId: orgId,
      type: 'whatsapp',
      name: `WhatsApp — ${display_phone}`,
      config: { access_token: waToken, phone_number_id, waba_id, display_phone },
    });

    console.log(`[WA Manual Setup] Configured: ${display_phone} (phone_id=${phone_number_id} waba=${waba_id}) agent=${agent_id} active=${tokenValid}`);

    res.json({
      success: true,
      integration,
      token_valid: tokenValid,
      ...(tokenWarning ? { warning: tokenWarning } : {}),
    });
  } catch (err) {
    console.error('[WA Manual Setup] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/integrations/instagram/manual-setup (admin — no Instagram OAuth) ─
router.post('/instagram/manual-setup', authMiddleware, async (req, res) => {
  const { agent_id, organization_id, ig_account_id, ig_username, page_id, use_facebook_token } = req.body;

  if (!agent_id || !ig_account_id) {
    return res.status(400).json({ error: 'agent_id and ig_account_id are required' });
  }

  const orgId = organization_id || req.organizationId;

  try {
    // Validate agent belongs to org
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!agent) return res.status(404).json({ error: 'Agent not found or does not belong to this organization' });

    // Resolve access token
    let accessToken = null;
    let resolvedPageId = page_id || null;
    let resolvedPageName = null;

    if (use_facebook_token) {
      const { data: fbInt } = await supabaseAdmin
        .from('facebook_integrations')
        .select('page_access_token, page_id, page_name')
        .eq('agent_id', agent_id)
        .eq('is_active', true)
        .maybeSingle();

      if (!fbInt) {
        return res.status(400).json({ error: 'No active Facebook integration found for this agent. Connect Facebook first.' });
      }

      accessToken    = fbInt.page_access_token;
      resolvedPageId = resolvedPageId || fbInt.page_id;
      resolvedPageName = fbInt.page_name;
    }

    if (!accessToken) {
      return res.status(400).json({ error: 'No access token available. Set use_facebook_token: true.' });
    }

    // Probe the IG account
    let tokenValid = false;
    let tokenWarning = null;
    let resolvedUsername = ig_username || null;

    try {
      const probeRes  = await fetch(`${FB_BASE}/${ig_account_id}?fields=username,name&access_token=${encodeURIComponent(accessToken)}`);
      const probeData = await probeRes.json();
      if (probeRes.ok && probeData.id) {
        tokenValid = true;
        resolvedUsername = probeData.username || ig_username || null;
        console.log(`[IG Manual Setup] Token valid — @${resolvedUsername} (${ig_account_id})`);
      } else {
        tokenWarning = probeData?.error?.message || 'Token verification failed';
        console.warn(`[IG Manual Setup] Token probe failed: ${tokenWarning}`);
      }
    } catch (e) {
      tokenWarning = e.message;
    }

    // Upsert instagram_integrations
    const row = {
      organization_id: orgId,
      agent_id,
      ig_account_id,
      ig_username:       resolvedUsername,
      page_id:           resolvedPageId,
      page_name:         resolvedPageName,
      page_access_token: accessToken,
      is_active:         tokenValid,
      updated_at:        new Date().toISOString(),
    };

    const { data: integration, error: dbErr } = await supabaseAdmin
      .from('instagram_integrations')
      .upsert(row, { onConflict: 'agent_id' })
      .select()
      .single();

    if (dbErr) throw dbErr;

    // Upsert channel record
    await upsertMetaChannel({
      agentId: agent_id,
      organizationId: orgId,
      type: 'instagram',
      name: `Instagram — @${resolvedUsername || ig_account_id}`,
      config: { access_token: accessToken, ig_account_id, ig_account_id_alias: ig_account_id, page_id: resolvedPageId },
    });

    // Subscribe page to Instagram webhook fields
    if (resolvedPageId && tokenValid) {
      try {
        const subRes = await fetch(`${FB_BASE}/${resolvedPageId}/subscribed_apps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscribed_fields: 'messages,messaging_postbacks',
            access_token: accessToken,
          }),
        });
        const subData = await subRes.json();
        if (subData.success) {
          console.log(`[IG Manual Setup] Webhook subscribed for page ${resolvedPageId}`);
        } else {
          const subWarning = subData?.error?.message || 'Webhook subscription failed';
          console.warn(`[IG Manual Setup] Webhook subscription failed: ${subWarning}`);
          if (!tokenWarning) tokenWarning = `Webhook: ${subWarning}`;
        }
      } catch (e) {
        console.warn('[IG Manual Setup] Webhook subscription error:', e.message);
      }
    }

    console.log(`[IG Manual Setup] Configured: @${resolvedUsername} (${ig_account_id}) page=${resolvedPageId} agent=${agent_id} active=${tokenValid}`);

    res.json({
      success: true,
      integration,
      token_valid: tokenValid,
      ...(tokenWarning ? { warning: tokenWarning } : {}),
    });
  } catch (err) {
    console.error('[IG Manual Setup] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/integrations/whatsapp/status?agent_id=xxx ───────────────────────
router.get('/whatsapp/status', authMiddleware, async (req, res) => {
  const { agent_id } = req.query;
  let q = supabaseAdmin.from('whatsapp_integrations').select('display_phone, waba_id, updated_at');
  q = agent_id ? q.eq('agent_id', agent_id) : q.eq('organization_id', req.organizationId);
  const { data } = await q.maybeSingle();
  res.json({ connected: !!data, display_phone: data?.display_phone ?? null, waba_id: data?.waba_id ?? null });
});

// ── DELETE /api/integrations/whatsapp?agent_id=xxx ───────────────────────────
router.delete('/whatsapp', authMiddleware, async (req, res) => {
  const { agent_id } = req.query;
  const filter = agent_id ? { agent_id } : { organization_id: req.organizationId };
  await Promise.all([
    supabaseAdmin.from('whatsapp_integrations').delete().match(filter),
    supabaseAdmin.from('channels').update({ is_active: false }).match(agent_id ? { agent_id, type: 'whatsapp' } : { organization_id: req.organizationId, type: 'whatsapp' }),
  ]);
  res.json({ disconnected: true });
});

// ── GET /api/integrations/whatsapp/webhook (verify) ──────────────────────────
router.get('/whatsapp/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === metaVerifyToken()) return res.send(challenge);
  res.sendStatus(403);
});

// ── POST /api/integrations/whatsapp/webhook ───────────────────────────────────
router.post('/whatsapp/webhook', webhookLimiter, (req, res) => {
  if (!verifyMetaSig(req.rawBody, metaAppSecret(), req.headers['x-hub-signature-256'])) {
    console.warn('[WA Webhook] Invalid signature — rejected');
    return res.sendStatus(401);
  }
  res.sendStatus(200);

  const body = req.body;
  setImmediate(async () => {
    if (body.object !== 'whatsapp_business_account') return;
    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;
        const val = change.value;
        for (const msg of (val.messages || [])) {
          if (msg.type !== 'text') continue;
          if (dedupEvent(msg.id)) continue;
          const contactName = val.contacts?.find(c => c.wa_id === msg.from)?.profile?.name || null;
          await handleWhatsAppMessage({
            phoneNumberId: val.metadata?.phone_number_id,
            fromPhone:     msg.from,
            text:          msg.text?.body,
            contactName,
            referral:      msg.referral || null,
          }).catch(e => console.error('[WA Webhook]', e.message));
        }
      }
    }
  });
});

async function handleWhatsAppMessage({ phoneNumberId, fromPhone, text, contactName, referral }) {
  if (!text || !phoneNumberId) return;

  const { data: rows } = await supabaseAdmin
    .from('whatsapp_integrations')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .eq('is_active', true)
    .limit(1);
  const integration = rows?.[0];
  if (!integration) return console.warn(`[WhatsApp] No integration for phone_number_id=${phoneNumberId}`);

  const agentId = integration.agent_id || await getFirstAgentId(integration.organization_id);
  if (!agentId) return;

  const channelConfig = { access_token: integration.access_token, phone_number_id: integration.phone_number_id, waba_id: integration.waba_id, display_phone: integration.display_phone };

  const channelId = await upsertMetaChannel({
    agentId, organizationId: integration.organization_id, type: 'whatsapp',
    name: `WhatsApp — ${integration.display_phone}`, config: channelConfig,
  });
  if (!channelId) return;

  const fakeChannel = { id: channelId, type: 'whatsapp', config: channelConfig };
  const conversationId = await agentService.findOrCreateConversation({
    agentId, channelId, organizationId: integration.organization_id,
    externalId:    `${phoneNumberId}_${fromPhone}`,
    contactPhone:  fromPhone,
    contactName,
    sourceChannel: 'whatsapp',
  });

  const result = await agentService.processMessage({ agentId, conversationId, userMessage: text, organizationId: integration.organization_id });
  if (!result.handoffRequested) {
    await channelService.sendMessage(fakeChannel, fromPhone, result.message);
  }

  // Capture lead (fire and forget)
  setImmediate(() => captureWhatsAppLead({
    orgId:         integration.organization_id,
    agentId,
    fromPhone,
    contactName,
    text,
    referral,
    conversationId,
    waPhoneNumber: integration.display_phone,
  }).catch(e => console.error('[WA Lead]', e.message)));
}

async function captureWhatsAppLead({ orgId, agentId, fromPhone, contactName, text, referral, conversationId, waPhoneNumber }) {
  const adId        = referral?.source_id || null;
  const adName      = referral?.headline  || null;
  const adSource    = referral?.source_type === 'AD' ? 'whatsapp_ad' : 'organic';

  const { lead, isNew } = await upsertLead({
    orgId,
    agentId,
    canal:          'whatsapp',
    canalUserId:    fromPhone,
    canalUsername:  contactName,
    nombre:         contactName,
    telefono:       fromPhone,
    adId,
    adName,
    adSource,
    primerMensaje:  text,
    conversationId,
    waPhoneNumber,
  });

  if (isNew && lead) {
    const { data: agent } = await supabaseAdmin.from('agents').select('name').eq('id', agentId).maybeSingle();
    notifyNewLead({ lead, agentName: agent?.name, orgId }).catch(() => {});
    scheduleRetargeting(lead.id, agentId, orgId, 'whatsapp').catch(e => console.error('[WA Retargeting]', e.message));
    console.log(`[Lead] new WhatsApp lead — org=${orgId} phone=${fromPhone}`);
  }
}

// ── POST /api/integrations/meta/data-deletion ─────────────────────────────────
// Required by Meta for App Review. Called when a user requests data deletion
// via Facebook's platform. Verifies signed_request, removes user data, returns
// a status URL.
router.post('/meta/data-deletion', async (req, res) => {
  const { signed_request } = req.body;
  if (!signed_request) return res.status(400).json({ error: 'Missing signed_request' });

  try {
    const [encodedSig, payload] = signed_request.split('.');
    const secret = igAppSecret() || metaAppSecret();
    if (!secret) throw new Error('App secret not configured');

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    if (encodedSig !== expectedSig) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    const userId = data.user_id;

    // Delete all data associated with this Meta user ID (best effort across tables)
    await Promise.allSettled([
      supabaseAdmin.from('instagram_integrations').delete().or(`ig_account_id.eq.${userId}`),
      supabaseAdmin.from('facebook_integrations').delete().or(`page_id.eq.${userId}`),
    ]);

    console.log(`[Data Deletion] Processed request for Meta user_id=${userId}`);

    const confirmationCode = `del_${userId}_${Date.now()}`;
    const statusUrl = `${FRONTEND}/data-deletion?code=${confirmationCode}`;

    res.json({ url: statusUrl, confirmation_code: confirmationCode });
  } catch (err) {
    console.error('[Data Deletion] error:', err.message);
    res.status(500).json({ error: 'Failed to process deletion request' });
  }
});

// ── POST /api/integrations/instagram/detect — force IG re-detection from existing FB page ─
router.post('/instagram/detect', authMiddleware, async (req, res) => {
  const { agent_id, organization_id } = req.body;
  const agentId = agent_id;
  const orgId   = organization_id || req.organizationId;

  if (!agentId) return res.status(400).json({ error: 'agent_id required' });

  try {
    // Find active Facebook integration for this agent
    const { data: fbInt } = await supabaseAdmin
      .from('facebook_integrations')
      .select('page_id, page_name, page_access_token')
      .eq('agent_id', agentId)
      .eq('is_active', true)
      .maybeSingle();

    if (!fbInt?.page_access_token) {
      return res.status(404).json({ error: 'No hay integración de Facebook activa para este agente. Conecta Facebook primero.' });
    }

    const result = await detectAndConnectInstagram(fbInt.page_id, fbInt.page_access_token, fbInt.page_name, orgId, agentId);

    if (!result) {
      return res.status(400).json({
        error: 'La página de Facebook no tiene una cuenta de Instagram Business vinculada.',
        help: 'Ve a Configuración de Instagram → Cambiar a cuenta profesional → Empresa. Luego en tu Página de Facebook → Configuración → Instagram → Conectar cuenta.',
      });
    }

    res.json({ success: true, ig_account_id: result.ig_account_id, ig_username: result.ig_username });
  } catch (err) {
    console.error('[Instagram Detect] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /instagram/connect-via-facebook — usa el token de FB ya almacenado para conectar IG
router.post('/instagram/connect-via-facebook', authMiddleware, async (req, res) => {
  const { agent_id } = req.body;
  if (!agent_id) return res.status(400).json({ error: 'agent_id requerido' });

  const { data: fbChannel } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('agent_id', agent_id)
    .eq('organization_id', req.organizationId)
    .eq('type', 'facebook')
    .eq('is_active', true)
    .maybeSingle();

  if (!fbChannel?.config?.access_token || !fbChannel?.config?.page_id) {
    return res.status(404).json({
      error: 'No hay una página de Facebook conectada para este agente. Conecta Facebook primero.',
    });
  }

  const { access_token, page_id } = fbChannel.config;

  const igRes = await fetch(
    `https://graph.facebook.com/v19.0/${page_id}?fields=instagram_business_account{id,username,name,profile_picture_url}&access_token=${access_token}`
  );
  const igData = await igRes.json();
  console.log('[IG via FB] igData:', JSON.stringify(igData));

  if (!igData.instagram_business_account?.id) {
    return res.status(400).json({
      error: 'La página de Facebook no tiene una cuenta de Instagram Business vinculada.',
      help: 'Ve a Configuración de Instagram → Cuenta → Cambiar a cuenta profesional → Empresa. Luego en tu Página de Facebook → Configuración → Instagram → Conectar cuenta.',
      page_id,
    });
  }

  const ig = igData.instagram_business_account;
  const { page_name: fbPageName } = fbChannel.config;

  // Use detectAndConnectInstagram so both instagram_integrations and channels are populated
  const igResult = await detectAndConnectInstagram(page_id, access_token, fbPageName || page_id, req.organizationId, agent_id);

  if (!igResult) {
    return res.status(400).json({
      error: 'La página de Facebook no tiene una cuenta de Instagram Business vinculada.',
      help: 'Ve a Configuración de Instagram → Cuenta → Cambiar a cuenta profesional → Empresa. Luego en tu Página de Facebook → Configuración → Instagram → Conectar cuenta.',
      page_id,
    });
  }

  console.log(`[IG via FB] Connected @${igResult.ig_username} (${igResult.ig_account_id}) agent=${agent_id}`);
  res.json({ success: true, ig_account_id: igResult.ig_account_id, ig_username: igResult.ig_username });
});

// ── POST /api/integrations/backfill-names ─────────────────────────────────────
// Updates conversations.contact_name from leads table for rows where it's null
router.post('/backfill-names', authMiddleware, async (req, res) => {
  const { data: nullConvs } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .is('contact_name', null)
    .eq('organization_id', req.organizationId)
    .limit(500);

  if (!nullConvs?.length) return res.json({ updated: 0 });

  let updated = 0;
  for (const conv of nullConvs) {
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('name, canal_username, source_channel, canal_user_id')
      .eq('conversation_id', conv.id)
      .not('name', 'is', null)
      .maybeSingle();

    if (lead?.name) {
      await supabaseAdmin
        .from('conversations')
        .update({ contact_name: lead.name })
        .eq('id', conv.id);
      updated++;
    } else if (lead?.canal_username) {
      await supabaseAdmin
        .from('conversations')
        .update({ contact_name: '@' + lead.canal_username })
        .eq('id', conv.id);
      updated++;
    }
  }

  res.json({ updated });
});

module.exports = router;
