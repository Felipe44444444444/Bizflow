const { Router } = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');
const { apiKeyMiddleware } = require('../middleware/apiKey');
const { chatLimiter } = require('../middleware/rateLimit');
const agentService = require('../services/agentService');
const { upsertLead, notifyNewLead } = require('../services/leadService');

const router = Router();

const chatSchema = z.object({
  // agent_id is optional when the API key already has an agent bound to it
  agent_id: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  conversation_id: z.string().uuid().optional(),
  channel_id: z.string().uuid().optional(),
  external_id: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  session_id: z.string().optional(),
  referral_url: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_source: z.string().optional(),
});

// Public endpoint — authenticated via API key
router.post('/chat', apiKeyMiddleware, chatLimiter, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { message, conversation_id, channel_id, external_id, contact_name, contact_email, contact_phone, session_id, referral_url, utm_campaign, utm_source } = parsed.data;

  // Resolve effective agent_id: body takes precedence, fallback to API key's bound agent
  const agent_id = parsed.data.agent_id || req.agentId;
  if (!agent_id) {
    return res.status(400).json({ error: 'agent_id is required (either in body or bound to API key)' });
  }

  if (req.agentId && parsed.data.agent_id && req.agentId !== parsed.data.agent_id) {
    return res.status(403).json({ error: 'API key not authorized for this agent' });
  }

  try {
    let convId = conversation_id;

    if (!convId) {
      const { data: channel } = channel_id
        ? await supabaseAdmin.from('channels').select('id').eq('id', channel_id).single()
        : await supabaseAdmin
            .from('channels')
            .select('id')
            .eq('agent_id', agent_id)
            .eq('type', 'api')
            .eq('is_active', true)
            .limit(1)
            .single();

      const resolvedChannelId = channel?.id;
      if (!resolvedChannelId) {
        return res.status(400).json({ error: 'No active API channel found for this agent' });
      }

      // Determine source channel: API channel type = web_widget, otherwise use channel type
      const { data: channelRow } = await supabaseAdmin
        .from('channels')
        .select('type')
        .eq('id', resolvedChannelId)
        .maybeSingle();

      const sourceChannel = channelRow?.type === 'api' ? 'web_widget' : (channelRow?.type || 'api');

      convId = await agentService.findOrCreateConversation({
        agentId:       agent_id,
        channelId:     resolvedChannelId,
        organizationId: req.organizationId,
        externalId:    external_id,
        contactName:   contact_name,
        contactEmail:  contact_email,
        contactPhone:  contact_phone,
        sourceChannel,
      });
    }

    const result = await agentService.processMessage({
      agentId: agent_id,
      conversationId: convId,
      userMessage: message,
      organizationId: req.organizationId,
    });

    // Capture widget lead (fire and forget)
    setImmediate(() => captureWidgetLead({
      orgId:         req.organizationId,
      agentId:       agent_id,
      conversationId: convId,
      contactName:   contact_name,
      contactEmail:  contact_email,
      contactPhone:  contact_phone,
      sessionId:     session_id || external_id,
      message,
      referralUrl:   referral_url,
      utmCampaign:   utm_campaign,
      utmSource:     utm_source,
    }).catch(e => console.error('[Widget Lead]', e.message)));

    res.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function captureWidgetLead({ orgId, agentId, conversationId, contactName, contactEmail, contactPhone, sessionId, message, referralUrl, utmCampaign, utmSource }) {
  // Detect email/phone in message body if not explicitly provided
  let detectedEmail = contactEmail;
  let detectedPhone = contactPhone;
  if (!detectedEmail) {
    const emailMatch = message.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) detectedEmail = emailMatch[0];
  }
  if (!detectedPhone) {
    const phoneMatch = message.match(/(?:\+?52)?[\s\-]?(?:\d[\s\-]?){9,12}/);
    if (phoneMatch) detectedPhone = phoneMatch[0].replace(/\s|\-/g, '');
  }

  const { lead, isNew } = await upsertLead({
    orgId,
    agentId,
    canal:          'widget',
    canalUserId:    sessionId  || conversationId,
    canalUsername:  contactName,
    nombre:         contactName,
    email:          detectedEmail,
    telefono:       detectedPhone,
    adSource:       utmCampaign ? 'paid' : 'organic',
    campaignName:   utmCampaign,
    referralUrl,
    primerMensaje:  message,
    conversationId,
    metadata:       { utm_source: utmSource, utm_campaign: utmCampaign },
  });

  if (isNew && lead) {
    const { data: agent } = await supabaseAdmin.from('agents').select('name').eq('id', agentId).maybeSingle();
    notifyNewLead({ lead, agentName: agent?.name, orgId }).catch(() => {});
    console.log(`[Lead] new widget lead — org=${orgId} session=${sessionId}`);
  }
}

// Internal endpoint — authenticated via Supabase JWT (dashboard use)
router.post('/send', authMiddleware, async (req, res) => {
  const schema = z.object({
    conversation_id: z.string().uuid(),
    content: z.string().min(1).max(4000),
    role: z.enum(['human_agent', 'system']).default('human_agent'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data: conversation } = await supabaseAdmin
    .from('conversations')
    .select('id, organization_id')
    .eq('id', parsed.data.conversation_id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  const { data: msg, error } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: parsed.data.conversation_id,
      role: parsed.data.role,
      content: parsed.data.content,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', parsed.data.conversation_id);

  res.status(201).json(msg);
});

// Dashboard test chat — JWT auth, no DB writes, no credit deduction
router.post('/preview', authMiddleware, async (req, res) => {
  const schema = z.object({
    agent_id: z.string().uuid(),
    message: z.string().min(1).max(4000),
    history: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })).default([]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { agent_id, message, history } = parsed.data;

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('id', agent_id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  try {
    const result = await agentService.previewMessage({ agent, message, conversationHistory: history });
    res.json(result);
  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List messages for a conversation
router.get('/:conversationId', authMiddleware, async (req, res) => {
  const { data: conversation } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', req.params.conversationId)
    .eq('organization_id', req.organizationId)
    .single();

  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', req.params.conversationId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
