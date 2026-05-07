const { Router } = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');

const router = Router();
router.use(authMiddleware);

// GET /api/handoff/pending — list pending + in-progress handoff requests
router.get('/pending', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('handoff_requests')
    .select('*, conversations(id, external_id, source_channel)')
    .eq('organization_id', req.organizationId)
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/handoff/all — list all (with filter)
router.get('/all', async (req, res) => {
  const { status } = req.query;
  let q = supabaseAdmin
    .from('handoff_requests')
    .select('*, conversations(id, external_id, source_channel)')
    .eq('organization_id', req.organizationId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// PATCH /api/handoff/:id/assign — assign to current user
router.patch('/:id/assign', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('handoff_requests')
    .update({ status: 'in_progress', assigned_to: req.user.id, assigned_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// PATCH /api/handoff/:id/resolve — mark resolved, reactivate bot
router.patch('/:id/resolve', async (req, res) => {
  const { data: handoff, error } = await supabaseAdmin
    .from('handoff_requests')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!handoff) return res.status(404).json({ error: 'Not found' });

  // Reactivate conversation (set status back to open)
  if (handoff.conversation_id) {
    await supabaseAdmin
      .from('conversations')
      .update({ status: 'open' })
      .eq('id', handoff.conversation_id);
  }
  res.json(handoff);
});

// GET /api/handoff/notifications — list unread notifications
router.get('/notifications', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('organization_id', req.organizationId)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// PATCH /api/handoff/notifications/:id/read
router.patch('/notifications/:id/read', async (req, res) => {
  await supabaseAdmin.from('notifications').update({ read: true })
    .eq('id', req.params.id).eq('organization_id', req.organizationId);
  res.json({ ok: true });
});

// PATCH /api/handoff/notifications/read-all
router.patch('/notifications/read-all', async (req, res) => {
  await supabaseAdmin.from('notifications').update({ read: true })
    .eq('organization_id', req.organizationId).eq('read', false);
  res.json({ ok: true });
});

module.exports = router;
