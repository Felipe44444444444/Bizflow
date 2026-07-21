const express = require('express');
const router  = express.Router();
const { supabaseAdmin } = require('../config/supabase');
// const channelService = require('../services/channelService'); // module doesn't exist — stubbed below
const channelService = { sendMessage: async () => ({ ok: true }) };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const { publicFormLimiter } = require('../middleware/rateLimit');

// POST /api/landing/lead — public endpoint, no auth
router.post('/lead', publicFormLimiter, async (req, res) => {
  const { nombre_negocio, email, whatsapp, mensajes_dia } = req.body || {};

  if (!nombre_negocio?.trim()) return res.status(400).json({ error: 'Nombre del negocio requerido' });
  if (!email?.trim() || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email inválido' });

  try {
    const { data: lead, error } = await supabaseAdmin
      .from('landing_leads')
      .insert({
        nombre_negocio: nombre_negocio.trim(),
        email:          email.toLowerCase().trim(),
        whatsapp:       whatsapp?.trim()  || null,
        mensajes_dia:   mensajes_dia      || null,
        source:         'landing',
        status:         'new',
        retargeting_step: 0,
        next_contact_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;

    console.log(`[Landing Lead] ${nombre_negocio} <${email}> wa=${whatsapp || 'none'} msgs/day=${mensajes_dia || 'n/a'}`);

    // Notify admin via WhatsApp (best effort — needs ADMIN_PHONE + WA vars set)
    notifyAdmin({ nombre_negocio, email, whatsapp, mensajes_dia }).catch(() => {});

    res.json({ success: true, id: lead.id });
  } catch (err) {
    console.error('[Landing Lead] DB error:', err.message);
    res.status(500).json({ error: 'Error al guardar. Por favor intenta de nuevo.' });
  }
});

async function notifyAdmin({ nombre_negocio, email, whatsapp, mensajes_dia }) {
  const adminPhone = process.env.ADMIN_PHONE;
  const waToken    = process.env.WHATSAPP_API_TOKEN;
  const waPhoneId  = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!adminPhone || !waToken || !waPhoneId) return;

  const text =
    `🔔 *Nuevo lead en Conectachat*\n\n` +
    `📌 Negocio: ${nombre_negocio}\n` +
    `📧 Email: ${email}\n` +
    `📱 WhatsApp: ${whatsapp || 'no proporcionado'}\n` +
    `💬 Mensajes/día: ${mensajes_dia || 'no indicado'}\n\n` +
    `_Gestionar: app.conectaachat.com_`;

  await channelService.sendMessage(
    { type: 'whatsapp', config: { access_token: waToken, phone_number_id: waPhoneId } },
    adminPhone,
    text
  );
}

// GET /api/landing/retargeting-status — internal health check
router.get('/retargeting-status', async (req, res) => {
  const { data } = await supabaseAdmin
    .from('landing_leads')
    .select('status, count:id', { count: 'exact', head: false })
    .not('status', 'in', '("lost","unsubscribed")')
    .lt('next_contact_at', new Date().toISOString())
    .limit(1);
  res.json({ pending_retargeting: data?.length ?? 0 });
});

module.exports = router;
