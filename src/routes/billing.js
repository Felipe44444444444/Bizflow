const { Router } = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');
const billingService = require('../services/billingService');

const router = Router();

// Stripe webhook — must come before JSON body parser, uses raw body
router.post(
  '/webhook',
  (req, res, next) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      next();
    });
  },
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    try {
      const result = await billingService.handleWebhook(req.rawBody, signature);
      res.json(result);
    } catch (err) {
      console.error('Stripe webhook error:', err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

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

router.post('/checkout', async (req, res) => {
  const schema = z.object({
    plan: z.enum(['starter', 'pro', 'enterprise']),
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

module.exports = router;
