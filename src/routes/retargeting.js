const { Router } = require('express');
const { z } = require('zod');
const { authMiddleware } = require('../middleware/auth');
const retargetingService = require('../services/retargetingService');

const router = Router();
router.use(authMiddleware);

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

module.exports = router;
