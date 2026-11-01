#!/usr/bin/env node
/** Frontend-only fixture server. It never loads .env, backend or database code. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.env.DASHBOARD_BUILD_DIR || path.join(__dirname, '..', 'build'));
const port = 3105;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Build frontend missing. Run npm run build before dashboard E2E.');

http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (pathname.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'No backend. Every API request must be intercepted by dashboard fixtures.' }));
    return;
  }
  let file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(pathname)) {
      res.writeHead(404).end();
      return;
    }
    file = path.join(root, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Frontend fixture server: http://127.0.0.1:${port}`));
