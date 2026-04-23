require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { standardLimiter } = require('./middleware/rateLimit');

const agentsRouter        = require('./routes/agents');
const channelsRouter      = require('./routes/channels');
const conversationsRouter = require('./routes/conversations');
const messagesRouter      = require('./routes/messages');
const documentsRouter     = require('./routes/documents');
const apiKeysRouter       = require('./routes/apiKeys');
const webhooksRouter      = require('./routes/webhooks');
const billingRouter       = require('./routes/billing');

const app = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// ── Body parsers ─────────────────────────────────────────────────────────────
// Capture rawBody for routes that need HMAC signature verification
app.use((req, res, next) => {
  const needsRawBody =
    req.path === '/api/billing/webhook' ||
    req.path.startsWith('/api/webhooks/meta') ||
    req.path.startsWith('/api/webhooks/slack') ||
    req.path.startsWith('/api/webhooks/whatsapp');

  if (!needsRawBody) return express.json({ limit: '10mb' })(req, res, next);

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks);
    if (req.path === '/api/billing/webhook') return next(); // Stripe reads rawBody directly
    try { req.body = JSON.parse(req.rawBody.toString()); } catch { req.body = {}; }
    next();
  });
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Global rate limit ─────────────────────────────────────────────────────────
app.use('/api', standardLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/agents',        agentsRouter);
app.use('/api/channels',      channelsRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/messages',      messagesRouter);
app.use('/api/documents',     documentsRouter);
app.use('/api/api-keys',      apiKeysRouter);
app.use('/api/webhooks',      webhooksRouter);
app.use('/api/billing',       billingRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Conectachat backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
