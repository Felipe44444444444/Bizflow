import { createClient } from '@supabase/supabase-js'
import { resolveContact, ContactHints } from './identity'
import { getContactContext, extractAndStoreMemory } from './memory'
import { searchKnowledge } from './rag'
import { buildSystemPrompt, sanitizeResponse } from './human-voice'
import { isAwaitingLeadData, extractLeadData, saveLead, notifyLeadCaptured } from './lead-capture'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export interface IncomingMessage {
  clientId: string | null
  agentId: string
  channelId?: string | null
  channelType: string
  channelIdentifier: string
  messageText: string
  contactHints?: ContactHints
}

export async function handleIncomingMessage(params: IncomingMessage): Promise<string> {
  const { clientId, agentId, channelId, channelType, channelIdentifier, messageText, contactHints } = params
  const supabase = db()

  // 1. Resolve unified contact identity
  const contactId = await resolveContact(clientId, channelType, channelIdentifier, contactHints ?? {})

  // 2. Get contact memory context
  const context = await getContactContext(contactId)

  // 3. Load agent config
  const { data: agent } = await supabase
    .from('xenttech_agents')
    .select('system_prompt, model, temperature')
    .eq('id', agentId)
    .maybeSingle()

  const systemPrompt = agent?.system_prompt ?? 'Eres un asistente virtual. Responde en español de forma concisa.'
  const model = (agent?.model ?? 'claude-sonnet-4-6').replace('claude-sonnet-4-20250514', 'claude-sonnet-4-6')

  // 4. Build memory prefix injected before system prompt
  let memoryPrefix = ''
  if (context) {
    const parts: string[] = []
    if (context.canonicalName) parts.push(`Nombre: ${context.canonicalName}`)
    if (context.phone) parts.push(`Teléfono: ${context.phone}`)
    if (context.email) parts.push(`Email: ${context.email}`)
    if (context.totalConversations > 0) parts.push(`Conversaciones previas: ${context.totalConversations}`)
    if (context.leadStatus !== 'new') parts.push(`Estado lead: ${context.leadStatus}`)
    if (context.facts.length > 0) {
      parts.push(`Lo que sabes de este contacto:\n${context.facts.map(f => `- ${f.type}: ${f.value}`).join('\n')}`)
    }
    if (parts.length > 0) {
      memoryPrefix = `[CONTEXTO DEL CONTACTO]\n${parts.join('\n')}\n[FIN CONTEXTO]\n\n`
    }
  }

  // 5. Load conversation history (last 10 messages = 5 turns)
  const { data: conv } = await supabase
    .from('xenttech_conversations')
    .select('id, messages')
    .eq('channel_type', channelType)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  type Msg = { role: string; content: string; timestamp?: string }
  const allMsgs: Msg[] = conv?.messages ?? []
  const history = allMsgs.slice(-10).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // 6. Lead capture — check if bot was waiting for contact data
  if (isAwaitingLeadData(allMsgs)) {
    const extracted = extractLeadData(messageText)
    if (extracted.hasData) {
      const recentBotMsgs = allMsgs.filter(m => m.role === 'assistant').slice(-3)
      const conversationSummary = recentBotMsgs.map(m => m.content).join(' | ')
      void saveLead({
        agentId,
        clientId: clientId ?? null,
        contactId,
        nombre:    extracted.nombre,
        telefono:  extracted.telefono,
        email:     extracted.email,
        canal:     channelType,
        canalIdentifier: channelIdentifier,
        sourceMessage:   messageText,
        conversationSummary,
      }).then(() => {
        void notifyLeadCaptured({
          contactId,
          agentId,
          canal:          channelType,
          conversationId: conv?.id,
          telefono:       extracted.telefono,
          email:          extracted.email,
          nombre:         extracted.nombre,
        })
      }).catch(err => console.error('lead-capture error', err))
    }
  }

  // 7. Retrieve relevant knowledge (RAG — no-op if OPENAI_API_KEY not configured)
  const knowledge = await searchKnowledge(agentId, messageText)

  // 8. Call Anthropic — system = base prompt + human-voice rules + RAG + contact memory
  const system = buildSystemPrompt(systemPrompt, memoryPrefix.trim(), knowledge)

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      temperature: agent?.temperature ?? 0.7,
      system,
      messages: [...history, { role: 'user', content: messageText }],
    }),
  })

  if (!aiRes.ok) {
    const errText = await aiRes.text()
    console.error('Anthropic error', aiRes.status, errText)
    throw new Error('AI_UNAVAILABLE')
  }

  const aiJson = await aiRes.json()
  const reply: string = sanitizeResponse(aiJson.content?.[0]?.text ?? '...')

  // 9. Persist conversation
  const now = new Date().toISOString()
  const updatedMsgs: Msg[] = [
    ...allMsgs,
    { role: 'user', content: messageText, timestamp: now },
    { role: 'assistant', content: reply, timestamp: now },
  ]

  let convId: string | undefined = conv?.id

  if (convId) {
    await supabase
      .from('xenttech_conversations')
      .update({ messages: updatedMsgs, updated_at: now })
      .eq('id', convId)
  } else {
    const { data: newConv } = await supabase
      .from('xenttech_conversations')
      .insert({
        agent_id:      agentId,
        client_id:     clientId ?? null,
        channel_id:    channelId ?? null,
        contact_id:    contactId,
        contact_name:  contactHints?.name ?? 'Visitante',
        contact_phone: contactHints?.phone ?? channelIdentifier,
        channel_type:  channelType,
        messages:      updatedMsgs,
        lead_captured: false,
        status:        'active',
        updated_at:    now,
      })
      .select('id')
      .single()
    convId = newConv?.id

    // Increment total_conversations counter (best-effort, non-blocking)
    void supabase
      .from('xenttech_contacts')
      .update({ total_conversations: (context?.totalConversations ?? 0) + 1 })
      .eq('id', contactId)
  }

  // 8. Extract memory async (fire-and-forget — never blocks response)
  if (convId) {
    extractAndStoreMemory(contactId, convId, messageText, reply)
  }

  return reply
}
