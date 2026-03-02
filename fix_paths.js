const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, 'admin-app', 'web-build');
const indexHtml = path.join(buildDir, 'index.html');
const manifest = path.join(buildDir, 'asset-manifest.json');

function fixFile(filePath) {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        // Replace backslashes with forward slashes
        let fixed = content.replace(/\\/g, '/');
        
        if (content !== fixed) {
            fs.writeFileSync(filePath, fixed, 'utf8');
            console.log(`Fixed backslashes in ${filePath}`);
        } else {
            console.log(`No changes needed for ${filePath}`);
        }
    } else {
        console.log(`File not found: ${filePath}`);
    }
}

fixFile(indexHtml);
fixFile(manifest);
