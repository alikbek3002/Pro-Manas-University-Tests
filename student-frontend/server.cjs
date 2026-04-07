const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const PORT = process.env.PORT || 3000;

function stripWrappingQuotes(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function normalizeApiTarget(rawTarget) {
  let target = stripWrappingQuotes(rawTarget);
  if (!target) return '';

  target = target.replace(/\/+$/, '');
  if (target.endsWith('/api')) {
    target = target.slice(0, -4);
  }

  return target;
}

const API_TARGET =
  normalizeApiTarget(process.env.API_TARGET) ||
  normalizeApiTarget(process.env.VITE_API_URL) ||
  'http://localhost:5050';

const app = express();
const distPath = path.join(__dirname, 'dist');

app.disable('x-powered-by');

app.use(
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    pathFilter: '/api',
  }),
);

app.use(express.static(distPath, {
  etag: true,
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }

    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Student frontend on port ${PORT}, proxying /api → ${API_TARGET}`);
});
