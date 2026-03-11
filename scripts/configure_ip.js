const fs = require('fs');
const os = require('os');
const path = require('path');

function getLocalExternalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const ip = getLocalExternalIP();
const port = 5000;
const apiUrl = `http://${ip}:${port}`;

console.log(`Detected Local IP: ${ip}`);
console.log(`Updating API URL to: ${apiUrl}`);

const filesToUpdate = [
  'apps/student-web/src/services/api.js',
  'apps/admin-web/src/services/api.js'
];

filesToUpdate.forEach(relativePath => {
  const filePath = path.join(__dirname, relativePath);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Regex to replace the BASE_URL line
    // Matches: const BASE_URL = ...;
    const regex = /const BASE_URL = .*;/;
    const newContent = content.replace(regex, `const BASE_URL = '${apiUrl}';`);
    
    fs.writeFileSync(filePath, newContent);
    console.log(`Updated ${relativePath}`);
  } else {
    console.log(`File not found: ${relativePath}`);
  }
});

console.log('API Configuration Complete.');
