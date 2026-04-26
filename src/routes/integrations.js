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

// In-memory event dedup (prevents double-processing Slack retries)
const seenEventIds = new Set();
function dedupEvent(eventId) {
  if (!eventId) return false;
  if (seenEventIds.has(eventId)) return true;
  seenEventIds.add(eventId);
  setTimeout(() => seenEventIds.delete(eventId), 120_000);
  return false;
}

// ── GET /api/integrations/slack/connect ──────────────────────────────────────
// Returns the Slack OAuth URL. Caller redirects to it.
router.get('/slack/connect', authMiddleware, (req, res) => {
  const clientId    = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Slack app not configured on server' });
  }

  const scope = 'chat:write,channels:read,im:write,users:read';
  const state = req.organizationId;

  const url = 'https://slack.com/oauth/v2/authorize'
    + `?client_id=${encodeURIComponent(clientId)}`
    + `&scope=${encodeURIComponent(scope)}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&state=${encodeURIComponent(state)}`;

  res.json({ url });
});

// ── GET /api/integrations/slack/callback ─────────────────────────────────────
// Called by Slack after the user authorizes. Public endpoint (no JWT).
router.get('/slack/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND}/dashboard?slack_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return res.redirect(`${FRONTEND}/dashboard?slack_error=invalid_callback_params`);
  }

  const organizationId = String(state);

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.SLACK_REDIRECT_URI,
      }),
    });

    const data = await tokenRes.json();
    if (!data.ok) throw new Error(data.error || 'oauth.v2.access failed');

    const accessToken  = data.access_token;
    const teamId       = data.team?.id;
    const teamName     = data.team?.name;
    const botUserId    = data.bot_user_id;

    // 1. Upsert org-level record
    const { error: siErr } = await supabaseAdmin
      .from('slack_integrations')
      .upsert({
        organization_id:    organizationId,
        slack_access_token: accessToken,
        slack_team_id:      teamId,
        slack_team_name:    teamName,
        slack_bot_user_id:  botUserId,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'organization_id' });

    if (siErr) throw siErr;

    // 2. Sync with channels table so the existing webhook routing works
    const channelConfig = {
      bot_token:      accessToken,
      team_id:        teamId,
      team_name:      teamName,
      bot_user_id:    botUserId,
      signing_secret: process.env.SLACK_SIGNING_SECRET,
    };

    // Find the first active agent for this org
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (agent) {
      // Check if a Slack channel already exists for this agent
      const { data: existingCh } = await supabaseAdmin
        .from('channels')
        .select('id')
        .eq('agent_id', agent.id)
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
            agent_id:        agent.id,
            organization_id: organizationId,
            type:            'slack',
            name:            `Slack — ${teamName}`,
            config:          channelConfig,
            is_active:       true,
            connected_at:    new Date().toISOString(),
          });
      }
    }

    console.log(`[Slack OAuth] Connected: ${teamName} (${teamId}) org=${organizationId}`);
    res.redirect(`${FRONTEND}/dashboard?slack=connected`);
  } catch (err) {
    console.error('[Slack OAuth] callback error:', err.message);
    res.redirect(`${FRONTEND}/dashboard?slack_error=${encodeURIComponent(err.message)}`);
  }
});

// ── GET /api/integrations/slack/status ───────────────────────────────────────
router.get('/slack/status', authMiddleware, async (req, res) => {
  const { data } = await supabaseAdmin
    .from('slack_integrations')
    .select('slack_team_name, updated_at')
    .eq('organization_id', req.organizationId)
    .maybeSingle();

  res.json({ connected: !!data, team_name: data?.slack_team_name ?? null });
});

// ── DELETE /api/integrations/slack ───────────────────────────────────────────
router.delete('/slack', authMiddleware, async (req, res) => {
  await supabaseAdmin
    .from('slack_integrations')
    .delete()
    .eq('organization_id', req.organizationId);

  // Deactivate matching channels records
  await supabaseAdmin
    .from('channels')
    .update({ is_active: false })
    .eq('organization_id', req.organizationId)
    .eq('type', 'slack');

  res.json({ disconnected: true });
});

// ── POST /api/integrations/slack/events ──────────────────────────────────────
// Public endpoint — called by Slack Events API. No JWT auth.
router.post('/slack/events', async (req, res) => {
  const { type, challenge, team_id, event, event_id } = req.body;
  const secret = process.env.SLACK_SIGNING_SECRET;
  const ts     = req.headers['x-slack-request-timestamp'];
  const sig    = req.headers['x-slack-signature'];

  // Handle URL verification challenge (Slack sends this when you first set the URL)
  if (type === 'url_verification') {
    if (secret && !verifySlackSig(req.rawBody, secret, ts, sig)) {
      return res.status(401).send('Invalid signature');
    }
    return res.json({ challenge });
  }

  // Reject invalid signatures on all other requests
  if (!verifySlackSig(req.rawBody, secret, ts, sig)) {
    console.warn('[Slack Events] Invalid signature — rejected');
    return res.status(401).send('Invalid signature');
  }

  // Only handle event_callback with an actual event
  if (type !== 'event_callback' || !event || !team_id) return res.status(200).send();

  // Deduplicate retries from Slack
  if (dedupEvent(event_id)) return res.status(200).send();

  // ACK within 3 s — processing happens async
  res.status(200).send();

  // Skip bot messages (own replies, edited, deleted, etc.)
  if (event.bot_id || event.bot_profile || event.subtype) return;
  if (event.type !== 'message' && event.type !== 'app_mention') return;

  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  // For channel mentions reply in-thread; for DMs (channel starts with D) no thread
  const threadTs = event.type === 'app_mention' ? event.ts : undefined;

  setImmediate(() =>
    handleSlackEvent({ team_id, userId: event.user, slackChannel: event.channel, text, threadTs })
      .catch(err => console.error('[Slack Events] handleSlackEvent:', err.message))
  );
});

async function handleSlackEvent({ team_id, userId, slackChannel, text, threadTs }) {
  // 1. Look up integration by Slack team_id
  const { data: integration } = await supabaseAdmin
    .from('slack_integrations')
    .select('*')
    .eq('slack_team_id', team_id)
    .maybeSingle();

  if (!integration) {
    console.warn(`[Slack Events] No integration for team ${team_id}`);
    return;
  }

  // 2. Find the channels record (created during OAuth for the first agent)
  let { data: channel } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('organization_id', integration.organization_id)
    .eq('type', 'slack')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  // 3. Lazy-create channels record if OAuth ran before any agents existed
  if (!channel) {
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('organization_id', integration.organization_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!agent) {
      console.warn(`[Slack Events] No active agent for org ${integration.organization_id}`);
      return;
    }

    const { data: newCh } = await supabaseAdmin
      .from('channels')
      .insert({
        agent_id:        agent.id,
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

  // 4. Ensure token is fresh from integration (not the potentially stale channels config)
  const channelWithToken = {
    ...channel,
    config: { ...channel.config, bot_token: integration.slack_access_token },
  };

  // 5. Find or create conversation
  const conversationId = await agentService.findOrCreateConversation({
    agentId:        channel.agent_id,
    channelId:      channel.id,
    organizationId: channel.organization_id,
    externalId:     `${team_id}_${userId}`,
  });

  // 6. Run the RAG + Claude pipeline
  const result = await agentService.processMessage({
    agentId:        channel.agent_id,
    conversationId,
    userMessage:    text,
    organizationId: channel.organization_id,
  });

  // 7. Send reply back to Slack (unless handed off to human)
  if (!result.handoffRequested) {
    const opts = threadTs ? { thread_ts: threadTs } : {};
    await channelService.sendMessage(channelWithToken, slackChannel, result.message, opts);
  }
}

module.exports = router;
