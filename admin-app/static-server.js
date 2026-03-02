const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 8085;
const buildDir = path.join(__dirname, 'web-build');

const server = http.createServer((req, res) => {
  // Normalized path
  let safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(buildDir, safePath === '/' || safePath === '\\' ? 'index.html' : safePath);

  const ext = path.extname(filePath);
  
  // If no extension, might be a route -> serve index.html
  if (!ext) {
      filePath = path.join(buildDir, 'index.html');
  }

  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon',
    '.map': 'application/json'
  };

  const contentType = mimeTypes[path.extname(filePath)] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback to index.html for client-side routing
        fs.readFile(path.join(buildDir, 'index.html'), (error, html) => {
            if (error) {
                res.writeHead(500);
                res.end('Error loading index.html');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html, 'utf-8');
            }
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, () => {
  console.log(`Static server running at http://localhost:${port}/`);
});
