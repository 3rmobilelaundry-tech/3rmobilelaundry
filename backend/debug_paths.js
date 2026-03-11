const path = require('path');
const fs = require('fs');

console.log('__dirname:', __dirname);
console.log('CWD:', process.cwd());

const adminIndex = path.join(__dirname, '..', 'admin-app', 'web-build', 'index.html');
console.log('Calculated adminIndex path:', adminIndex);
console.log('Exists?', fs.existsSync(adminIndex));

const userIndex = path.join(__dirname, '..', 'user-app', 'web-build', 'index.html');
console.log('Calculated userIndex path:', userIndex);
console.log('Exists?', fs.existsSync(userIndex));
