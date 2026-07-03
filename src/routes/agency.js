const { Router } = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');

const router = Router();
router.use(authMiddleware);

const anthropic = new Anthropic();

// ── AI Generate ───────────────────────────────────────────────────────────────

router.post('/generate', async (req, res) => {
  const { prompt, context } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  try {
    const userMessage = context ? `Contexto:\n${context}\n\n${prompt}` : prompt;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: 'Eres XENTTECH AI — estratega experto en marketing digital high-ticket. Responde en español con insights accionables, concisos y orientados a resultados.',
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = message.content?.[0]?.text ?? '';
    res.json({ result: text });
  } catch (err) {
    console.error('[Agency AI] generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Clients ───────────────────────────────────────────────────────────────────

router.get('/clients', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/clients', async (req, res) => {
  const { name, email, phone, company, industry, plan, status, monthly_revenue, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const { data, error } = await supabaseAdmin
    .from('clients')
    .insert({ name, email, phone, company, industry, plan, status: status || 'prospect', monthly_revenue, notes })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Auto-generate portal token "XT-XXXXXXXX"
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = 'XT-';
  for (let i = 0; i < 8; i++) token += chars[Math.floor(Math.random() * chars.length)];

  await supabaseAdmin.from('portal_tokens').insert({ client_id: data.id, token, is_active: true, label: 'Portal Access' });
  await supabaseAdmin.from('activity_log').insert({ client_id: data.id, action: 'Cliente creado', details: `Token: ${token}` });

  res.status(201).json({ ...data, portal_token: token });
});

router.put('/clients/:id', async (req, res) => {
  const { id } = req.params;
  const fields = (({ name, email, phone, company, industry, plan, status, monthly_revenue, onboarding_step, notes }) =>
    ({ name, email, phone, company, industry, plan, status, monthly_revenue, onboarding_step, notes }))(req.body);
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  clean.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('clients')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/clients/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('clients').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ── Onboarding ────────────────────────────────────────────────────────────────

router.get('/onboarding', async (req, res) => {
  const { client_id } = req.query;
  let q = supabaseAdmin.from('onboarding_documents').select('*, clients(name, company)').order('step_number');
  if (client_id) q = q.eq('client_id', client_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/onboarding', async (req, res) => {
  const { client_id, step_number, step_name, content, status } = req.body;
  if (!client_id || !step_name) return res.status(400).json({ error: 'client_id and step_name required' });

  const { data, error } = await supabaseAdmin
    .from('onboarding_documents')
    .upsert(
      { client_id, step_number: step_number ?? 1, step_name, content, status: status || 'pending', updated_at: new Date().toISOString() },
      { onConflict: 'client_id,step_number', ignoreDuplicates: false }
    )
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/onboarding/:id', async (req, res) => {
  const { step_name, content, status, step_number } = req.body;
  const clean = Object.fromEntries(
    Object.entries({ step_name, content, status, step_number }).filter(([, v]) => v !== undefined)
  );
  clean.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('onboarding_documents')
    .update(clean)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/onboarding/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('onboarding_documents').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ── Campaigns ─────────────────────────────────────────────────────────────────

router.get('/campaigns', async (req, res) => {
  const { client_id } = req.query;
  let q = supabaseAdmin
    .from('campaigns')
    .select('*, clients(name, company)')
    .order('created_at', { ascending: false });
  if (client_id) q = q.eq('client_id', client_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/campaigns', async (req, res) => {
  const { client_id, platform, campaign_name, objective, audience, budget_monthly, status } = req.body;
  if (!client_id || !campaign_name) return res.status(400).json({ error: 'client_id and campaign_name required' });

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .insert({ client_id, platform, campaign_name, objective, audience, budget_monthly, status: status || 'draft' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/campaigns/:id', async (req, res) => {
  const { platform, campaign_name, objective, audience, budget_monthly, status, ad_copies, metrics } = req.body;
  const clean = Object.fromEntries(
    Object.entries({ platform, campaign_name, objective, audience, budget_monthly, status, ad_copies, metrics })
      .filter(([, v]) => v !== undefined)
  );
  clean.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .update(clean)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/campaigns/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('campaigns').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ── Strategies ────────────────────────────────────────────────────────────────

router.get('/strategies', async (req, res) => {
  const { client_id } = req.query;
  let q = supabaseAdmin
    .from('strategies')
    .select('*, clients(name, company)')
    .order('created_at', { ascending: false });
  if (client_id) q = q.eq('client_id', client_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/strategies', async (req, res) => {
  const { client_id, title, content, foda, kpis, calendar, status } = req.body;
  if (!client_id || !title) return res.status(400).json({ error: 'client_id and title required' });

  const { data, error } = await supabaseAdmin
    .from('strategies')
    .insert({ client_id, title, content, foda, kpis, calendar, status: status || 'draft' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/strategies/:id', async (req, res) => {
  const { title, content, foda, kpis, calendar, status } = req.body;
  const clean = Object.fromEntries(
    Object.entries({ title, content, foda, kpis, calendar, status }).filter(([, v]) => v !== undefined)
  );
  clean.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('strategies')
    .update(clean)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/strategies/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('strategies').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ── Designs ───────────────────────────────────────────────────────────────────

router.get('/designs', async (req, res) => {
  const { client_id } = req.query;
  let q = supabaseAdmin
    .from('designs')
    .select('*, clients(name, company)')
    .order('created_at', { ascending: false });
  if (client_id) q = q.eq('client_id', client_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/designs', async (req, res) => {
  const { client_id, campaign_id, design_type, brief, canva_url, status } = req.body;
  if (!client_id || !design_type) return res.status(400).json({ error: 'client_id and design_type required' });

  const { data, error } = await supabaseAdmin
    .from('designs')
    .insert({ client_id, campaign_id, design_type, brief, canva_url, status: status || 'pending' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/designs/:id', async (req, res) => {
  const { design_type, brief, canva_url, status } = req.body;
  const clean = Object.fromEntries(
    Object.entries({ design_type, brief, canva_url, status }).filter(([, v]) => v !== undefined)
  );

  const { data, error } = await supabaseAdmin
    .from('designs')
    .update(clean)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/designs/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('designs').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ── Portal Tokens ─────────────────────────────────────────────────────────────

router.get('/portal-tokens', async (req, res) => {
  const { client_id } = req.query;
  let q = supabaseAdmin.from('portal_tokens').select('*').order('created_at', { ascending: false });
  if (client_id) q = q.eq('client_id', client_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/portal-tokens', async (req, res) => {
  const { client_id, label } = req.body;
  if (!client_id) return res.status(400).json({ error: 'client_id required' });

  const { data, error } = await supabaseAdmin
    .from('portal_tokens')
    .insert({ client_id, label: label || 'Portal Access' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Log activity
  await supabaseAdmin.from('activity_log').insert({
    client_id,
    action: 'Portal token generado',
    details: `Token: ${data.token.slice(0, 8)}...`,
  });

  res.status(201).json(data);
});

router.patch('/portal-tokens/:id/revoke', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('portal_tokens')
    .update({ is_active: false })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/portal-tokens/:id', async (req, res) => {
  const { error } = await supabaseAdmin.from('portal_tokens').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ── Activity Log ──────────────────────────────────────────────────────────────

router.get('/activity', async (req, res) => {
  const { client_id } = req.query;
  let q = supabaseAdmin.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50);
  if (client_id) q = q.eq('client_id', client_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/activity', async (req, res) => {
  const { client_id, action, details } = req.body;
  if (!client_id || !action) return res.status(400).json({ error: 'client_id and action required' });
  const { data, error } = await supabaseAdmin
    .from('activity_log')
    .insert({ client_id, action, details })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

module.exports = router;
