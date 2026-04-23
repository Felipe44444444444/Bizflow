const { Router } = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { generateApiKey, hashApiKey, getKeyPrefix } = require('../utils/apiKey');

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, name, key_prefix, agent_id, is_active, last_used_at, expires_at, created_at')
    .eq('organization_id', req.organizationId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100),
    agent_id: z.string().uuid().optional(),
    expires_at: z.string().datetime().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.agent_id) {
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('id', parsed.data.agent_id)
      .eq('organization_id', req.organizationId)
      .single();

    if (!agent) return res.status(404).json({ error: 'Agent not found' });
  }

  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = getKeyPrefix(rawKey);

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .insert({
      organization_id: req.organizationId,
      agent_id: parsed.data.agent_id || null,
      name: parsed.data.name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      expires_at: parsed.data.expires_at || null,
      created_by: req.user.id,
    })
    .select('id, name, key_prefix, agent_id, is_active, expires_at, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Return raw key only once — it's not stored
  res.status(201).json({ ...data, key: rawKey });
});

router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const { error } = await supabaseAdmin
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'API key revoked' });
});

module.exports = router;
