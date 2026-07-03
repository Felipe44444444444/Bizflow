import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export interface ContactHints {
  name?: string
  phone?: string
  email?: string
}

export async function resolveContact(
  clientId: string | null,
  channelType: string,
  channelIdentifier: string,
  hints: ContactHints = {}
): Promise<string> {
  const supabase = db()

  // 1. Look up by channel identifier (fastest path — exact match)
  const { data: existing } = await supabase
    .from('xenttech_contact_channels')
    .select('contact_id')
    .eq('channel_type', channelType)
    .eq('channel_identifier', channelIdentifier)
    .maybeSingle()

  if (existing?.contact_id) {
    await supabase
      .from('xenttech_contacts')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', existing.contact_id)
    return existing.contact_id
  }

  // 2. Cross-channel match by phone or email
  let matchedContactId: string | null = null

  if (hints.phone && clientId) {
    const { data: m } = await supabase
      .from('xenttech_contacts')
      .select('id')
      .eq('client_id', clientId)
      .eq('phone', hints.phone)
      .maybeSingle()
    matchedContactId = m?.id ?? null
  }

  if (!matchedContactId && hints.email && clientId) {
    const { data: m } = await supabase
      .from('xenttech_contacts')
      .select('id')
      .eq('client_id', clientId)
      .eq('email', hints.email)
      .maybeSingle()
    matchedContactId = m?.id ?? null
  }

  const now = new Date().toISOString()

  if (!matchedContactId) {
    // 3. Create new contact
    const { data: newContact, error } = await supabase
      .from('xenttech_contacts')
      .insert({
        client_id: clientId,
        canonical_name: hints.name ?? null,
        phone: hints.phone ?? null,
        email: hints.email ?? null,
        first_seen_at: now,
        last_seen_at: now,
      })
      .select('id')
      .single()

    if (error || !newContact) throw new Error(`Failed to create contact: ${error?.message}`)
    matchedContactId = newContact.id
  } else {
    // Update with any new info we have
    const updates: Record<string, unknown> = { last_seen_at: now }
    if (hints.name) updates.canonical_name = hints.name
    if (hints.phone) updates.phone = hints.phone
    if (hints.email) updates.email = hints.email
    await supabase.from('xenttech_contacts').update(updates).eq('id', matchedContactId)
  }

  if (!matchedContactId) throw new Error('Failed to resolve or create contact')

  // 4. Register this channel identifier for future lookups
  await supabase.from('xenttech_contact_channels').upsert(
    {
      contact_id: matchedContactId,
      channel_type: channelType,
      channel_identifier: channelIdentifier,
    },
    { onConflict: 'channel_type,channel_identifier' }
  )

  return matchedContactId
}
