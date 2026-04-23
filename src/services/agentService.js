const { anthropic } = require('../config/anthropic');
const { supabaseAdmin } = require('../config/supabase');
const ragService = require('./ragService');

const MODEL = 'claude-sonnet-4-6';
const MAX_HISTORY = 20;
const MAX_TOKENS = 1024;

async function processMessage({ agentId, conversationId, userMessage, organizationId, role = 'user' }) {
  const { data: agent, error: agentErr } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (agentErr || !agent) throw new Error('Agent not found');
  if (!agent.is_active) throw new Error('Agent is not active');

  await supabaseAdmin.from('messages').insert({
    conversation_id: conversationId,
    role,
    content: userMessage,
  });

  await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  const { data: history } = await supabaseAdmin
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY);

  let ragContext = '';
  try {
    const chunks = await ragService.searchChunks(agentId, userMessage);
    if (chunks.length > 0) {
      ragContext =
        '\n\n## Información relevante de la base de conocimiento:\n' +
        chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
    }
  } catch (_) {}

  const toneInstructions = {
    professional: 'Mantén un tono profesional y directo.',
    friendly: 'Sé amigable, cálido y accesible.',
    formal: 'Usa un lenguaje formal y respetuoso.',
    casual: 'Habla de manera casual y relajada.',
  };

  const handoffInstruction = agent.handoff_enabled
    ? '\nSi el usuario solicita hablar con un humano, o si el problema supera tus capacidades, incluye exactamente [HANDOFF_REQUESTED] al final de tu respuesta.'
    : '';

  const systemText = [
    agent.system_prompt || 'Eres un asistente de atención al cliente útil y preciso.',
    `\nIdioma de respuesta: ${agent.language || 'es'}.`,
    toneInstructions[agent.tone] ? `\n${toneInstructions[agent.tone]}` : '',
    ragContext,
    handoffInstruction,
  ]
    .filter(Boolean)
    .join('');

  const claudeMessages = (history || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: systemText,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: claudeMessages,
  });

  const rawContent = response.content[0].text;
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
  const cacheHit = (response.usage.cache_read_input_tokens ?? 0) > 0;

  const handoffRequested = agent.handoff_enabled && rawContent.includes('[HANDOFF_REQUESTED]');
  const assistantContent = handoffRequested
    ? rawContent.replace('[HANDOFF_REQUESTED]', '').trim() ||
      (agent.fallback_message ?? 'Te conectaré con un agente humano en breve.')
    : rawContent;

  await supabaseAdmin.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: assistantContent,
    tokens_used: tokensUsed,
    metadata: {
      model: response.model,
      stop_reason: response.stop_reason,
      cache_hit: cacheHit,
    },
  });

  if (handoffRequested) {
    await supabaseAdmin
      .from('conversations')
      .update({ status: 'handed_off' })
      .eq('id', conversationId);
  }

  incrementUsageMetrics(organizationId, tokensUsed).catch(() => {});

  return {
    message: assistantContent,
    handoffRequested,
    tokensUsed,
    cacheHit,
    conversationId,
  };
}

async function findOrCreateConversation({ agentId, channelId, organizationId, externalId, contactName, contactEmail, contactPhone }) {
  if (externalId) {
    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('id, status')
      .eq('channel_id', channelId)
      .eq('external_id', externalId)
      .single();

    if (existing) {
      if (existing.status === 'resolved') {
        await supabaseAdmin
          .from('conversations')
          .update({ status: 'open', resolved_at: null })
          .eq('id', existing.id);
      }
      return existing.id;
    }
  }

  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      agent_id: agentId,
      channel_id: channelId,
      organization_id: organizationId,
      external_id: externalId || null,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      status: 'open',
    })
    .select('id')
    .single();

  if (error) throw error;
  return conversation.id;
}

async function incrementUsageMetrics(organizationId, tokensUsed) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const { data: existing } = await supabaseAdmin
    .from('usage_metrics')
    .select('id, messages_count, tokens_used')
    .eq('organization_id', organizationId)
    .eq('period_start', periodStart)
    .single();

  if (existing) {
    await supabaseAdmin
      .from('usage_metrics')
      .update({
        messages_count: existing.messages_count + 1,
        tokens_used: existing.tokens_used + tokensUsed,
        updated_at: now.toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin.from('usage_metrics').insert({
      organization_id: organizationId,
      period_start: periodStart,
      period_end: periodEnd,
      messages_count: 1,
      tokens_used: tokensUsed,
    });
  }
}

module.exports = { processMessage, findOrCreateConversation };
