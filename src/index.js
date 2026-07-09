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
const ALLOWED_ORIGINS = new Set([
  // Hardcoded — siempre permitidos
  'https://app.conectaachat.com',
  'https://conectaachat.com',
  'https://www.conectaachat.com',
  'https://conectachat-dashboard.vercel.app',
  // Dev
  'http://localhost:5173',
  'http://localhost:3001',
  'http://localhost:3000',
  // Adicionales vía env var (separados por coma)
  ...((process.env.FRONTEND_URL || '').split(',').map((o) => o.trim()).filter(Boolean)),
]);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      // No lanzar Error — devolver false para que cors responda 403 limpiamente
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id', 'x-api-key'],
  })
);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  // Stripe webhook requires the raw body for signature verification
  if (req.path === '/api/billing/webhook') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { req.rawBody = Buffer.concat(chunks); next(); });
    return;
  }
  express.json({ limit: '10mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// ── Input sanitization (strips HTML from all JSON bodies) ──────────────────
const { sanitizeMiddleware } = require('./middleware/security');
app.use(sanitizeMiddleware);

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

    app.use('/api/canciones',  require('./routes/musica'));
    app.use('/api/api-keys',   require('./routes/apiKeys'));
    app.use('/api/billing',    require('./routes/billing'));
    app.use('/api/landing',    require('./routes/landing'));
    app.use('/api/agency',     require('./routes/agency'));

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
