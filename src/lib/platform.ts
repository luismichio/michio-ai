import { type Child } from '@tauri-apps/plugin-shell';

let tauriShared: any = null;

export const isTauri = () => {
    if (typeof window === 'undefined') return false;
    // @ts-ignore
    return !!window.__TAURI_INTERNALS__;
};

export async function getTauriFetch() {
    if (!isTauri()) return fetch;
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch;
}

export async function checkLocalOllama(): Promise<boolean> {
    const fetcher = await getTauriFetch();
    try {
        // Try standard port
        const res = await fetcher('http://localhost:11434/api/tags');
        return res.ok;
    } catch (e) {
        console.warn('Ollama check failed:', e);
        return false;
    }
}

export async function startLocalOllama(): Promise<Child | null> {
    if (!isTauri()) return null;
    try {
        const { Command } = await import('@tauri-apps/plugin-shell');
        
        // 1. Try Bundled Sidecar first (User requested "Install Together")
        // Sidecar command name matches externalBin definition "bin/ollama"
        console.log('Attempting to start bundled Ollama sidecar...');
        try {
            const sidecar = Command.sidecar('bin/ollama', ['serve']);
            const child = await sidecar.spawn();
            console.log('Ollama Sidecar started:', child.pid);
            return child;
        } catch (sidecarError) {
             console.warn('Sidecar failed to start (binary missing?), trying system Ollama:', sidecarError);
        }

        // 2. Fallback to System Ollama
        const cmd = Command.create('ollama', ['serve']);
        const child = await cmd.spawn();
        console.log('System Ollama started:', child.pid);
        return child;
    } catch (e) {
        console.error('Failed to start any Ollama instance:', e);
        return null;
    }
}

export async function checkOllamaInstalled(): Promise<boolean> {
    if (!isTauri()) return false;
    try {
        const { Command } = await import('@tauri-apps/plugin-shell');
        const cmd = Command.create('ollama', ['--version']);
        const { code } = await cmd.execute();
        return code === 0;
    } catch (e) {
        console.warn('Ollama not installed/found:', e);
        return false;
    }
}
