const { Router } = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');

const router = Router();
router.use(authMiddleware);

const PAGE_SIZE = 20;

router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabaseAdmin
    .from('conversations')
    .select('*, agents(name, avatar_url), channels(name, type)', { count: 'exact' })
    .eq('organization_id', req.organizationId)
    .order('last_message_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (req.query.status) query = query.eq('status', req.query.status);
  if (req.query.agent_id) query = query.eq('agent_id', req.query.agent_id);
  if (req.query.channel_id) query = query.eq('channel_id', req.query.channel_id);
  if (req.query.assigned_to) query = query.eq('assigned_to', req.query.assigned_to);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ data, total: count, page, pageSize: PAGE_SIZE });
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('*, agents(*), channels(*)')
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Conversation not found' });

  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', req.params.id)
    .order('created_at', { ascending: true });

  res.json({ ...data, messages: messages || [] });
});

router.patch('/:id/status', async (req, res) => {
  const schema = z.object({
    status: z.enum(['open', 'resolved', 'handed_off', 'spam']),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const update = { status: parsed.data.status };
  if (parsed.data.status === 'resolved') update.resolved_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update(update)
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Conversation not found' });
  res.json(data);
});

router.patch('/:id/assign', async (req, res) => {
  const schema = z.object({ user_id: z.string().uuid().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update({ assigned_to: parsed.data.user_id })
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Conversation not found' });
  res.json(data);
});

module.exports = router;
