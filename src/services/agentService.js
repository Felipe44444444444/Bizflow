const { anthropic } = require('../config/anthropic');
const { supabaseAdmin } = require('../config/supabase');
const ragService = require('./ragService');

const MODEL = 'claude-sonnet-4-6';
const MAX_HISTORY = 20;
const MAX_TOKENS = 1024;

async function deductCredit(organizationId) {
  await Promise.all([
    supabaseAdmin.rpc('decrement_credits', { p_org_id: organizationId }),
    supabaseAdmin.from('credit_transactions').insert({
      organization_id: organizationId,
      amount: -1,
      type: 'message',
      description: 'Mensaje procesado por agente IA',
    }),
  ]);
}

async function processMessage({ agentId, conversationId, userMessage, organizationId, role = 'user' }) {
  const { data: agent, error: agentErr } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (agentErr || !agent) throw new Error('Agent not found');
  if (!agent.is_active) throw new Error('Agent is not active');

  // Check credits before calling Claude
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('credits_balance, credits_used')
    .eq('id', organizationId)
    .single();

  if (org && org.credits_balance < 1) {
    const err = new Error('Sin créditos disponibles. Recarga tu cuenta en Ajustes → Créditos.');
    err.status = 402;
    throw err;
  }

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
    const chunks = await ragService.searchChunks(agentId, userMessage, 5, 0.45);
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
    ? 'Si el usuario solicita hablar con un humano, o si el problema supera tus capacidades, incluye exactamente [HANDOFF_REQUESTED] al final de tu respuesta.'
    : '';

  const identity = agent.company_name
    ? `Eres ${agent.name}, asistente virtual de ${agent.company_name}.`
    : `Eres ${agent.name}, un asistente de atención al cliente.`;

  const systemText = [
    identity,
    agent.system_prompt || null,
    `Idioma de respuesta: ${agent.language || 'es'}.`,
    toneInstructions[agent.tone] || null,
    ragContext,
    handoffInstruction,
  ]
    .filter(Boolean)
    .join('\n');

  const claudeMessages = (history || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
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
    metadata: { model: response.model, stop_reason: response.stop_reason, cache_hit: cacheHit },
  });

  if (handoffRequested) {
    await supabaseAdmin
      .from('conversations')
      .update({ status: 'handed_off' })
      .eq('id', conversationId);
  }

  // Deduct credit and update usage metrics (fire and forget — don't fail the response)
  Promise.all([
    deductCredit(organizationId),
    incrementUsageMetrics(organizationId, tokensUsed),
  ]).catch(console.error);

  return { message: assistantContent, handoffRequested, tokensUsed, cacheHit, conversationId };
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

async function previewMessage({ agent, message, conversationHistory = [] }) {
  const toneInstructions = {
    professional: 'Mantén un tono profesional y directo.',
    friendly: 'Sé amigable, cálido y accesible.',
    formal: 'Usa un lenguaje formal y respetuoso.',
    casual: 'Habla de manera casual y relajada.',
  };

  let ragContext = '';
  let chunksUsed = [];
  try {
    const chunks = await ragService.searchChunks(agent.id, message, 3, 0.45);
    chunksUsed = chunks;
    if (chunks.length > 0) {
      ragContext = '\n\n## Información de la base de conocimiento:\n' +
        chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');
    }
  } catch (_) {}

  const identity = agent.company_name
    ? `Eres ${agent.name}, asistente virtual de ${agent.company_name}.`
    : `Eres ${agent.name}, un asistente de atención al cliente.`;

  const systemText = [
    identity,
    agent.system_prompt || null,
    `Idioma: ${agent.language || 'es'}.`,
    toneInstructions[agent.tone] || null,
    ragContext,
  ].filter(Boolean).join('\n');

  const claudeMessages = [
    ...conversationHistory.slice(-8),
    { role: 'user', content: message },
  ];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: systemText }],
    messages: claudeMessages,
  });

  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  return {
    message: response.content[0].text,
    chunksUsed: chunksUsed.map((c) => ({
      content: c.content.length > 250 ? c.content.slice(0, 250) + '…' : c.content,
      similarity: Math.round((c.similarity || 0) * 100) / 100,
      source: c.metadata?.source,
    })),
    tokensUsed,
  };
}

module.exports = { processMessage, findOrCreateConversation, previewMessage };
