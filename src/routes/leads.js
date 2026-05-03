const { Router }       = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');

const router = Router();
router.use(authMiddleware);

// GET /api/leads — list with filters
router.get('/', async (req, res) => {
  const { canal, status, period, search, campaign_id } = req.query;

  let q = supabaseAdmin
    .from('leads')
    .select('*, agents(name)', { count: 'exact' })
    .eq('organization_id', req.organizationId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (canal && canal !== 'all')     q = q.eq('canal', canal);
  if (status && status !== 'all')   q = q.eq('status', status);
  if (campaign_id)                  q = q.eq('campaign_id', campaign_id);

  if (period) {
    const now   = new Date();
    const from  = period === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      : period === '7d'
      ? new Date(Date.now() - 7  * 86400000).toISOString()
      : period === '30d'
      ? new Date(Date.now() - 30 * 86400000).toISOString()
      : null;
    if (from) q = q.gte('created_at', from);
  }

  if (search) {
    q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,canal_username.ilike.%${search}%`);
  }

  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ leads: data || [], total: count || 0 });
});

// GET /api/leads/metrics — dashboard stats
router.get('/metrics', async (req, res) => {
  const orgId = req.organizationId;
  const now   = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startPrev    = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [thisMonth, prevMonth, byCanal, fromAds] = await Promise.all([
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).gte('created_at', startOfMonth),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', startPrev).lt('created_at', startOfMonth),
    supabaseAdmin.from('leads').select('canal')
      .eq('organization_id', orgId).gte('created_at', startOfMonth),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).gte('created_at', startOfMonth).not('ad_id', 'is', null),
  ]);

  const totalThisMonth = thisMonth.count  || 0;
  const totalPrev      = prevMonth.count  || 0;
  const totalAds       = fromAds.count    || 0;
  const variation      = totalPrev > 0
    ? Math.round(((totalThisMonth - totalPrev) / totalPrev) * 100)
    : null;

  // Count by canal
  const canalMap = {};
  for (const { canal } of (byCanal.data || [])) {
    if (canal) canalMap[canal] = (canalMap[canal] || 0) + 1;
  }

  res.json({
    total_this_month: totalThisMonth,
    variation_pct:    variation,
    by_canal:         canalMap,
    total_ads:        totalAds,
    total_organic:    totalThisMonth - totalAds,
  });
});

// PATCH /api/leads/:id — update status or notes
router.patch('/:id', async (req, res) => {
  const { status, notes } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (notes  !== undefined) updates.notes = notes;

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update(updates)
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'Lead not found' });
  res.json(data);
});

// GET /api/leads/:id/messages — conversation history
router.get('/:id/messages', async (req, res) => {
  // Verify lead belongs to org
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .maybeSingle();

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const { data, error } = await supabaseAdmin
    .from('lead_messages')
    .select('*')
    .eq('lead_id', req.params.id)
    .order('sent_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/leads/export.csv
router.get('/export.csv', async (req, res) => {
  const { canal, status, period, search } = req.query;

  let q = supabaseAdmin
    .from('leads')
    .select('name,email,phone,canal,canal_username,ad_name,campaign_name,status,primer_mensaje,first_seen_at,created_at')
    .eq('organization_id', req.organizationId)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (canal  && canal  !== 'all') q = q.eq('canal', canal);
  if (status && status !== 'all') q = q.eq('status', status);
  if (period) {
    const from = period === 'today'
      ? new Date(new Date().setHours(0,0,0,0)).toISOString()
      : period === '7d'  ? new Date(Date.now() - 7  * 86400000).toISOString()
      : period === '30d' ? new Date(Date.now() - 30 * 86400000).toISOString()
      : null;
    if (from) q = q.gte('created_at', from);
  }
  if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const cols = ['Nombre','Email','Teléfono','Canal','Username','Anuncio','Campaña','Status','Primer mensaje','Primera visita','Creado'];
  const rows = (data || []).map(l => [
    l.name, l.email, l.phone, l.canal, l.canal_username,
    l.ad_name, l.campaign_name, l.status,
    (l.primer_mensaje || '').replace(/"/g, '""'),
    l.first_seen_at, l.created_at,
  ].map(v => `"${v ?? ''}"`).join(','));

  const csv = [cols.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads_${Date.now()}.csv"`);
  res.send('﻿' + csv); // BOM for Excel UTF-8
});

module.exports = router;
