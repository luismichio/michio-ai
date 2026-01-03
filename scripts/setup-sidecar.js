const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Define targets
const targets = [
    { name: 'Windows (x64)', triple: 'x86_64-pc-windows-msvc', ext: '.exe' },
    { name: 'macOS (Apple Silicon)', triple: 'aarch64-apple-darwin', ext: '' },
    { name: 'macOS (Intel)', triple: 'x86_64-apple-darwin', ext: '' },
    // { name: 'Linux (x64)', triple: 'x86_64-unknown-linux-gnu', ext: '' }
];
const binDir = path.join(__dirname, '../src-tauri/bin');

console.log('Meechi Sidecar Setup (Multi-Platform)');
console.log('-------------------------------------');

if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
}

targets.forEach(t => {
    const filename = `ollama-${t.triple}${t.ext}`;
    const targetPath = path.join(binDir, filename);
    
    console.log(`\n[${t.name}]`);
    console.log(`Expected: src-tauri/bin/${filename}`);
    
    if (fs.existsSync(targetPath)) {
        console.log('✅ Found!');
    } else {
        console.log('❌ Missing.');
    }
});

console.log('\nINSTRUCTIONS:');
console.log('1. Rename your downloaded binaries to match the "Expected" filenames above.');
console.log('2. Place them in `src-tauri/bin/`.');
console.log('3. Run `yarn tauri build` to package.');

console.log('\nNOTE: You only NEED the binary for the platform you are currently building on.');
console.log(`For this machine (${os.platform()}), ensure the relevant binary above is found.`);
