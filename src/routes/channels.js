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
  const scope  = 'pages_messaging,pages_show_list,pages_read_engagement,pages_manage_metadata,instagram_manage_messages,instagram_manage_comments';
  const url    = `https://www.facebook.com/v19.0/dialog/oauth`
    + `?client_id=${META_APP_ID}`
    + `&redirect_uri=${encodeURIComponent(META_REDIRECT)}`
    + `&scope=${encodeURIComponent(scope)}`
    + `&state=${encodeURIComponent(state)}`
    + `&response_type=code`;

  res.json({ url });
});

// GET /meta/callback — exchange OAuth code, save FB+IG channels to DB immediately
router.get('/meta/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).json({ error: 'code and state are required' });

  const parts   = String(state).split('_');
  const orgId   = parts[parts.length - 1];
  const agentId = parts.slice(0, parts.length - 1).join('_');

  if (orgId !== req.organizationId) {
    return res.status(403).json({ error: 'State mismatch — org does not match session' });
  }

  const appId     = META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return res.status(500).json({ error: 'META_APP_SECRET not configured' });

  // 1) Exchange code for short-lived user token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token`
    + `?client_id=${appId}`
    + `&client_secret=${appSecret}`
    + `&redirect_uri=${encodeURIComponent(META_REDIRECT)}`
    + `&code=${encodeURIComponent(code)}`
  );
  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    return res.status(400).json({ error: tokenData.error.message || 'Failed to exchange OAuth code' });
  }
  const userToken = tokenData.access_token;

  // 2) Exchange for long-lived token
  let longLivedToken = userToken;
  try {
    const llRes  = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token`
      + `?grant_type=fb_exchange_token`
      + `&client_id=${appId}`
      + `&client_secret=${appSecret}`
      + `&fb_exchange_token=${userToken}`
    );
    const llData = await llRes.json();
    if (llData.access_token) longLivedToken = llData.access_token;
  } catch (e) { console.warn('[Meta callback] Long-lived token exchange failed, using short-lived'); }

  // 3) Get pages
  const pagesRes  = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts`
    + `?access_token=${longLivedToken}`
    + `&fields=id,name,access_token,category,instagram_business_account`
  );
  const pagesData = await pagesRes.json();
  if (pagesData.error) {
    return res.status(400).json({ error: pagesData.error.message || 'Failed to fetch pages' });
  }

  const rawPages = pagesData.data || [];
  if (rawPages.length === 0) {
    return res.status(400).json({
      error: 'NO_PAGES: Tu cuenta no tiene Páginas de Facebook. Debes ser administrador de una Página.',
    });
  }

  // 4) Enrich each page with Instagram Business account
  const pages = await Promise.all(
    rawPages.map(async (page) => {
      try {
        const igRes  = await fetch(
          `https://graph.facebook.com/v19.0/${page.id}`
          + `?fields=instagram_business_account{id,username,name}`
          + `&access_token=${page.access_token}`
        );
        const igData = await igRes.json();
        console.log(`[Meta callback] page ${page.id} (${page.name}) ig:`, JSON.stringify(igData.instagram_business_account));
        return {
          id:                  page.id,
          name:                page.name,
          access_token:        page.access_token,
          category:            page.category,
          instagram_user_id:   igData.instagram_business_account?.id     || null,
          instagram_username:  igData.instagram_business_account?.username || null,
        };
      } catch {
        return { id: page.id, name: page.name, access_token: page.access_token, category: page.category, instagram_user_id: null, instagram_username: null };
      }
    })
  );

  // 5) Auto-generate verify token for webhooks
  const verifyToken = require('crypto').randomBytes(16).toString('hex');

  // 6) Save FB + IG channels to DB for every page
  const savedChannels = [];

  for (const page of pages) {
    const fbConfig = {
      page_id:            page.id,
      access_token:       page.access_token,
      verify_token:       verifyToken,
      page_name:          page.name,
      user_access_token:  longLivedToken,
    };

    // Subscribe page to Facebook webhooks
    try {
      await fetch(`https://graph.facebook.com/v19.0/${page.id}/subscribed_apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: page.access_token, subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_referrals'] }),
      });
    } catch (e) { console.warn('[Meta callback] Webhook subscription failed for page', page.id, e.message); }

    // Upsert Facebook channel
    const { data: fbExisting } = await supabaseAdmin.from('channels').select('id')
      .eq('organization_id', orgId).eq('agent_id', agentId).eq('type', 'facebook').maybeSingle();

    let fbChannel;
    if (fbExisting) {
      const { data } = await supabaseAdmin.from('channels')
        .update({ config: fbConfig, is_active: true, connected_at: new Date().toISOString(), name: page.name })
        .eq('id', fbExisting.id).select().single();
      fbChannel = data;
    } else {
      const { data } = await supabaseAdmin.from('channels')
        .insert({ organization_id: orgId, agent_id: agentId, type: 'facebook', name: page.name, is_active: true, connected_at: new Date().toISOString(), config: fbConfig })
        .select().single();
      fbChannel = data;
    }
    if (fbChannel) savedChannels.push({ type: 'facebook', channel: fbChannel });

    // Upsert Instagram channel (only if IG Business account is linked)
    if (page.instagram_user_id) {
      const igConfig = {
        ig_user_id:         page.instagram_user_id,
        ig_username:        page.instagram_username,
        page_id:            page.id,
        access_token:       page.access_token,
        verify_token:       verifyToken,
        user_access_token:  longLivedToken,
      };

      const { data: igExisting } = await supabaseAdmin.from('channels').select('id')
        .eq('organization_id', orgId).eq('agent_id', agentId).eq('type', 'instagram').maybeSingle();

      let igChannel;
      if (igExisting) {
        const { data } = await supabaseAdmin.from('channels')
          .update({ config: igConfig, is_active: true, connected_at: new Date().toISOString(), name: page.instagram_username || 'Instagram' })
          .eq('id', igExisting.id).select().single();
        igChannel = data;
      } else {
        const { data } = await supabaseAdmin.from('channels')
          .insert({ organization_id: orgId, agent_id: agentId, type: 'instagram', name: page.instagram_username || 'Instagram', is_active: true, connected_at: new Date().toISOString(), config: igConfig })
          .select().single();
        igChannel = data;
      }
      if (igChannel) savedChannels.push({ type: 'instagram', channel: igChannel });
    }
  }

  console.log('[Meta callback] Saved channels:', savedChannels.map(c => `${c.type}:${c.channel?.id}`));

  res.json({
    pages,
    agentId,
    savedChannels,
    verifyToken,
    noInstagram: pages.every(p => !p.instagram_user_id),
  });
});

// POST /instagram/link-from-facebook — usa el canal de FB ya conectado para vincular IG
router.post('/instagram/link-from-facebook', authMiddleware, async (req, res) => {
  const { agent_id } = req.body;
  if (!agent_id) return res.status(400).json({ error: 'agent_id requerido' });

  const { data: fbChannel } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('agent_id', agent_id)
    .eq('organization_id', req.organizationId)
    .eq('type', 'facebook')
    .eq('is_active', true)
    .maybeSingle();

  if (!fbChannel?.config?.access_token || !fbChannel?.config?.page_id) {
    return res.status(404).json({ error: 'No hay Facebook conectado para este agente.' });
  }

  const { access_token, page_id } = fbChannel.config;

  const igRes = await fetch(
    `https://graph.facebook.com/v19.0/${page_id}` +
    `?fields=instagram_business_account{id,username,name,followers_count,profile_picture_url}` +
    `&access_token=${access_token}`
  );
  const igData = await igRes.json();
  console.log('[IG link-from-FB] igData:', JSON.stringify(igData));

  if (igData.error) {
    return res.status(400).json({ error: igData.error.message, code: igData.error.code });
  }

  if (!igData.instagram_business_account?.id) {
    return res.status(400).json({
      error: 'NO_IG_LINKED',
      message: 'Tu página de Facebook no tiene una cuenta de Instagram Business vinculada.',
      steps: [
        '1. Abre Instagram → Perfil → Menú → Configuración → Cuenta → Cambiar a cuenta profesional → Empresa',
        '2. Abre Facebook → tu Página → Configuración → Instagram → Conectar cuenta',
        '3. Vuelve aquí y haz clic en Conectar Instagram nuevamente',
      ],
    });
  }

  const ig = igData.instagram_business_account;
  const verifyToken = require('crypto').randomBytes(16).toString('hex');

  const igConfig = {
    ig_user_id:          ig.id,
    ig_username:         ig.username,
    ig_name:             ig.name,
    page_id,
    access_token,
    verify_token:        verifyToken,
    profile_picture_url: ig.profile_picture_url || null,
  };

  const { data: existing } = await supabaseAdmin
    .from('channels')
    .select('id')
    .eq('organization_id', req.organizationId)
    .eq('agent_id', agent_id)
    .eq('type', 'instagram')
    .maybeSingle();

  let channel;
  if (existing) {
    const { data, error } = await supabaseAdmin.from('channels')
      .update({ config: igConfig, is_active: true, connected_at: new Date().toISOString(), name: ig.username || 'Instagram' })
      .eq('id', existing.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    channel = data;
  } else {
    const { data, error } = await supabaseAdmin.from('channels')
      .insert({ organization_id: req.organizationId, agent_id: agent_id, type: 'instagram', name: ig.username || 'Instagram', is_active: true, connected_at: new Date().toISOString(), config: igConfig })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    channel = data;
  }

  console.log(`[IG link-from-FB] Connected @${ig.username} (${ig.id}) agent=${agent_id}`);
  res.json({ success: true, channel, ig_username: ig.username, ig_id: ig.id });
});

module.exports = router;
