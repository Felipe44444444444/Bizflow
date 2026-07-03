import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export interface ContactContext {
  canonicalName: string | null
  phone: string | null
  email: string | null
  totalConversations: number
  leadStatus: string
  leadScore: number
  tags: string[]
  notes: string | null
  facts: Array<{ type: string; value: string; confidence: number }>
}

export async function getContactContext(contactId: string): Promise<ContactContext | null> {
  const supabase = db()

  const [{ data: contact }, { data: facts }] = await Promise.all([
    supabase
      .from('xenttech_contacts')
      .select('canonical_name,phone,email,total_conversations,lead_status,lead_score,tags,notes')
      .eq('id', contactId)
      .maybeSingle(),
    supabase
      .from('xenttech_contact_memory')
      .select('fact_type,fact_value,confidence')
      .eq('contact_id', contactId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!contact) return null

  return {
    canonicalName: contact.canonical_name,
    phone: contact.phone,
    email: contact.email,
    totalConversations: contact.total_conversations ?? 0,
    leadStatus: contact.lead_status ?? 'new',
    leadScore: contact.lead_score ?? 0,
    tags: contact.tags ?? [],
    notes: contact.notes,
    facts: (facts ?? []).map((f) => ({
      type: f.fact_type,
      value: f.fact_value,
      confidence: f.confidence,
    })),
  }
}

export function extractAndStoreMemory(
  contactId: string,
  conversationId: string,
  userMessage: string,
  agentReply: string
): void {
  void (async () => {
    try {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: `Extract factual information about the user from this conversation turn.
Return ONLY a JSON array, or [] if nothing useful.
Each item: {"type":"name|phone|email|interest|objection|budget|business|other","value":"...","confidence":0.0-1.0}
Only include facts explicitly stated. Max 5 items.`,
          messages: [
            {
              role: 'user',
              content: `User: "${userMessage}"\nAgent: "${agentReply}"`,
            },
          ],
        }),
      })

      if (!aiRes.ok) return

      const aiJson = await aiRes.json()
      const raw: string = aiJson.content?.[0]?.text ?? '[]'
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) return

      const facts: Array<{ type: string; value: string; confidence: number }> = JSON.parse(match[0])
      if (!facts.length) return

      const supabase = db()
      await supabase.from('xenttech_contact_memory').insert(
        facts.map((f) => ({
          contact_id: contactId,
          fact_type: f.type,
          fact_value: f.value,
          confidence: f.confidence ?? 1.0,
          source_conversation_id: conversationId,
        }))
      )
    } catch {
      // best-effort
    }
  })()
}
