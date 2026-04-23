const { Router } = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authMiddleware);

const agentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  avatar_url: z.string().url().optional(),
  system_prompt: z.string().optional(),
  language: z.string().default('es'),
  tone: z.enum(['professional', 'friendly', 'formal', 'casual']).default('professional'),
  fallback_message: z.string().optional(),
  handoff_enabled: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('organization_id', req.organizationId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Agent not found' });
  res.json(data);
});

router.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const parsed = agentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data, error } = await supabaseAdmin
    .from('agents')
    .insert({ ...parsed.data, organization_id: req.organizationId })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const parsed = agentSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data, error } = await supabaseAdmin
    .from('agents')
    .update(parsed.data)
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Agent not found' });
  res.json(data);
});

router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const { error } = await supabaseAdmin
    .from('agents')
    .delete()
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

module.exports = router;
