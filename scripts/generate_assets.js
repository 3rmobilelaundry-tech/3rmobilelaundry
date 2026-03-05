const fs = require('fs');
const path = require('path');

// A simple 1x1 pixel transparent PNG base64
const dummyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

const dirs = [
  'apps/student-web/assets',
  'apps/admin-web/assets'
];

const files = [
  'icon.png',
  'splash.png',
  'adaptive-icon.png',
  'favicon.png'
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  files.forEach(file => {
    const filePath = path.join(__dirname, dir, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, dummyPng);
      console.log(`Created: ${filePath}`);
    }
  });
});

console.log('Dummy assets created successfully.');
