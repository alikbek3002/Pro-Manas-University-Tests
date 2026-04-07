const express = require('express');
const cors = require('cors');

if (!process.env.RAILWAY_ENVIRONMENT) {
  require('dotenv').config();
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

const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...localOrigins, ...envOrigins]);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Student-Token'],
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
app.use('/api/tests', rateLimit({ windowMs: 60_000, max: 60 }));

app.use('/api/tests', require('./routes/testRoutes'));
app.use('/api/demo-tests', require('./routes/demoTestRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

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
