const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const PORT = process.env.PORT || 3001;
const API_TARGET = process.env.API_TARGET || 'http://localhost:5050';

const app = express();
const distPath = path.join(__dirname, 'dist');

app.disable('x-powered-by');

app.use(
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    pathFilter: '/api',
    on: {
      proxyReq(proxyReq) {
        // Same-origin browser requests go through this frontend service first,
        // so the backend doesn't need the browser Origin header here.
        proxyReq.removeHeader('origin');
      },
    },
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
  console.log(`Demo frontend on port ${PORT}, proxying /api → ${API_TARGET}`);
});
