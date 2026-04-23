const { Router } = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');
const { apiKeyMiddleware } = require('../middleware/apiKey');
const { chatLimiter } = require('../middleware/rateLimit');
const agentService = require('../services/agentService');

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
});

// Public endpoint — authenticated via API key
router.post('/chat', apiKeyMiddleware, chatLimiter, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { message, conversation_id, channel_id, external_id, contact_name, contact_email, contact_phone } = parsed.data;

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

      convId = await agentService.findOrCreateConversation({
        agentId: agent_id,
        channelId: resolvedChannelId,
        organizationId: req.organizationId,
        externalId: external_id,
        contactName: contact_name,
        contactEmail: contact_email,
        contactPhone: contact_phone,
      });
    }

    const result = await agentService.processMessage({
      agentId: agent_id,
      conversationId: convId,
      userMessage: message,
      organizationId: req.organizationId,
    });

    res.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

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
