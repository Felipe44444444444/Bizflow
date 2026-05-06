const { supabaseAdmin } = require('../config/supabase');

async function scanAbandonedConversations(agentId, organizationId, hoursThreshold = 24) {
  const cutoff = new Date(Date.now() - hoursThreshold * 3600 * 1000).toISOString();

  const { data: conversations, error } = await supabaseAdmin
    .from('conversations')
    .select('id, contact_name, contact_email, contact_phone, source_channel, last_message_at, channel_id')
    .eq('status', 'open')
    .eq('agent_id', agentId)
    .eq('organization_id', organizationId)
    .lt('last_message_at', cutoff)
    .order('last_message_at', { ascending: false });

  if (error) throw error;

  const upserted = [];
  for (const conv of conversations || []) {
    const { data: lead, error: upsertErr } = await supabaseAdmin
      .from('leads')
      .upsert({
        organization_id: organizationId,
        agent_id: agentId,
        conversation_id: conv.id,
        name: conv.contact_name || null,
        email: conv.contact_email || null,
        phone: conv.contact_phone || null,
        source_channel: conv.source_channel || null,
        status: 'new',
        metadata: { abandoned_at: conv.last_message_at },
      }, { onConflict: 'conversation_id', ignoreDuplicates: false })
      .select()
      .single();

    if (!upsertErr && lead) upserted.push(lead);
  }

  return upserted;
}

async function getLeadsForAgent(agentId, organizationId) {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('*, conversations:conversation_id(last_message_at, channel_id)')
    .eq('agent_id', agentId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data || [];
}

async function updateLeadStatus(leadId, organizationId, status, notes) {
  const update = { status, updated_at: new Date().toISOString() };
  if (notes !== undefined) update.notes = notes;

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update(update)
    .eq('id', leadId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function sendFollowup(leadId, organizationId, message) {
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !lead) throw new Error('Lead not found');

  const followupRecord = {
    sent_at: new Date().toISOString(),
    message,
    channel: lead.source_channel || 'manual',
  };

  const prevFollowups = lead.metadata?.followups || [];
  await supabaseAdmin
    .from('leads')
    .update({
      status: 'contacted',
      updated_at: new Date().toISOString(),
      metadata: {
        ...lead.metadata,
        followups: [...prevFollowups, followupRecord],
        last_followup_at: followupRecord.sent_at,
      },
    })
    .eq('id', leadId);

  if (lead.conversation_id) {
    await supabaseAdmin.from('messages').insert({
      conversation_id: lead.conversation_id,
      role: 'human_agent',
      content: `[Seguimiento automático] ${message}`,
    });
  }

  return { success: true, leadId, sentAt: followupRecord.sent_at };
}

module.exports = { scanAbandonedConversations, getLeadsForAgent, updateLeadStatus, sendFollowup };
