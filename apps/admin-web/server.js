const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 5200;
const root = __dirname;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
  // redirect root to welcome for initial landing
  const incoming = req.url === '/' ? '/welcome' : req.url;
  const urlPath = incoming === '/welcome' ? '/index.html' : incoming;
  const filePath = path.join(root, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // fallback to index.html for client-side routing
      fs.readFile(path.join(root, 'index.html'), (err2, data2) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        } else {
          res.writeHead(200, { 'Content-Type': mime['.html'] });
          res.end(data2);
        }
      });
    } else {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
});
server.listen(PORT, () => {
  console.log(`Head Admin web running on http://localhost:${PORT}/`);
});
