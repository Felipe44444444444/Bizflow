const { supabaseAdmin } = require('../config/supabase');
const channelService = require('./channelService');

// ---------------------------------------------------------------------------
// Template helper
// ---------------------------------------------------------------------------

function applyTemplate(template, { lead, agent }) {
  if (!template) return null;
  return template
    .replace(/\{nombre\}/g, lead.name || 'amigo')
    .replace(/\{empresa\}/g, agent.company_name || 'nosotros')
    .replace(/\{bot_name\}/g, agent.name || 'Asistente');
}

// ---------------------------------------------------------------------------
// Internal: send a single retargeting message via the right channel
// ---------------------------------------------------------------------------

async function sendRetargetingMessage({ lead, canal, message, seq }) {
  const effectiveCanal = canal || lead.canal || lead.source_channel;

  // Web / widget / API channels — write directly to the conversation
  if (
    effectiveCanal === 'widget' ||
    effectiveCanal === 'web_widget' ||
    effectiveCanal === 'api'
  ) {
    if (lead.conversation_id) {
      await supabaseAdmin.from('messages').insert({
        conversation_id: lead.conversation_id,
        role: 'assistant',
        content: message,
        metadata: { retargeting: true, step: seq.step },
      });
    }
    return;
  }

  // External channel — look up the active channel record
  const { data: channel, error: chErr } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('agent_id', seq.agent_id)
    .eq('type', effectiveCanal)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (chErr || !channel) throw new Error(`No active channel of type "${effectiveCanal}"`);

  const recipientId = lead.canal_user_id || lead.phone;
  if (!recipientId) throw new Error('No recipient ID for lead');

  await channelService.sendMessage(channel, recipientId, message);
}

// ---------------------------------------------------------------------------
// startRetargetingQueue — process up to 50 pending sequence items
// ---------------------------------------------------------------------------

async function startRetargetingQueue() {
  const now = new Date().toISOString();

  const { data: sequences, error: seqErr } = await supabaseAdmin
    .from('retargeting_sequences')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .limit(50);

  if (seqErr) throw seqErr;
  if (!sequences || sequences.length === 0) {
    console.log('[retargeting] No pending sequences to process.');
    return;
  }

  let processed = 0;

  for (const seq of sequences) {
    try {
      // a) Load retargeting config for the agent
      const { data: config } = await supabaseAdmin
        .from('retargeting_config')
        .select('*')
        .eq('agent_id', seq.agent_id)
        .maybeSingle();

      if (!config || !config.is_enabled) {
        await supabaseAdmin
          .from('retargeting_sequences')
          .update({ status: 'skipped' })
          .eq('id', seq.id);
        continue;
      }

      // b) Check per-step enabled flag
      if (config[`step_${seq.step}_enabled`] === false) {
        await supabaseAdmin
          .from('retargeting_sequences')
          .update({ status: 'skipped' })
          .eq('id', seq.id);
        continue;
      }

      // c) Load lead with agent info
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('*, agents(name, company_name)')
        .eq('id', seq.lead_id)
        .maybeSingle();

      if (!lead) {
        await supabaseAdmin
          .from('retargeting_sequences')
          .update({ status: 'skipped', error_message: 'Lead not found' })
          .eq('id', seq.id);
        continue;
      }

      // d) Flatten agents join (Supabase may return array or object)
      const agent = Array.isArray(lead.agents) ? lead.agents[0] : lead.agents || {};

      const message = applyTemplate(config[`step_${seq.step}_message`], { lead, agent });
      if (!message) {
        await supabaseAdmin
          .from('retargeting_sequences')
          .update({ status: 'skipped', error_message: 'No template' })
          .eq('id', seq.id);
        continue;
      }

      // e) Send the message
      await sendRetargetingMessage({
        lead,
        canal: seq.canal || lead.canal || lead.source_channel,
        message,
        seq,
      });

      // f) Mark as sent
      await supabaseAdmin
        .from('retargeting_sequences')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          message_sent: message,
        })
        .eq('id', seq.id);

      // g) Fire-and-forget notification
      supabaseAdmin
        .from('notifications')
        .insert({
          organization_id: seq.organization_id,
          type: 'retargeting_sent',
          title: `Retargeting — Paso ${seq.step}`,
          body: `Mensaje de retargeting enviado al lead ${seq.lead_id} (paso ${seq.step})`,
          read: false,
        })
        .then(() => {})
        .catch(() => {});

      processed++;
    } catch (err) {
      // h) Record failure and increment retry count
      console.error(`[retargeting] Error processing sequence ${seq.id}:`, err.message);
      await supabaseAdmin
        .from('retargeting_sequences')
        .update({
          status: 'failed',
          error_message: err.message,
          retry_count: (seq.retry_count || 0) + 1,
        })
        .eq('id', seq.id);
    }
  }

  console.log(`[retargeting] Processed ${processed} / ${sequences.length} sequences.`);
}

// ---------------------------------------------------------------------------
// scheduleRetargeting — create sequence records for a new lead
// ---------------------------------------------------------------------------

async function scheduleRetargeting(leadId, agentId, orgId, canal) {
  const { data: config } = await supabaseAdmin
    .from('retargeting_config')
    .select('*')
    .eq('agent_id', agentId)
    .maybeSingle();

  if (!config || !config.is_enabled) return;

  const now = Date.now();
  const sequences = [];

  // Step 0 — immediate / short delay (minutes)
  if (config.step_0_enabled !== false && config.step_0_message) {
    const delayMs = (config.step_0_delay_minutes || 0) * 60000;
    sequences.push({
      lead_id: leadId,
      agent_id: agentId,
      organization_id: orgId,
      canal,
      step: 0,
      status: 'pending',
      scheduled_at: new Date(now + delayMs).toISOString(),
    });
  }

  // Steps 1-4 — longer delays (hours)
  const defaultDelayHours = [24, 72, 168, 336];
  for (let i = 1; i <= 4; i++) {
    if (config[`step_${i}_enabled`] !== false && config[`step_${i}_message`]) {
      const hours = config[`step_${i}_delay_hours`] || defaultDelayHours[i - 1];
      sequences.push({
        lead_id: leadId,
        agent_id: agentId,
        organization_id: orgId,
        canal,
        step: i,
        status: 'pending',
        scheduled_at: new Date(now + hours * 3600000).toISOString(),
      });
    }
  }

  if (sequences.length > 0) {
    const { error } = await supabaseAdmin.from('retargeting_sequences').insert(sequences);
    if (error) throw error;
  }

  console.log(`[retargeting] Scheduled ${sequences.length} sequences for lead ${leadId}.`);
}

// ---------------------------------------------------------------------------
// Existing helpers (preserved)
// ---------------------------------------------------------------------------

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
      .upsert(
        {
          organization_id: organizationId,
          agent_id: agentId,
          conversation_id: conv.id,
          name: conv.contact_name || null,
          email: conv.contact_email || null,
          phone: conv.contact_phone || null,
          source_channel: conv.source_channel || null,
          status: 'new',
          metadata: { abandoned_at: conv.last_message_at },
        },
        { onConflict: 'conversation_id', ignoreDuplicates: false }
      )
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

module.exports = {
  startRetargetingQueue,
  scheduleRetargeting,
  scanAbandonedConversations,
  getLeadsForAgent,
  updateLeadStatus,
  sendFollowup,
};
