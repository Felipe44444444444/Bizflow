require('dotenv').config();

// ── Global safety net — must be first ─────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

const app = express();

// ── /health — first route, zero deps, responds before anything else loads ─────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() })
);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));

// ── Body parsers ──────────────────────────────────────────────────────────────
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

// ── Bind port FIRST — Railway healthcheck passes as soon as this fires ────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);

  // Load all routes synchronously inside the callback.
  // They run before the event loop can dispatch new HTTP requests,
  // so /api/* routes will be ready for the first real request.
  try {
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

    app.use((req, res) => {
      res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
    });
    app.use((err, req, res, _next) => {
      console.error(err);
      const status = err.status || err.statusCode || 500;
      res.status(status).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      });
    });

    console.log('All routes loaded successfully');
  } catch (err) {
    console.error('[startup] Route loading failed:', err.message, err.stack);
    // Server stays up and /health keeps responding even if routes fail
  }
});

module.exports = app;
