const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT ? Number(process.env.PORT) : 19007;
const ROOT = path.join(__dirname, '..', 'web-build');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let filePath = path.join(ROOT, decodeURIComponent(parsed.pathname));
  if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
  if (!fs.existsSync(filePath)) {
    // SPA fallback to index.html
    filePath = path.join(ROOT, 'index.html');
  }
  try {
    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch (e) {
    try { console.error('Admin web serve error', { path: filePath, err: e && e.message }); } catch {}
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Admin web (static) running at http://localhost:${PORT}/`);
});
