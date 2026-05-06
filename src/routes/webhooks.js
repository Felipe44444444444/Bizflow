const { Router } = require('express');
const crypto = require('crypto');
const { supabaseAdmin } = require('../config/supabase');
const { webhookLimiter } = require('../middleware/rateLimit');
const agentService = require('../services/agentService');
const channelService = require('../services/channelService');

const router = Router();
router.use(webhookLimiter);

// ── Signature helpers ─────────────────────────────────────────────────────────

function verifyMetaSignature(rawBody, appSecret, signature) {
  if (!signature || !appSecret || !rawBody) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function verifySlackSignature(rawBody, signingSecret, timestamp, slackSig) {
  if (!timestamp || !slackSig || !signingSecret || !rawBody) return false;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;
  const base = `v0:${timestamp}:${rawBody.toString()}`;
  const computed = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(base)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(slackSig));
  } catch {
    return false;
  }
}

// ── Meta (Instagram + Facebook Messenger) ────────────────────────────────────

// GET /api/webhooks/meta — Meta webhook verification handshake
router.get('/meta', async (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe' || !token) return res.status(403).send('Forbidden');

  // Find any active channel whose config.verify_token matches
  const { data: channel } = await supabaseAdmin
    .from('channels')
    .select('id')
    .in('type', ['instagram', 'facebook'])
    .eq('is_active', true)
    .filter('config->>verify_token', 'eq', token)
    .limit(1)
    .maybeSingle();

  // Fallback to global env token
  if (!channel && token !== process.env.META_VERIFY_TOKEN) {
    return res.status(403).send('Forbidden');
  }

  res.status(200).send(challenge);
});

// POST /api/webhooks/meta — Incoming Instagram / Facebook events
router.post('/meta', (req, res) => {
  if (!verifyMetaSignature(req.rawBody, process.env.META_APP_SECRET, req.headers['x-hub-signature-256'])) {
    return res.status(401).send('Invalid signature');
  }

  // Meta requires <5 s response; process async
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  if (body.object !== 'instagram' && body.object !== 'page') return;

  setImmediate(() => processMetaPayload(body));
});

async function processMetaPayload(body) {
  const channelType = body.object === 'instagram' ? 'instagram' : 'facebook';

  for (const entry of body.entry || []) {
    const pageId = String(entry.id);

    // Format 1 — entry.messaging[] (Messenger / Instagram Direct)
    for (const ev of entry.messaging || []) {
      if (!ev.message || ev.message.is_echo) continue;
      const senderId = ev.sender?.id;
      if (!senderId) continue;
      const text = ev.message.text || describeAttachments(ev.message.attachments);
      if (!text) continue;
      await handleMetaMessage({ channelType, pageId, senderId, text });
    }

    // Format 2 — entry.changes[] (Instagram Business / Graph API webhooks)
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      // Nested messaging array inside value
      for (const ev of value.messages || []) {
        if (ev.is_echo) continue;
        const senderId = ev.sender?.id || value.sender?.id;
        if (!senderId) continue;
        const text = ev.text || describeAttachments(ev.attachments);
        if (!text) continue;
        await handleMetaMessage({ channelType, pageId, senderId, text });
      }

      // Single message object (some webhook subscriptions)
      if (value.message && !value.message.is_echo) {
        const senderId = value.sender?.id;
        if (senderId) {
          const text = value.message.text || describeAttachments(value.message.attachments);
          if (text) await handleMetaMessage({ channelType, pageId, senderId, text });
        }
      }
    }
  }
}

function describeAttachments(attachments) {
  if (!attachments?.length) return null;
  const types = [...new Set(attachments.map(a => a.type))];
  return `[${types.join(', ')}]`;
}

async function handleMetaMessage({ channelType, pageId, senderId, text }) {
  try {
    const { data: channel } = await supabaseAdmin
      .from('channels')
      .select('*, agents(*)')
      .eq('type', channelType)
      .eq('is_active', true)
      .filter('config->>page_id', 'eq', pageId)
      .limit(1)
      .maybeSingle();

    if (!channel) return;

    // Typing indicator — non-fatal
    channelService.sendTypingIndicator(channel, senderId).catch(() => {});

    const conversationId = await agentService.findOrCreateConversation({
      agentId:        channel.agent_id,
      channelId:      channel.id,
      organizationId: channel.organization_id,
      externalId:     senderId,
      sourceChannel:  channelType,
    });

    const result = await agentService.processMessage({
      agentId:        channel.agent_id,
      conversationId,
      userMessage:    text,
      organizationId: channel.organization_id,
    });

    if (!result.handoffRequested) {
      await channelService.sendMessage(channel, senderId, result.message);
    }
  } catch (err) {
    console.error(`[Meta ${channelType}] handler error (sender=${senderId}):`, err.message);
  }
}

// ── WhatsApp Business ─────────────────────────────────────────────────────────

router.get('/whatsapp', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.status(403).send('Forbidden');
});

router.post('/whatsapp', (req, res) => {
  if (!verifyMetaSignature(req.rawBody, process.env.META_APP_SECRET, req.headers['x-hub-signature-256'])) {
    return res.status(401).send('Invalid signature');
  }

  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  setImmediate(() => processWhatsAppPayload(body));
});

async function processWhatsAppPayload(body) {
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages) continue;

      for (const message of value.messages) {
        if (message.type !== 'text') continue;

        const senderPhone   = message.from;
        const text          = message.text.body;
        const phoneNumberId = value.metadata.phone_number_id;

        try {
          const { data: channel } = await supabaseAdmin
            .from('channels')
            .select('*')
            .eq('type', 'whatsapp')
            .eq('is_active', true)
            .filter('config->>phone_number_id', 'eq', phoneNumberId)
            .limit(1)
            .maybeSingle();

          if (!channel) continue;

          const conversationId = await agentService.findOrCreateConversation({
            agentId:        channel.agent_id,
            channelId:      channel.id,
            organizationId: channel.organization_id,
            externalId:     senderPhone,
            contactPhone:   senderPhone,
            sourceChannel:  'whatsapp',
          });

          const result = await agentService.processMessage({
            agentId:        channel.agent_id,
            conversationId,
            userMessage:    text,
            organizationId: channel.organization_id,
          });

          if (!result.handoffRequested) {
            await channelService.sendMessage(channel, senderPhone, result.message);
          }
        } catch (err) {
          console.error(`[WhatsApp] handler error (sender=${senderPhone}):`, err.message);
        }
      }
    }
  }
}

// ── Slack ─────────────────────────────────────────────────────────────────────

router.post('/slack', async (req, res) => {
  const { type, challenge, team_id, event } = req.body;

  // URL verification — echoed before any per-channel lookup is possible
  if (type === 'url_verification') {
    const sig = req.headers['x-slack-signature'];
    const ts  = req.headers['x-slack-request-timestamp'];
    const secret = process.env.SLACK_SIGNING_SECRET;
    if (secret && !verifySlackSignature(req.rawBody, secret, ts, sig)) {
      return res.status(401).send('Invalid signature');
    }
    return res.json({ challenge });
  }

  if (type !== 'event_callback' || !event || !team_id) return res.status(200).send();

  // Look up channel to get per-channel signing secret
  const { data: channel } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('type', 'slack')
    .eq('is_active', true)
    .filter('config->>team_id', 'eq', team_id)
    .limit(1)
    .maybeSingle();

  if (!channel) return res.status(200).send();

  const signingSecret = channel.config?.signing_secret || process.env.SLACK_SIGNING_SECRET;
  const ts  = req.headers['x-slack-request-timestamp'];
  const sig = req.headers['x-slack-signature'];

  if (!verifySlackSignature(req.rawBody, signingSecret, ts, sig)) {
    return res.status(401).send('Invalid signature');
  }

  // Acknowledge within 3 s
  res.status(200).send();

  // Skip bot messages, edits, and deletions
  if (event.bot_id || event.subtype) return;
  if (event.type !== 'message' && event.type !== 'app_mention') return;

  // Strip <@BOTID> mentions (present in app_mention events)
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) return;

  const userId       = event.user;
  const slackChannel = event.channel;

  setImmediate(() => processSlackEvent({ channel, team_id, userId, slackChannel, text }));
});

async function processSlackEvent({ channel, team_id, userId, slackChannel, text }) {
  try {
    const conversationId = await agentService.findOrCreateConversation({
      agentId:        channel.agent_id,
      channelId:      channel.id,
      organizationId: channel.organization_id,
      externalId:     `${team_id}_${userId}`,
    });

    const result = await agentService.processMessage({
      agentId:        channel.agent_id,
      conversationId,
      userMessage:    text,
      organizationId: channel.organization_id,
    });

    if (!result.handoffRequested) {
      await channelService.sendMessage(channel, slackChannel, result.message);
    }
  } catch (err) {
    console.error(`[Slack] handler error (team=${team_id} user=${userId}):`, err.message);
  }
}

module.exports = router;
