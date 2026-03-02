const express = require('express');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 19007;
const ROOT = path.join(__dirname, '..', '..', 'admin-app', 'web-build');
const MOUNT = '/admin-web';

const app = express();

app.use(MOUNT, express.static(ROOT));

app.get(`${MOUNT}/*`, (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Admin web (express static) running at http://localhost:${PORT}${MOUNT}/`);
});
