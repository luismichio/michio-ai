const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '../src/app');

function restoreRoutes(dir) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            restoreRoutes(fullPath);
        } else if (item.isFile() && item.name.endsWith('.disabled')) {
            const originalPath = fullPath.replace('.disabled', '');
            try {
                fs.renameSync(fullPath, originalPath);
                console.log(`Restored: ${path.relative(appDir, originalPath)}`);
            } catch (e) {
                console.warn(`Failed to restore ${item.name}:`, e.message);
            }
        }
    }
}

console.log('Scanning for disabled routes to restore...');
restoreRoutes(appDir);
console.log('Done.');
