const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appDir = path.join(__dirname, '../src/app');
let disabledFiles = [];

function findAndDisableRoutes(dir) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            findAndDisableRoutes(fullPath);
        } else if (item.isFile() && item.name === 'route.ts') {
            const disabledPath = fullPath + '.disabled';
            try {
                fs.renameSync(fullPath, disabledPath);
                disabledFiles.push({ original: fullPath, disabled: disabledPath });
                console.log(`Disabled: ${path.relative(appDir, fullPath)}`);
            } catch (e) {
                console.warn(`Failed to disable ${item.name}:`, e.message);
            }
        }
    }
}

function restoreRoutes() {
    console.log('Restoring API routes...');
    for (const { original, disabled } of disabledFiles) {
        if (fs.existsSync(disabled)) {
            try {
                fs.renameSync(disabled, original);
            } catch (e) {
                console.error(`Failed to restore ${path.relative(appDir, original)}:`, e.message);
            }
        }
    }
}

try {
    console.log('Cleaning .next directory...');
    if (fs.existsSync(path.join(__dirname, '../.next'))) {
        fs.rmSync(path.join(__dirname, '../.next'), { recursive: true, force: true });
    }

    console.log('Scanning for API routes to disable...');
    findAndDisableRoutes(appDir);

    console.log('Running Desktop Build with STATIC_EXPORT=true...');
    // Pass env var to the child process
    execSync('yarn next build', {  
        stdio: 'inherit',
        env: { ...process.env, STATIC_EXPORT: 'true' }
    });

    console.log('Build Success!');
} catch (error) {
    console.error('Build Failed:', error);
    process.exit(1);
} finally {
    restoreRoutes();
}
