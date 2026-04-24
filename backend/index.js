const express = require('express');
const cors = require('cors');

if (!process.env.RAILWAY_ENVIRONMENT) {
  require('dotenv').config();
}

function stripWrappingQuotes(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

const app = express();
const port = process.env.PORT || 5050;

const localOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:3001',
];

// Production origins enabled by default so deploys don't silently break
// when CORS_ORIGIN isn't set in Railway. Add additional origins via the env var.
const productionOrigins = [
  'https://proabiturient.com',
  'https://www.proabiturient.com',
  'https://admin.proabiturient.com',
  'https://demo.proabiturient.com',
];

const envOrigins = stripWrappingQuotes(process.env.CORS_ORIGIN)
  .split(',')
  .map((o) => stripWrappingQuotes(o))
  .filter(Boolean);

const allowedOrigins = new Set([...localOrigins, ...productionOrigins, ...envOrigins]);

// Preview/deploy domains we consider safe without listing every subdomain
const allowedOriginPatterns = [
  /^https:\/\/[a-z0-9-]+\.proabiturient\.com$/i,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/[a-z0-9-]+\.pages\.dev$/i,
  /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/i,
];

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  return allowedOriginPatterns.some((pattern) => pattern.test(origin));
}

app.use(
  cors({
    origin(origin, cb) {
      if (isOriginAllowed(origin)) return cb(null, true);
      console.warn(`CORS blocked origin: ${origin}`);
      // Do NOT throw — returning false lets the browser see a normal preflight
      // response without ACAO, producing a cleaner CORS error than a 500.
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Student-Token'],
    optionsSuccessStatus: 204,
  }),
);

app.use(express.json());

// ── Lightweight in-memory rate limiter (no npm dependency) ──
const rateLimitBuckets = new Map();

function rateLimit({ windowMs = 60_000, max = 60, keyFn } = {}) {
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : (req.ip || req.socket.remoteAddress || 'unknown');
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests, please try again later' });
    }

    return next();
  };
}

// Prune stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, 5 * 60_000).unref();

// Apply rate limits per route group
app.use('/api/tests/login', rateLimit({ windowMs: 60_000, max: 10 }));
app.use('/api/tests/generate', rateLimit({ windowMs: 60_000, max: 5 }));
const proxyVideoRateLimit = rateLimit({
  windowMs: 60_000,
  max: 6_000,
  keyFn: (req) => `${req.ip || req.socket.remoteAddress || 'unknown'}:video-proxy`,
});
const testsRateLimit = rateLimit({ windowMs: 60_000, max: 60 });

app.use('/api/tests/videos/proxy', proxyVideoRateLimit);
app.use('/api/tests', (req, res, next) => {
  if (req.path.startsWith('/videos/proxy/')) {
    return next();
  }
  return testsRateLimit(req, res, next);
});

app.use('/api/tests', require('./routes/testRoutes'));
app.use('/api/demo-tests', require('./routes/demoTestRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

app.get('/', (_req, res) => {
  res.json({
    service: 'promanas-backend',
    status: 'ok',
    docs: '/api/ping',
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/ping', (_req, res) => res.json({ message: 'pong' }));

app.listen(port, '0.0.0.0', async () => {
  console.log(`Backend is running on port ${port}`);
  const { runMigrations } = require('./lib/migrate');
  const { ensureVideoCatalogSchema, isVideoDbConfigured } = require('./lib/videoCatalog');
  await runMigrations().catch((err) => console.error('Migration check failed:', err));
  if (isVideoDbConfigured()) {
    await ensureVideoCatalogSchema().catch((err) => console.error('Video catalog schema check failed:', err));
  }
});
