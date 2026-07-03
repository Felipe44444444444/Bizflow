const rateLimit = require('express-rate-limit');

// Global catch-all — 200 req / 15 min per IP
const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Chat API — 60 req / min per org (falls back to IP for unauthenticated)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.organizationId || req.ip,
  message: { error: 'Chat rate limit exceeded' },
});

// Inbound webhooks (Meta, Slack, Stripe) — 500 req / min per IP
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Webhook rate limit exceeded' },
});

// Document upload / RAG processing — 30 req / hour per org
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.organizationId || req.ip,
  message: { error: 'Document processing limit exceeded, try again in an hour' },
});

// Public forms (landing lead) — 10 submissions / hour per IP
const publicFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions, please try again later' },
});

module.exports = { standardLimiter, chatLimiter, webhookLimiter, uploadLimiter, publicFormLimiter };
