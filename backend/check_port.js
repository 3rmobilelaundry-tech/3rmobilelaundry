const http = require('http');
const req = http.request({ port: 5000, method: 'GET', path: '/' }, res => {
  console.log('Port 5000 status:', res.statusCode);
});
req.on('error', e => console.log('Port 5000 error:', e.message));
req.end();
