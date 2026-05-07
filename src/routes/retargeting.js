const { Router } = require('express');
const { z } = require('zod');
const { authMiddleware } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');
const retargetingService = require('../services/retargetingService');
const channelService = require('../services/channelService');

const router = Router();
router.use(authMiddleware);

// ---------------------------------------------------------------------------
// Existing endpoints
// ---------------------------------------------------------------------------

// GET /api/retargeting/leads?agent_id=xxx
router.get('/leads', async (req, res) => {
  const { agent_id } = req.query;
  if (!agent_id) return res.status(400).json({ error: 'agent_id required' });

  try {
    const leads = await retargetingService.getLeadsForAgent(agent_id, req.organizationId);
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/retargeting/scan — detect abandoned conversations and create leads
router.post('/scan', async (req, res) => {
  const schema = z.object({
    agent_id: z.string().uuid(),
    hours_threshold: z.number().min(1).max(720).default(24),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const leads = await retargetingService.scanAbandonedConversations(
      parsed.data.agent_id,
      req.organizationId,
      parsed.data.hours_threshold
    );
    res.json({ scanned: leads.length, leads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/retargeting/send-followup
router.post('/send-followup', async (req, res) => {
  const schema = z.object({
    lead_id: z.string().uuid(),
    message: z.string().min(1).max(2000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await retargetingService.sendFollowup(
      parsed.data.lead_id,
      req.organizationId,
      parsed.data.message
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/retargeting/leads/:id
router.patch('/leads/:id', async (req, res) => {
  const schema = z.object({
    status: z.enum(['new', 'contacted', 'qualified', 'lost']),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const lead = await retargetingService.updateLeadStatus(
      req.params.id,
      req.organizationId,
      parsed.data.status,
      parsed.data.notes
    );
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// New endpoints
// ---------------------------------------------------------------------------

// GET /api/retargeting/config/:agent_id
router.get('/config/:agent_id', async (req, res) => {
  const { agent_id } = req.params;

  try {
    // Verify agent belongs to the org
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .eq('organization_id', req.organizationId)
      .maybeSingle();

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { data: config, error } = await supabaseAdmin
      .from('retargeting_config')
      .select('*')
      .eq('agent_id', agent_id)
      .maybeSingle();

    if (error) throw error;

    res.json(config || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/retargeting/config/:agent_id
router.put('/config/:agent_id', async (req, res) => {
  const { agent_id } = req.params;

  try {
    // Verify agent belongs to the org
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .eq('organization_id', req.organizationId)
      .maybeSingle();

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { data: config, error } = await supabaseAdmin
      .from('retargeting_config')
      .upsert({ ...req.body, agent_id }, { onConflict: 'agent_id' })
      .select()
      .single();

    if (error) throw error;

    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/retargeting/stats/:agent_id
router.get('/stats/:agent_id', async (req, res) => {
  const { agent_id } = req.params;

  try {
    // Verify agent belongs to the org
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .eq('organization_id', req.organizationId)
      .maybeSingle();

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const [
      { count: mensajes_enviados },
      { count: pendientes },
      { count: fallidos },
      { count: leads_total },
    ] = await Promise.all([
      supabaseAdmin
        .from('retargeting_sequences')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent_id)
        .eq('status', 'sent'),
      supabaseAdmin
        .from('retargeting_sequences')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent_id)
        .eq('status', 'pending'),
      supabaseAdmin
        .from('retargeting_sequences')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent_id)
        .eq('status', 'failed'),
      supabaseAdmin
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agent_id),
    ]);

    res.json({
      mensajes_enviados: mensajes_enviados || 0,
      pendientes: pendientes || 0,
      fallidos: fallidos || 0,
      leads_total: leads_total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/retargeting/test/:agent_id
router.post('/test/:agent_id', async (req, res) => {
  const { agent_id } = req.params;
  const schema = z.object({
    step: z.number().int().min(0).max(4),
    phone: z.string().optional(),
    message: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { step, phone, message: bodyMessage } = parsed.data;

  try {
    // Verify agent belongs to the org
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .eq('organization_id', req.organizationId)
      .maybeSingle();

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { data: config } = await supabaseAdmin
      .from('retargeting_config')
      .select('*')
      .eq('agent_id', agent_id)
      .maybeSingle();

    const testMsg = bodyMessage || (config && config[`step_${step}_message`]) || 'Mensaje de prueba';

    if (phone) {
      const { data: channel } = await supabaseAdmin
        .from('channels')
        .select('*')
        .eq('agent_id', agent_id)
        .eq('type', 'whatsapp')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (channel) {
        await channelService.sendMessage(channel, phone, testMsg);
      }
    }

    res.json({ sent: true, message: testMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
