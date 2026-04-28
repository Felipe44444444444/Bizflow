const { Router } = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = Router();

const META_APP_ID   = process.env.FACEBOOK_APP_ID || process.env.META_APP_ID || '';
const META_REDIRECT = process.env.META_REDIRECT_URI || 'https://app.conectaachat.com/channels/meta/callback';

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

// GET /:id/verify — test if a channel's credentials are still valid
router.get('/:id/verify', requireRole('owner', 'admin'), async (req, res) => {
  const { data: channel } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('id', req.params.id)
    .eq('organization_id', req.organizationId)
    .single();

  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  try {
    if (channel.type === 'instagram' || channel.type === 'facebook') {
      const { access_token, page_id } = channel.config || {};
      if (!access_token || !page_id) throw new Error('Credenciales incompletas');
      const r = await fetch(`https://graph.facebook.com/v19.0/${page_id}?access_token=${access_token}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      return res.json({ verified: true, detail: `Página conectada: ${d.name}` });
    }

    if (channel.type === 'slack') {
      const { bot_token } = channel.config || {};
      if (!bot_token) throw new Error('Token de bot faltante');
      const r = await fetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${bot_token}` },
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      return res.json({ verified: true, detail: `Workspace: ${d.team}` });
    }

    if (channel.type === 'whatsapp') {
      const { access_token, phone_number_id } = channel.config || {};
      if (!access_token || !phone_number_id) throw new Error('Credenciales incompletas');
      const r = await fetch(
        `https://graph.facebook.com/v19.0/${phone_number_id}?access_token=${access_token}`
      );
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      return res.json({ verified: true, detail: `Número: ${d.display_phone_number}` });
    }

    return res.json({ verified: channel.is_active, detail: channel.is_active ? 'Canal activo' : 'Canal inactivo' });
  } catch (err) {
    return res.json({ verified: false, detail: err.message });
  }
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

// GET /meta/auth-url — generate Facebook OAuth URL for the popup flow
router.get('/meta/auth-url', async (req, res) => {
  const { agentId } = req.query;
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('organization_id', req.organizationId)
    .single();

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const state  = `${agentId}_${req.organizationId}`;
  const scope  = 'pages_messaging,instagram_manage_messages,pages_show_list,pages_read_engagement,pages_manage_metadata';
  const url    = `https://www.facebook.com/v19.0/dialog/oauth`
    + `?client_id=${META_APP_ID}`
    + `&redirect_uri=${encodeURIComponent(META_REDIRECT)}`
    + `&scope=${encodeURIComponent(scope)}`
    + `&state=${encodeURIComponent(state)}`
    + `&response_type=code`;

  res.json({ url });
});

// GET /meta/callback — exchange OAuth code for page tokens, return pages list
router.get('/meta/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).json({ error: 'code and state are required' });

  const parts  = String(state).split('_');
  const orgId  = parts[parts.length - 1];
  const agentId = parts.slice(0, parts.length - 1).join('_');

  if (orgId !== req.organizationId) {
    return res.status(403).json({ error: 'State mismatch — org does not match session' });
  }

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return res.status(500).json({ error: 'META_APP_SECRET not configured' });

  // Exchange code for user access token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token`
    + `?client_id=${META_APP_ID}`
    + `&client_secret=${appSecret}`
    + `&redirect_uri=${encodeURIComponent(META_REDIRECT)}`
    + `&code=${encodeURIComponent(code)}`
  );
  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    return res.status(400).json({ error: tokenData.error.message || 'Failed to exchange OAuth code' });
  }

  const userToken = tokenData.access_token;

  // Get pages managed by the user
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts`
    + `?access_token=${userToken}`
    + `&fields=id,name,access_token,category`
  );
  const pagesData = await pagesRes.json();
  if (pagesData.error) {
    return res.status(400).json({ error: pagesData.error.message || 'Failed to fetch pages' });
  }

  const rawPages = pagesData.data || [];

  // For each page fetch its linked Instagram Business Account (if any)
  const pages = await Promise.all(
    rawPages.map(async (page) => {
      try {
        const igRes  = await fetch(
          `https://graph.facebook.com/v19.0/${page.id}`
          + `?fields=instagram_business_account`
          + `&access_token=${page.access_token}`
        );
        const igData = await igRes.json();
        return {
          id:                 page.id,
          name:               page.name,
          access_token:       page.access_token,
          category:           page.category,
          instagram_user_id:  igData.instagram_business_account?.id || null,
        };
      } catch {
        return {
          id:                page.id,
          name:              page.name,
          access_token:      page.access_token,
          category:          page.category,
          instagram_user_id: null,
        };
      }
    })
  );

  res.json({ pages, agentId });
});

module.exports = router;
