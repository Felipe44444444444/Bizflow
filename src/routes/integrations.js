const express      = require('express');
const crypto       = require('crypto');
const router       = express.Router();
const { supabaseAdmin }  = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');
const agentService   = require('../services/agentService');
const channelService = require('../services/channelService');

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
router.post('/slack/events', async (req, res) => {
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
}

// ══════════════════════════════════════════════════════════════════════════════
// META (FACEBOOK / INSTAGRAM / WHATSAPP) INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

const FB_BASE = 'https://graph.facebook.com/v18.0';

// Railway uses META_APP_SECRET / META_VERIFY_TOKEN; fall back to FACEBOOK_ variants
const metaAppSecret   = () => process.env.META_APP_SECRET   || process.env.FACEBOOK_APP_SECRET   || '';
const metaVerifyToken = () => process.env.META_VERIFY_TOKEN || process.env.FACEBOOK_VERIFY_TOKEN  || '';
const metaAppId       = () => process.env.FACEBOOK_APP_ID   || process.env.META_APP_ID            || '';

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
    const pgRes  = await fetch(`${FB_BASE}/me/accounts?access_token=${encodeURIComponent(longToken)}`);
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
router.post('/facebook/webhook', (req, res) => {
  if (!verifyMetaSig(req.rawBody, metaAppSecret(), req.headers['x-hub-signature-256'])) {
    console.warn('[FB Webhook] Invalid signature — rejected');
    return res.sendStatus(401);
  }
  res.sendStatus(200); // ACK immediately

  const body = req.body;
  setImmediate(async () => {
    if (body.object === 'page') {
      for (const entry of (body.entry || [])) {
        for (const evt of (entry.messaging || [])) {
          if (!evt.message?.text || evt.message?.is_echo) continue;
          await handleMetaMessage({ lookupField: 'page_id', lookupValue: entry.id, senderId: evt.sender.id, text: evt.message.text, platform: 'facebook' })
            .catch(e => console.error('[FB Webhook]', e.message));
        }
      }
    } else if (body.object === 'instagram') {
      for (const entry of (body.entry || [])) {
        for (const evt of (entry.messaging || [])) {
          if (!evt.message?.text || evt.message?.is_echo) continue;
          await handleMetaMessage({ lookupField: 'ig_account_id', lookupValue: entry.id, senderId: evt.sender.id, text: evt.message.text, platform: 'instagram' })
            .catch(e => console.error('[IG Webhook]', e.message));
        }
      }
    }
  });
});

async function handleMetaMessage({ lookupField, lookupValue, senderId, text, platform }) {
  const table = platform === 'instagram' ? 'instagram_integrations' : 'facebook_integrations';
  const { data: integration } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq(lookupField, lookupValue)
    .maybeSingle();
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
    externalId: `${lookupValue}_${senderId}`,
  });

  const result = await agentService.processMessage({ agentId, conversationId, userMessage: text, organizationId: integration.organization_id });
  if (!result.handoffRequested) {
    await channelService.sendMessage(fakeChannel, senderId, result.message);
  }
}

// ═════════════════════════ INSTAGRAM ══════════════════════════════════════════

// ── GET /api/integrations/instagram/connect?agent_id=xxx ─────────────────────
router.get('/instagram/connect', authMiddleware, (req, res) => {
  const appId       = metaAppId();
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !redirectUri) return res.status(500).json({ error: 'Instagram app not configured' });

  const state = req.query.agent_id
    ? `${req.organizationId}:${req.query.agent_id}`
    : req.organizationId;

  const scope = [
    'instagram_manage_messages',
    'pages_messaging',
    'pages_show_list',
    'pages_manage_metadata',
    'business_management',
  ].join(',');

  res.json({
    url: `https://www.facebook.com/v18.0/dialog/oauth`
      + `?client_id=${encodeURIComponent(appId)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&scope=${encodeURIComponent(scope)}`
      + `&state=${encodeURIComponent(state)}`,
  });
});

// ── GET /api/integrations/instagram/callback ──────────────────────────────────
router.get('/instagram/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${FRONTEND}/dashboard?ig_error=${encodeURIComponent(error)}`);
  if (!code || !state) return res.redirect(`${FRONTEND}/dashboard?ig_error=invalid_callback_params`);

  const [organizationId, agentId = null] = String(state).split(':');
  const baseUrl  = agentId ? `${FRONTEND}/agents/${agentId}?tab=canales` : `${FRONTEND}/dashboard`;
  const errorUrl = (m) => `${baseUrl}&ig_error=${encodeURIComponent(m)}`;

  try {
    const appId       = metaAppId();
    const appSecret   = metaAppSecret();
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

    if (!appSecret) throw new Error('META_APP_SECRET not configured on server');

    const tkRes  = await fetch(`${FB_BASE}/oauth/access_token?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`);
    const tkData = await tkRes.json();
    if (!tkData.access_token) throw new Error(tkData.error?.message || 'Token exchange failed');

    const llRes  = await fetch(`${FB_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(tkData.access_token)}`);
    const llData = await llRes.json();
    const longToken = llData.access_token || tkData.access_token;

    const pgRes  = await fetch(`${FB_BASE}/me/accounts?access_token=${encodeURIComponent(longToken)}`);
    const pgData = await pgRes.json();
    const pages  = pgData.data || [];
    if (pages.length === 0) throw new Error('No tienes páginas de Facebook vinculadas a tu cuenta');

    // Find the first page that has an Instagram Business account
    let igAccountId = null, igUsername = null, chosenPageId = null, chosenPageName = null, chosenPageToken = null;
    for (const page of pages) {
      try {
        const igRes  = await fetch(`${FB_BASE}/${page.id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(page.access_token)}`);
        const igData = await igRes.json();
        if (igData.instagram_business_account?.id) {
          igAccountId     = igData.instagram_business_account.id;
          igUsername      = igData.instagram_business_account.username || null;
          chosenPageId    = page.id;
          chosenPageName  = page.name;
          chosenPageToken = page.access_token;
          break;
        }
      } catch {}
    }

    if (!igAccountId) throw new Error('Ninguna de tus páginas tiene una cuenta de Instagram Business vinculada. Ve a Instagram → Configuración → Cambiar a cuenta profesional y vincula tu página.');

    // Subscribe page to messaging webhook
    try {
      await fetch(`${FB_BASE}/${chosenPageId}/subscribed_apps`, {
        method: 'POST',
        body: new URLSearchParams({ subscribed_fields: 'messages,messaging_postbacks', access_token: chosenPageToken }),
      });
    } catch {}

    const row = {
      organization_id:   organizationId,
      agent_id:          agentId || undefined,
      ig_account_id:     igAccountId,
      ig_username:       igUsername,
      page_id:           chosenPageId,
      page_name:         chosenPageName,
      page_access_token: chosenPageToken,
      is_active:         true,
      updated_at:        new Date().toISOString(),
    };
    const { error: dbErr } = await supabaseAdmin.from('instagram_integrations')
      .upsert(row, { onConflict: agentId ? 'agent_id' : 'organization_id' });
    if (dbErr) throw dbErr;

    const targetAgentId = agentId || await getFirstAgentId(organizationId);
    if (targetAgentId) {
      await upsertMetaChannel({ agentId: targetAgentId, organizationId, type: 'instagram', name: `Instagram — ${igUsername || chosenPageName}`, config: { access_token: chosenPageToken, ig_account_id: igAccountId, page_id: chosenPageId } });
    }

    console.log(`[Instagram OAuth] Connected: @${igUsername} (ig=${igAccountId}) page=${chosenPageName} org=${organizationId}`);
    res.redirect(`${baseUrl}&ig=connected`);
  } catch (err) {
    console.error('[Instagram OAuth] callback error:', err.message);
    res.redirect(errorUrl(err.message));
  }
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
    'business_management',
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
router.post('/whatsapp/webhook', (req, res) => {
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
          await handleWhatsAppMessage({ phoneNumberId: val.metadata?.phone_number_id, fromPhone: msg.from, text: msg.text?.body })
            .catch(e => console.error('[WA Webhook]', e.message));
        }
      }
    }
  });
});

async function handleWhatsAppMessage({ phoneNumberId, fromPhone, text }) {
  if (!text || !phoneNumberId) return;

  const { data: integration } = await supabaseAdmin
    .from('whatsapp_integrations')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();
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
    externalId: `${phoneNumberId}_${fromPhone}`,
  });

  const result = await agentService.processMessage({ agentId, conversationId, userMessage: text, organizationId: integration.organization_id });
  if (!result.handoffRequested) {
    await channelService.sendMessage(fakeChannel, fromPhone, result.message);
  }
}

module.exports = router;
