const { anthropic } = require('../config/anthropic');
const { supabaseAdmin } = require('../config/supabase');
const ragService = require('./ragService');

const MODEL = 'claude-sonnet-4-6';
const MAX_HISTORY = 20;
const MAX_TOKENS = 1024;

const TONE_MAP = {
  professional: 'profesional y directo',
  friendly:     'amigable, cálido y accesible',
  formal:       'formal y respetuoso',
  casual:       'casual y relajado',
};
const LANG_MAP = { es: 'español', en: 'inglés', pt: 'português' };

function buildSystemPrompt(agent, ragContext = '', includeHandoff = false) {
  const botName  = agent.name         || 'Asistente';
  const company  = agent.company_name || 'nuestra empresa';
  const fallback = agent.fallback_message
    || `Lo siento, no tengo información sobre eso. Para más ayuda, contacta directamente al equipo de ${company}.`;
  const welcome  = agent.welcome_message
    || `¡Hola! Soy ${botName} de ${company}, ¿en qué puedo ayudarte hoy?`;
  const tone     = TONE_MAP[agent.tone]     || 'profesional';
  const language = LANG_MAP[agent.language] || agent.language || 'español';
  const extra    = agent.system_prompt ? `\n- ${agent.system_prompt}` : '';

  const handoffRule = includeHandoff
    ? '\n8. Si el usuario solicita hablar con un humano o el problema supera tus capacidades, incluye exactamente [HANDOFF_REQUESTED] al final de tu respuesta.'
    : '';

  const ragSection = ragContext
    ? `\n\nCONTEXTO DE LA EMPRESA (usa esta información para responder):\n${ragContext}`
    : '';

  return `Eres ${botName}, asistente virtual de ${company}.

IDENTIDAD:
- Representas exclusivamente a ${company}
- Tu personalidad es ${tone}
- Respondes siempre en ${language}${extra}

REGLAS DE COMPORTAMIENTO:
1. Prioriza la información del contexto de la empresa cuando esté disponible
2. Si no tienes información suficiente, di: "${fallback}"
3. NUNCA inventes datos, precios, contactos o servicios
4. NUNCA menciones que usas IA, Claude o tecnología específica
5. Mantén respuestas concisas (máx 3 párrafos)
6. Al primer saludo del usuario, responde con: "${welcome}"
7. Para agendar, cotizar o hablar con un humano, deriva amablemente al equipo de ${company}${handoffRule}

FORMATO:
- Usa *negrita* para puntos importantes
- Usa listas con • para enumerar
- Nunca uses markdown de headers (#, ##)
- Emojis con moderación (máx 2 por respuesta)${ragSection}`;
}

// Hybrid RAG retrieval: primary threshold 0.45, fallback 0.20 for greetings/short queries.
// Always returns chunks (may be empty), logs warnings when nothing is found.
async function retrieveRagChunks(agentId, query, maxChunks = 5) {
  try {
    let chunks = await ragService.searchChunks(agentId, query, maxChunks, 0.45);
    if (chunks.length === 0) {
      // Fallback: lower threshold so identity/product context still loads for generic messages
      chunks = await ragService.searchChunks(agentId, query, 2, 0.20);
    }
    if (chunks.length === 0) {
      console.warn(`[RAG] No chunks found — agent=${agentId} query="${query.slice(0, 60)}"`);
    } else {
      const topSim = chunks[0].similarity?.toFixed(3);
      console.log(`[RAG] ${chunks.length} chunk(s) — agent=${agentId} top_sim=${topSim}`);
    }
    return chunks;
  } catch (err) {
    console.error(`[RAG] searchChunks error — agent=${agentId}:`, err.message);
    return [];
  }
}

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

  // Detect explicit handoff request in user message (backup detection)
  const HANDOFF_RE = /\b(hablar con (un )?humano|quiero (un )?asesor|hablar con alguien|persona real|ayuda real|agente humano|necesito hablar con)\b/i;
  const userRequestedHandoff = agent.handoff_enabled && HANDOFF_RE.test(userMessage);
  if (userRequestedHandoff) {
    createHandoffRequest({ conversationId, agentId, organizationId, canal: 'widget', contactName: null, lastMessage: userMessage, agent })
      .catch(() => {});
    await supabaseAdmin.from('conversations').update({ status: 'handed_off' }).eq('id', conversationId);
  }

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

  const ragChunks = await retrieveRagChunks(agentId, userMessage);
  const ragContext = ragChunks.length > 0
    ? ragChunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
    : '';

  const systemText = buildSystemPrompt(agent, ragContext, agent.handoff_enabled);

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

    // Create handoff request + notification (fire and forget)
    createHandoffRequest({
      conversationId,
      agentId,
      organizationId,
      canal: agent.handoff_enabled_channels?.[0] || 'widget',
      contactName: null, // will be enriched from conversations table below
      lastMessage: userMessage,
      agent,
    }).catch(e => console.error('[Handoff] create error:', e.message));
  }

  // Deduct credit and update usage metrics (fire and forget — don't fail the response)
  Promise.all([
    deductCredit(organizationId),
    incrementUsageMetrics(organizationId, tokensUsed),
  ]).catch(console.error);

  return { message: assistantContent, handoffRequested, tokensUsed, cacheHit, conversationId };
}

// ── Auto-capture lead (fire-and-forget, never throws) ────────────────────────
async function autoCaptureLead({ organizationId, agentId, conversationId, contactName, contactEmail, contactPhone, sourceChannel }) {
  try {
    await supabaseAdmin.from('leads').upsert({
      organization_id: organizationId,
      agent_id:        agentId,
      conversation_id: conversationId,
      name:            contactName    || null,
      email:           contactEmail   || null,
      phone:           contactPhone   || null,
      source_channel:  sourceChannel  || null,
      status:          'new',
      metadata:        { captured_at: new Date().toISOString() },
    }, { onConflict: 'conversation_id', ignoreDuplicates: true });
    console.log(`[Lead] auto-captured — conv=${conversationId} channel=${sourceChannel}`);
  } catch (err) {
    console.error('[Lead] auto-capture error:', err.message);
  }
}

async function findOrCreateConversation({ agentId, channelId, organizationId, externalId, contactName, contactEmail, contactPhone, sourceChannel }) {
  if (externalId) {
    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('id, status')
      .eq('channel_id', channelId)
      .eq('external_id', externalId)
      .maybeSingle();

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
      agent_id:        agentId,
      channel_id:      channelId,
      organization_id: organizationId,
      external_id:     externalId    || null,
      contact_name:    contactName   || null,
      contact_email:   contactEmail  || null,
      contact_phone:   contactPhone  || null,
      source_channel:  sourceChannel || null,
      status:          'open',
    })
    .select('id')
    .single();

  if (error) throw error;

  // Auto-capture lead for every NEW conversation (non-blocking)
  autoCaptureLead({
    organizationId,
    agentId,
    conversationId: conversation.id,
    contactName,
    contactEmail,
    contactPhone,
    sourceChannel,
  });

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
  const chunksUsed = await retrieveRagChunks(agent.id, message, 3);
  const ragContext = chunksUsed.length > 0
    ? chunksUsed.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
    : '';

  const systemText = buildSystemPrompt(agent, ragContext, false);

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

async function createHandoffRequest({ conversationId, agentId, organizationId, canal, contactName, lastMessage, agent }) {
  try {
    // Enrich with conversation contact info
    let cName = contactName;
    if (!cName && conversationId) {
      const { data: conv } = await supabaseAdmin
        .from('conversations')
        .select('contact_name, source_channel')
        .eq('id', conversationId)
        .maybeSingle();
      cName = conv?.contact_name;
      if (!canal || canal === 'widget') canal = conv?.source_channel || canal;
    }

    const { data: handoff } = await supabaseAdmin
      .from('handoff_requests')
      .insert({
        conversation_id: conversationId || null,
        agent_id: agentId,
        organization_id: organizationId,
        contact_name: cName || 'Desconocido',
        canal: canal || 'widget',
        last_message: (lastMessage || '').slice(0, 500),
        status: 'pending',
      })
      .select()
      .single();

    // Dashboard notification
    supabaseAdmin.from('notifications').insert({
      organization_id: organizationId,
      type: 'handoff',
      title: '⚠️ Cliente solicita atención humana',
      body: `${cName || 'Desconocido'} (${canal || 'widget'}): ${(lastMessage || '').slice(0, 100)}`,
      metadata: { handoff_id: handoff?.id, conversation_id: conversationId, canal },
      read: false,
    }).then(() => {}).catch(() => {});

    // Notify admin via WhatsApp if configured
    if (agent?.admin_whatsapp || agent?.metadata?.admin_whatsapp) {
      notifyAdminHandoffWhatsApp({ agent, orgId: organizationId, contactName: cName, canal, lastMessage })
        .catch(e => console.error('[Handoff] WA notify error:', e.message));
    }

    console.log(`[Handoff] created id=${handoff?.id} conv=${conversationId}`);
  } catch (err) {
    console.error('[Handoff] createHandoffRequest error:', err.message);
  }
}

async function notifyAdminHandoffWhatsApp({ agent, orgId, contactName, canal, lastMessage }) {
  const [{ data: org }, { data: waRows }] = await Promise.all([
    supabaseAdmin.from('organizations').select('metadata, name').eq('id', orgId).single(),
    supabaseAdmin.from('whatsapp_integrations').select('access_token, phone_number_id')
      .eq('organization_id', orgId).eq('is_active', true).limit(1),
  ]);

  const adminPhone = agent?.admin_whatsapp || org?.metadata?.admin_whatsapp || org?.metadata?.notification_phone;
  const wa = waRows?.[0];
  if (!adminPhone || !wa?.phone_number_id || !wa?.access_token) return;

  const text =
    `🔴 *Solicitud urgente de atención*\n` +
    `👤 Cliente: ${contactName || 'Desconocido'}\n` +
    `📱 Canal: ${canal || 'widget'}\n` +
    `💬 Último mensaje: ${(lastMessage || '—').slice(0, 150)}\n` +
    `🔗 Ver en: app.conectaachat.com/handoff`;

  const res = await fetch(`https://graph.facebook.com/v19.0/${wa.phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${wa.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: adminPhone,
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  });

  if (!res.ok) throw new Error(`WA handoff notify failed: ${await res.text()}`);
}

module.exports = { processMessage, findOrCreateConversation, previewMessage };
