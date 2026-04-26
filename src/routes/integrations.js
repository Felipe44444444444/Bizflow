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

module.exports = router;
