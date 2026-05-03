const { Router } = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');
const billingService = require('../services/billingService');
const { COSTS, estimateCostUsd } = require('../config/costs');

const router = Router();

// Stripe webhook — raw body is already set by the global body-parser middleware in index.js
router.post('/webhook', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  try {
    const result = await billingService.handleWebhook(req.rawBody, signature);
    res.json(result);
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
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
