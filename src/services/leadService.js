const { supabaseAdmin } = require('../config/supabase');

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
  canal,         // 'whatsapp'|'facebook'|'instagram'|'slack'|'widget'
  canalUserId,   // external ID in channel (sender.id, phone, slack user id, session id)
  canalUsername, // @username or display name
  nombre,
  email,
  telefono,
  adId,
  adName,
  campaignId,
  campaignName,
  adsetId,
  adsetName,
  adSource,      // 'facebook_ad'|'instagram_ad'|'organic'
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
    if (nombre    && !existingLead.name)            updates.name            = nombre;
    if (email     && !existingLead.email)           updates.email           = email;
    if (telefono  && !existingLead.phone)           updates.phone           = telefono;
    if (canalUsername && !existingLead.canal_username) updates.canal_username = canalUsername;
    if (conversationId && !existingLead.conversation_id) updates.conversation_id = conversationId;

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
        canal,
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
 * Saves to notifications table (picked up by dashboard real-time subscription).
 */
async function notifyNewLead({ lead, agentName, orgId }) {
  try {
    await supabaseAdmin.from('notifications').insert({
      organization_id: orgId,
      type:            'new_lead',
      title:           `Nuevo lead: ${lead.name || lead.canal_username || 'Desconocido'}`,
      body:            `Canal: ${lead.canal} | ${(lead.primer_mensaje || '').slice(0, 100)}`,
      metadata:        { lead_id: lead.id, canal: lead.canal, agent_name: agentName },
      read:            false,
    });
  } catch (err) {
    console.error('[notifyNewLead] error:', err.message);
  }
}

module.exports = { upsertLead, notifyNewLead };
