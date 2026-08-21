const { Router } = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');
const billingService = require('../services/billingService');
const { COSTS, estimateCostUsd } = require('../config/costs');

const { webhookLimiter } = require('../middleware/rateLimit');

const router = Router();

// ── ConnectaChat Música — rutas de monetización (no requieren organizationId) ──

// GET /api/billing/planes — lista pública de planes
router.get('/planes', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('planes').select('*').order('precio_mensual');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// GET /api/billing/status — estado de suscripción del usuario autenticado
router.get('/status', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.json({ plan: 'free', canciones_hoy: 0, limite_diario: 10 });

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return res.json({ plan: 'free', canciones_hoy: 0, limite_diario: 10 });

  const [subResult, usoResult] = await Promise.all([
    supabaseAdmin
      .from('suscripciones')
      .select('plan_id, status, current_period_end')
      .eq('user_id', user.id)
      .single(),
    supabaseAdmin
      .from('uso_diario')
      .select('canciones_vistas')
      .eq('user_id', user.id)
      .eq('fecha', new Date().toISOString().split('T')[0])
      .single(),
  ]);

  const plan = subResult.data?.plan_id || 'free';
  res.json({
    plan,
    status:        subResult.data?.status || 'active',
    canciones_hoy: usoResult.data?.canciones_vistas || 0,
    limite_diario: plan === 'pro' ? -1 : 10,
    period_end:    subResult.data?.current_period_end || null,
  });
});

// POST /api/billing/musica/checkout — crear sesión Stripe para plan Pro Música
router.post('/musica/checkout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token inválido' });

  const priceId = process.env.STRIPE_PRICE_ID_MUSICA_PRO || process.env.STRIPE_PRICE_PRO;
  if (!priceId || priceId.startsWith('price_...')) {
    return res.status(503).json({ error: 'Pagos no configurados aún. Contacta soporte.' });
  }

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.conectaachat.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/pro?success=true`,
      cancel_url:  `${frontendUrl}/precios`,
      metadata:    { user_id: user.id, source: 'musica' },
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/musica/transpose — registra un uso de transpose, aplica límite diario (free: 3/día)
// Usuarios anónimos (sin token) no se limitan: no hay user_id contra el cual llevar el conteo.
router.post('/musica/transpose', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.json({ allowed: true });

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return res.json({ allowed: true });

  const { data: sub } = await supabaseAdmin
    .from('suscripciones')
    .select('plan_id, status')
    .eq('user_id', user.id)
    .single();

  if (sub?.plan_id === 'pro' && sub.status === 'active') {
    return res.json({ allowed: true, unlimited: true });
  }

  const LIMITE = 3;
  const hoy = new Date().toISOString().split('T')[0];
  const { data: uso } = await supabaseAdmin
    .from('uso_diario')
    .select('transposiciones_hoy')
    .eq('user_id', user.id)
    .eq('fecha', hoy)
    .single();

  const usado = uso?.transposiciones_hoy || 0;
  if (usado >= LIMITE) return res.json({ allowed: false, usado, limite: LIMITE });

  await supabaseAdmin.from('uso_diario').upsert(
    { user_id: user.id, fecha: hoy, transposiciones_hoy: usado + 1 },
    { onConflict: 'user_id,fecha' }
  );

  res.json({ allowed: true, usado: usado + 1, limite: LIMITE });
});

// ── Stripe webhook — handles both Bizflow (org) and Música (user) events
router.post('/webhook', webhookLimiter, async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const rawBody   = req.rawBody;

  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).json({ error: err.message });
  }

  const obj = event.data.object;

  // Música events — identified by metadata.source = 'musica'
  if (obj.metadata?.source === 'musica') {
    if (event.type === 'checkout.session.completed') {
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from('suscripciones').upsert({
        user_id:                obj.metadata.user_id,
        plan_id:                'pro',
        stripe_customer_id:     obj.customer,
        stripe_subscription_id: obj.subscription,
        status:                 'active',
        current_period_end:     periodEnd,
      }, { onConflict: 'user_id' });
    }

    if (event.type === 'customer.subscription.deleted') {
      await supabaseAdmin.from('suscripciones')
        .update({ plan_id: 'free', status: 'cancelled' })
        .eq('stripe_subscription_id', obj.id);
    }

    if (event.type === 'invoice.payment_succeeded' && obj.subscription) {
      const periodEnd = new Date(obj.lines?.data?.[0]?.period?.end * 1000 || Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from('suscripciones')
        .update({ status: 'active', current_period_end: periodEnd })
        .eq('stripe_subscription_id', obj.subscription);
    }

    return res.json({ received: true, source: 'musica' });
  }

  // Bizflow / org events — delegate to existing service
  try {
    const result = await billingService.handleWebhook(rawBody, signature);
    res.json(result);
  } catch (err) {
    console.error('Stripe webhook error (bizflow):', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.use(authMiddleware);

router.get('/subscription', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('organization_id', req.organizationId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ error: error.message });
  }

  res.json(data || { plan: 'free', status: 'active' });
});

router.get('/usage', async (req, res) => {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data, error } = await supabaseAdmin
    .from('usage_metrics')
    .select('*')
    .eq('organization_id', req.organizationId)
    .gte('period_start', periodStart)
    .order('period_start', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ error: error.message });
  }

  res.json(data || { messages_count: 0, tokens_used: 0, conversations_count: 0, leads_count: 0 });
});

router.get('/plans', async (_req, res) => {
  const { data } = await supabaseAdmin.from('plans').select('*').order('price_mxn');
  res.json(data || []);
});

router.post('/checkout', async (req, res) => {
  const schema = z.object({
    plan: z.enum(['starter', 'pro', 'business', 'enterprise', 'credits_1000', 'credits_5000', 'credits_20000']),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await billingService.createCheckoutSession({
      organizationId: req.organizationId,
      plan: parsed.data.plan,
      userId: req.user.id,
      email: req.user.email,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/portal', async (req, res) => {
  try {
    const result = await billingService.createPortalSession(req.organizationId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/costs', async (req, res) => {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [orgResult, usageResult] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('credits_balance, credits_used, plan_credits_limit, plan')
      .eq('id', req.organizationId)
      .single(),
    supabaseAdmin
      .from('usage_metrics')
      .select('messages_count, tokens_used')
      .eq('organization_id', req.organizationId)
      .gte('period_start', periodStart)
      .order('period_start', { ascending: false })
      .limit(1)
      .single(),
  ]);

  const org    = orgResult.data  || {};
  const usage  = usageResult.data || {};
  const plan   = org.plan || 'starter';
  const planCfg = COSTS.plans[plan] || COSTS.plans.starter;

  const tokensUsed   = usage.tokens_used      ?? 0;
  const creditsUsed  = org.credits_used        ?? 0;
  const apiCostUsd   = estimateCostUsd(tokensUsed);
  const revenueUsd   = creditsUsed * (planCfg.priceUsd / planCfg.credits);
  const marginPct    = revenueUsd > 0
    ? Math.round(((revenueUsd - apiCostUsd) / revenueUsd) * 100)
    : null;

  res.json({
    period: periodStart.slice(0, 7),
    credits: {
      balance: org.credits_balance   ?? 0,
      used:    creditsUsed,
      limit:   org.plan_credits_limit ?? 1000,
    },
    api: {
      tokensUsed,
      estimatedCostUsd: parseFloat(apiCostUsd.toFixed(4)),
      costPerCredit:    creditsUsed > 0
        ? parseFloat((apiCostUsd / creditsUsed).toFixed(5))
        : 0,
    },
    billing: {
      plan,
      revenueUsd:    parseFloat(revenueUsd.toFixed(2)),
      grossMarginPct: marginPct,
    },
  });
});

module.exports = router;
