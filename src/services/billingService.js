const Stripe = require('stripe');
const { supabaseAdmin } = require('../config/supabase');
require('dotenv').config();

// Guard: Stripe constructor throws if key is missing/invalid
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function requireStripe() {
  if (!stripe) throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
}

const PLAN_PRICES = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

async function createCheckoutSession({ organizationId, plan, userId, email }) {
  requireStripe();
  if (!PLAN_PRICES[plan]) throw new Error(`Invalid plan: ${plan}`);

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', organizationId)
    .single();

  let customerId = sub?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { organization_id: organizationId, user_id: userId },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: PLAN_PRICES[plan], quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/billing`,
    subscription_data: {
      metadata: { organization_id: organizationId },
    },
  });

  return { url: session.url, sessionId: session.id };
}

async function createPortalSession(organizationId) {
  requireStripe();
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', organizationId)
    .single();

  if (!sub?.stripe_customer_id) {
    throw new Error('No Stripe customer found for this organization');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${process.env.FRONTEND_URL}/billing`,
  });

  return { url: session.url };
}

async function handleWebhook(rawBody, signature) {
  requireStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new Error(`Stripe webhook signature failed: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object);
      break;
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncSubscription(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
  }

  return { received: true };
}

async function handleCheckoutComplete(session) {
  const subscription = await stripe.subscriptions.retrieve(session.subscription);
  const orgId = subscription.metadata.organization_id;
  const plan = getPlanFromPriceId(subscription.items.data[0].price.id);

  await supabaseAdmin.from('subscriptions').upsert({
    organization_id: orgId,
    stripe_customer_id: session.customer,
    stripe_subscription_id: subscription.id,
    plan,
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  }, { onConflict: 'stripe_subscription_id' });

  await supabaseAdmin
    .from('organizations')
    .update({ plan })
    .eq('id', orgId);
}

async function syncSubscription(subscription) {
  const orgId = subscription.metadata.organization_id;
  if (!orgId) return;

  const plan =
    subscription.status === 'canceled'
      ? 'free'
      : getPlanFromPriceId(subscription.items.data[0].price.id);

  await supabaseAdmin
    .from('subscriptions')
    .update({
      plan,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
    })
    .eq('stripe_subscription_id', subscription.id);

  await supabaseAdmin
    .from('organizations')
    .update({ plan })
    .eq('id', orgId);
}

async function handlePaymentFailed(invoice) {
  if (!invoice.subscription) return;
  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', invoice.subscription);
}

function getPlanFromPriceId(priceId) {
  const map = Object.entries(PLAN_PRICES).find(([, id]) => id === priceId);
  return map ? map[0] : 'free';
}

module.exports = { createCheckoutSession, createPortalSession, handleWebhook };
