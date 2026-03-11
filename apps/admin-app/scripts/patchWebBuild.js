const fs = require('fs');
const path = require('path');

// default build directory is web-build in project root
const buildDir = path.join(__dirname, '..', 'web-build');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  });
  return fileList;
}

function patchFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // treat as text for most common extensions
  const textTypes = ['.html', '.js', '.json', '.css', '.map'];
  if (!textTypes.includes(ext)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  let updated = false;

  // replace absolute /admin/ prefix with /
  const newContent = content.replace(/\/admin\//g, '/');
  if (newContent !== content) {
    updated = true;
    content = newContent;
  }

  // replace PUBLIC_URL references if any
  const pubRegex = /PUBLIC_URL\s*[:=]\s*"?\/admin"?/g;
  if (pubRegex.test(content)) {
    updated = true;
    content = content.replace(pubRegex, (m) => m.replace('/admin', ''));
  }

  if (updated) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('patched', filePath);
  }
}

if (!fs.existsSync(buildDir)) {
  console.warn('build directory not found, skipping patch');
  process.exit(0);
}

console.log('patching web build at', buildDir);
const files = walk(buildDir);
files.forEach(patchFile);
console.log('patch complete');
