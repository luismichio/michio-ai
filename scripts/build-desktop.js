const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const apiDir = path.join(__dirname, '../src/app/api');
const apiBackupDir = path.join(__dirname, '../src/app/_api_backup');

// Helper: Run Command
function runCommand(command, args, env = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env, ...env }
        });

        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with code ${code}`));
        });
    });
}

async function main() {
    console.log('🚀 Starting Desktop Build Process...');

    // 1. Disable ALL API Routes (Required for Static Export)
    // We rename the entire 'api' folder to '_api_backup' so Next.js ignores it.
    if (fs.existsSync(apiDir)) {
        console.log('📦 Disabling ALL API Routes for Static Build...');
        // If backup exists from failed run, try to restore or overwrite?
        if (fs.existsSync(apiBackupDir)) {
            console.warn('⚠️ Found existing backup. Assuming previous build failed. Restoring first...');
            try {
                // If apiDir also exists, this is messy.
                // Simpler: Just delete current apiDir and restore backup? No, that loses changes.
                // Assume backup is stale or we should manually check.
                // For automation, let's just move contents back if target is empty?
                // SAFETY: Just error out if backup exists.
                console.error('❌ Backup directory exists. Please check src/app/_api_backup manually.');
                process.exit(1);
            } catch (e) {}
        }
        
        fs.renameSync(apiDir, apiBackupDir);
    } else {
        console.warn('⚠️ API Folder not found. Proceeding...');
    }

    try {
        // 2. Run Next.js Build (Static Export)
        console.log('🏗️  Building Next.js (Static Export)...');
        // STATIC_EXPORT=true (triggers output: 'export' in next.config.ts)
        // NEXT_PUBLIC_IS_STATIC=true (toggles AuthProvider)
        await runCommand('yarn', ['build'], {
            STATIC_EXPORT: 'true',
            NEXT_PUBLIC_IS_STATIC: 'true'
        });
        
        // 3. Run Tauri Build (Packaging)
        console.log('📦 Packaging with Tauri...');
        // We don't need env vars here since the static files are already built
        await runCommand('yarn', ['tauri', 'build']);

        console.log('✅ Build Success!');

    } catch (err) {
        console.error('❌ Build Failed:', err);
        // We do NOT exit yet, we must restore files.
        process.exitCode = 1;

    } finally {
        // 4. Restore API Routes (Cleanup)
        if (fs.existsSync(apiBackupDir)) {
            console.log('🧹 Restoring API Routes...');
            if (fs.existsSync(apiDir)) {
                 // Should not happen unless build recreated it?
                 console.warn('⚠️ src/app/api exists unexpectedly. Removing to restore backup...');
                 fs.rmSync(apiDir, { recursive: true, force: true });
            }
            fs.renameSync(apiBackupDir, apiDir);
        }
    }
}

main();
