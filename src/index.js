require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const app = express();

// ── Health check — registered first, no middleware, no DB ─────────────────────
app.get('/health', (_, res) =>
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() })
);

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
    if (req.path === '/api/billing/webhook') return next();
    try { req.body = JSON.parse(req.rawBody.toString()); } catch { req.body = {}; }
    next();
  });
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Routes (loaded lazily so startup errors don't kill health check) ──────────
const { standardLimiter } = require('./middleware/rateLimit');
app.use('/api', standardLimiter);

app.use('/api/agents',        require('./routes/agents'));
app.use('/api/channels',      require('./routes/channels'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/messages',      require('./routes/messages'));
app.use('/api/documents',     require('./routes/documents'));
app.use('/api/api-keys',      require('./routes/apiKeys'));
app.use('/api/webhooks',      require('./routes/webhooks'));
app.use('/api/billing',       require('./routes/billing'));

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

// ── Start — bind to 0.0.0.0 so Railway's proxy can reach the container ───────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Conectachat backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
