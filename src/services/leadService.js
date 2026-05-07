const { supabaseAdmin } = require('../config/supabase');

const CANAL_LABELS = {
  whatsapp:  'WhatsApp',
  facebook:  'Facebook',
  instagram: 'Instagram',
  slack:     'Slack',
  widget:    'Widget Web',
};

/**
 * Upsert a lead from any channel.
 * Finds existing by (canal_user_id + agent_id), then by conversation_id.
 * Updates last_seen_at and any missing fields on existing leads.
 * Saves the message to lead_messages.
 * Returns { lead, isNew }
 */
async function upsertLead({
  orgId,
  agentId,
  canal,
  canalUserId,
  canalUsername,
  nombre,
  email,
  telefono,
  adId,
  adName,
  campaignId,
  campaignName,
  adsetId,
  adsetName,
  adSource,
  referralUrl,
  primerMensaje,
  conversationId,
  fbPageId,
  igAccountId,
  waPhoneNumber,
  metadata = {},
}) {
  const now = new Date().toISOString();
  let existingLead = null;

  if (canalUserId && agentId) {
    const { data } = await supabaseAdmin
      .from('leads')
      .select('id, name, email, phone, canal_username, conversation_id')
      .eq('canal_user_id', canalUserId)
      .eq('agent_id', agentId)
      .maybeSingle();
    existingLead = data;
  }

  if (!existingLead && conversationId) {
    const { data } = await supabaseAdmin
      .from('leads')
      .select('id, name, email, phone, canal_username, conversation_id')
      .eq('conversation_id', conversationId)
      .maybeSingle();
    existingLead = data;
  }

  let lead;
  let isNew = false;

  if (existingLead) {
    const updates = { last_seen_at: now };
    if (nombre         && !existingLead.name)             updates.name             = nombre;
    if (email          && !existingLead.email)            updates.email            = email;
    if (telefono       && !existingLead.phone)            updates.phone            = telefono;
    if (canalUsername  && !existingLead.canal_username)   updates.canal_username   = canalUsername;
    if (conversationId && !existingLead.conversation_id) updates.conversation_id  = conversationId;

    const { data } = await supabaseAdmin
      .from('leads')
      .update(updates)
      .eq('id', existingLead.id)
      .select()
      .single();
    lead = data || existingLead;
  } else {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert({
        organization_id: orgId,
        agent_id:        agentId,
        name:            nombre        || null,
        email:           email         || null,
        phone:           telefono      || null,
        source_channel:  canal,
        canal_user_id:   canalUserId   || null,
        canal_username:  canalUsername || null,
        ad_id:           adId          || null,
        ad_name:         adName        || null,
        campaign_id:     campaignId    || null,
        campaign_name:   campaignName  || null,
        adset_id:        adsetId       || null,
        adset_name:      adsetName     || null,
        ad_source:       adSource || (adId ? `${canal}_ad` : 'organic'),
        referral_url:    referralUrl   || null,
        primer_mensaje:  primerMensaje ? primerMensaje.slice(0, 500) : null,
        conversation_id: conversationId || null,
        fb_page_id:      fbPageId      || null,
        ig_account_id:   igAccountId   || null,
        wa_phone_number: waPhoneNumber  || null,
        status:          'nuevo',
        metadata,
        first_seen_at:   now,
        last_seen_at:    now,
      })
      .select()
      .single();

    if (error) {
      console.error('[LeadService] insert error:', error.message);
      return { lead: null, isNew: false };
    }
    lead = data;
    isNew = true;
  }

  // Save message to lead_messages (fire and forget)
  if (primerMensaje && lead) {
    supabaseAdmin.from('lead_messages').insert({
      lead_id:   lead.id,
      direction: 'inbound',
      content:   primerMensaje.slice(0, 2000),
      canal,
      sent_at:   now,
    }).then(() => {}).catch(e => console.error('[LeadService] lead_messages:', e.message));
  }

  return { lead, isNew };
}

/**
 * Notify admin about a new lead.
 * 1. Saves to notifications table (real-time dashboard bell).
 * 2. Sends WhatsApp to admin if org has notification_phone configured.
 */
async function notifyNewLead({ lead, agentName, orgId }) {
  // 1. Dashboard notification (never throws)
  supabaseAdmin.from('notifications').insert({
    organization_id: orgId,
    type:            'new_lead',
    title:           `Nuevo lead: ${lead.name || lead.canal_username || 'Desconocido'}`,
    body:            `Canal: ${CANAL_LABELS[lead.source_channel] || lead.source_channel} | ${(lead.primer_mensaje || '').slice(0, 100)}`,
    metadata:        { lead_id: lead.id, canal: lead.source_channel, agent_name: agentName },
    read:            false,
  }).then(() => {}).catch(e => console.error('[notifyNewLead] notification insert:', e.message));

  // 2. WhatsApp to admin (fire and forget)
  notifyAdminWhatsApp({ lead, agentName, orgId })
    .catch(e => console.error('[notifyNewLead] whatsapp admin:', e.message));
}

async function notifyAdminWhatsApp({ lead, agentName, orgId }) {
  // Fetch org's notification phone and WhatsApp integration in parallel
  const [{ data: org }, { data: waRows }] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('metadata, name')
      .eq('id', orgId)
      .single(),
    supabaseAdmin
      .from('whatsapp_integrations')
      .select('access_token, phone_number_id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .limit(1),
  ]);

  const adminPhone = org?.metadata?.notification_phone || org?.metadata?.admin_whatsapp;
  const wa = waRows?.[0];

  if (!adminPhone || !wa?.phone_number_id || !wa?.access_token) return;

  const canalLabel    = CANAL_LABELS[lead.source_channel] || lead.source_channel || '—';
  const nombreLead    = lead.name || lead.canal_username || 'Desconocido';
  const campania      = lead.campaign_name || lead.ad_name || 'Orgánico';
  const mensaje       = (lead.primer_mensaje || '').slice(0, 120);

  const text =
    `🔔 *Nuevo lead* en ${agentName || org?.name || 'tu agente'}\n` +
    `📱 Canal: ${canalLabel}\n` +
    `👤 Nombre: ${nombreLead}\n` +
    (lead.phone  ? `📞 Tel: ${lead.phone}\n`  : '') +
    (lead.email  ? `✉️ Email: ${lead.email}\n` : '') +
    `💬 Mensaje: ${mensaje || '—'}\n` +
    `📢 Campaña: ${campania}`;

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${wa.phone_number_id}/messages`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${wa.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                adminPhone,
        type:              'text',
        text:              { preview_url: false, body: text },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`WA admin notify failed: ${JSON.stringify(err?.error || err)}`);
  }

  console.log(`[notifyNewLead] WhatsApp sent to admin ${adminPhone} for org=${orgId}`);
}

module.exports = { upsertLead, notifyNewLead };
