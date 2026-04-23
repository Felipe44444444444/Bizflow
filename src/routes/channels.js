const { Router } = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = Router();
router.use(authMiddleware);

const channelSchema = z.object({
  agent_id: z.string().uuid(),
  type: z.enum(['instagram', 'facebook', 'slack', 'whatsapp', 'web_widget', 'landing_page', 'api']),
  name: z.string().min(1).max(100),
  is_active: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
  webhook_secret: z.string().optional(),
});

router.get('/', async (req, res) => {
  const query = supabaseAdmin
    .from('channels')
    .select('*, agents(name)')
    .eq('organization_id', req.organizationId)
    .order('updated_at', { ascending: false });

  if (req.query.agent_id) query.eq('agent_id', req.query.agent_id);
  if (req.query.type) query.eq('type', req.query.type);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Channel not found' });
  res.json(data);
});

router.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const parsed = channelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('id', parsed.data.agent_id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agent not found in this organization' });

  const { data, error } = await supabaseAdmin
    .from('channels')
    .insert({ ...parsed.data, organization_id: req.organizationId })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const parsed = channelSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data, error } = await supabaseAdmin
    .from('channels')
    .update(parsed.data)
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Channel not found' });
  res.json(data);
});

router.post('/:id/connect', requireRole('owner', 'admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('channels')
    .update({ is_active: true, connected_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Channel not found' });
  res.json({ message: 'Channel connected', channel: data });
});

router.post('/:id/disconnect', requireRole('owner', 'admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('channels')
    .update({ is_active: false })
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Channel not found' });
  res.json({ message: 'Channel disconnected', channel: data });
});

router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const { error } = await supabaseAdmin
    .from('channels')
    .delete()
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// POST /:id/meta/connect — subscribe a Facebook/Instagram page to webhooks
router.post('/:id/meta/connect', requireRole('owner', 'admin'), async (req, res) => {
  const { pageId, pageAccessToken, igUserId, verifyToken } = req.body;
  if (!pageId || !pageAccessToken || !verifyToken) {
    return res.status(400).json({ error: 'pageId, pageAccessToken, and verifyToken are required' });
  }

  const { data: channel } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  // Subscribe the page to webhook fields via Graph API
  const subscribeRes = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: pageAccessToken,
        subscribed_fields: channel.type === 'instagram'
          ? ['messages', 'messaging_postbacks']
          : ['messages', 'messaging_postbacks', 'messaging_referrals'],
      }),
    }
  );

  const subscribeData = await subscribeRes.json();
  if (!subscribeRes.ok || subscribeData.error) {
    return res.status(400).json({
      error: 'Failed to subscribe to Meta webhooks',
      detail: subscribeData.error,
    });
  }

  const config = {
    ...channel.config,
    page_id: pageId,
    access_token: pageAccessToken,
    verify_token: verifyToken,
    ...(igUserId ? { ig_user_id: igUserId } : {}),
  };

  const { data: updated, error } = await supabaseAdmin
    .from('channels')
    .update({ config, is_active: true, connected_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Meta channel connected', channel: updated });
});

// POST /:id/slack/connect — verify bot token and save Slack workspace config
router.post('/:id/slack/connect', requireRole('owner', 'admin'), async (req, res) => {
  const { botToken, signingSecret, teamId } = req.body;
  if (!botToken || !signingSecret) {
    return res.status(400).json({ error: 'botToken and signingSecret are required' });
  }

  // Verify the bot token is valid
  const authRes = await fetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
  });

  const authData = await authRes.json();
  if (!authData.ok) {
    return res.status(400).json({ error: 'Invalid Slack bot token', detail: authData.error });
  }

  const resolvedTeamId = teamId || authData.team_id;

  const { data: channel } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const config = {
    ...channel.config,
    bot_token: botToken,
    signing_secret: signingSecret,
    team_id: resolvedTeamId,
    team_name: authData.team,
    bot_user_id: authData.user_id,
  };

  const { data: updated, error } = await supabaseAdmin
    .from('channels')
    .update({ config, is_active: true, connected_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Slack channel connected', channel: updated });
});

module.exports = router;
