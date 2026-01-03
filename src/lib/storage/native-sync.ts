import { db } from './db';
import { isTauri } from '../platform';

export class NativeSyncService {
    private syncFolder: string | null = null;
    private browserHandle: FileSystemDirectoryHandle | null = null;
    private isSyncing = false;

    constructor() {
        this.loadSettings();
    }

    private async loadSettings() {
        if (isTauri()) {
            const cfg = await db.settings.get('desktop_sync_path');
            if (cfg) {
                this.syncFolder = cfg.value;
            }
        } else {
            // Browser: Load Handle
            const cfg = await db.settings.get('browser_sync_handle');
            if (cfg && cfg.value) {
                this.browserHandle = cfg.value;
                this.syncFolder = this.browserHandle?.name || 'Local Sync';
            }
        }
    }

    async getSyncPath(): Promise<string | null> {
        await this.loadSettings();
        return this.syncFolder;
    }

    async pickSyncFolder(): Promise<string | null> {
        if (isTauri()) {
            // ... Tauri Logic ...
            try {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const selected = await open({
                    directory: true,
                    multiple: false,
                    recursive: true,
                    title: 'Select Folder for Meechi Sync'
                });

                if (selected && typeof selected === 'string') {
                    this.syncFolder = selected;
                    await db.settings.put({ key: 'desktop_sync_path', value: selected });
                    return selected;
                }
            } catch (e) {
                console.error('Failed to pick folder:', e);
            }
        } else {
            // ... Browser Logic (FSA API) ...
            if ('showDirectoryPicker' in window) {
                try {
                    const handle = await (window as any).showDirectoryPicker({
                        mode: 'readwrite'
                    });
                    this.browserHandle = handle;
                    this.syncFolder = handle.name;
                    await db.settings.put({ key: 'browser_sync_handle', value: handle });
                    return handle.name;
                } catch (e) {
                    console.error('Browser pick failed:', e);
                }
            } else {
                alert('Your browser does not support Local Folder Access. Please use Chrome, Edge, or install the Desktop App.');
            }
        }
        return null;
    }

    async syncNow(callback?: (status: string) => void): Promise<void> {
        if (!this.syncFolder && !this.browserHandle) {
            throw new Error("No sync folder configured.");
        }
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            if (isTauri()) {
                await this.syncTauri(callback); 
            } else {
                await this.syncBrowser(callback);
            }
            callback?.('Sync Complete.');
        } catch (e) {
            console.error('Sync failed:', e);
            throw e;
        } finally {
            this.isSyncing = false;
        }
    }

    // --- Tauri Implementation ---
    private async syncTauri(callback?: (status: string) => void) {
        if (!this.syncFolder) return;
        const { writeTextFile, readDir, readTextFile, exists, mkdir } = await import('@tauri-apps/plugin-fs');
        const joinPath = (...parts: string[]) => parts.join('/').replace(/\/+/g, '/');

        // 1. Export DB -> Disk
        callback?.('Exporting files to disk...');
        const allFiles = await db.files.toArray();
        for (const file of allFiles) {
            if (file.deleted) continue;
            if (file.type === 'folder') {
                const dirPath = joinPath(this.syncFolder, file.path);
                if (!await exists(dirPath)) await mkdir(dirPath, { recursive: true });
                continue;
            }
            const filePath = joinPath(this.syncFolder, file.path);
            const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
            if (!await exists(parentDir)) await mkdir(parentDir, { recursive: true });

            if (typeof file.content === 'string') {
                await writeTextFile(filePath, file.content);
            }
        }

        // 2. Import Disk -> DB
        callback?.('Scanning for new files...');
        const scan = async (dir: string, virtualPrefix: string) => {
            const entries = await readDir(dir);
            for (const entry of entries) {
                const entryName = entry.name;
                const vPath = virtualPrefix ? `${virtualPrefix}/${entryName}` : entryName;
                const fullPath = joinPath(dir, entryName);

                if (entry.isDirectory) {
                    await db.files.put({
                        path: vPath, content: '', type: 'folder',
                        updatedAt: Date.now(), dirty: 0, deleted: 0
                    });
                    await scan(fullPath, vPath);
                } else if (entry.isFile) {
                    const existing = await db.files.get(vPath);
                    if (!existing) {
                        try {
                            const content = await readTextFile(fullPath);
                            await db.files.put({
                                path: vPath, content, type: 'file',
                                updatedAt: Date.now(), dirty: 0, deleted: 0
                            });
                        } catch (readErr) { /* ignore binary */ }
                    }
                }
            }
        };
        await scan(this.syncFolder, '');
    }

    // --- Browser Implementation (FSA) ---
    private async syncBrowser(callback?: (status: string) => void) {
        if (!this.browserHandle) return;

        // 1. Verify Permission
        // (IndexedDB handles need permission request on reload)
        if ((await (this.browserHandle as any).queryPermission({ mode: 'readwrite' })) !== 'granted') {
             if ((await (this.browserHandle as any).requestPermission({ mode: 'readwrite' })) !== 'granted') {
                 throw new Error("Permission denied to access folder.");
             }
        }

        // 2. Export DB -> Disk
        callback?.('Exporting to Browser Folder...');
        const allFiles = await db.files.toArray();
        for (const file of allFiles) {
            if (file.deleted) continue;
            
            // Get/Create Directory Handle recursively
            const parts = file.path.split('/');
            const filename = parts.pop(); 
            const dirParts = parts; 

            let currentDir = this.browserHandle;
            for (const part of dirParts) {
                currentDir = await currentDir.getDirectoryHandle(part, { create: true });
            }

            if (file.type === 'folder' && filename) {
                // Ensure leaf folder exists
                await currentDir.getDirectoryHandle(filename, { create: true });
            } else if (file.type === 'file' && filename && typeof file.content === 'string') {
                const fileHandle = await currentDir.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(file.content);
                await writable.close();
            }
        }

        // 3. Import Disk -> DB
        callback?.('Scanning Browser Folder...');
        const scan = async (dirHandle: FileSystemDirectoryHandle, virtualPrefix: string) => {
            for await (const [name, handle] of (dirHandle as any).entries()) {
                const vPath = virtualPrefix ? `${virtualPrefix}/${name}` : name;
                
                if (handle.kind === 'directory') {
                     await db.files.put({
                        path: vPath, content: '', type: 'folder',
                        updatedAt: Date.now(), dirty: 0, deleted: 0
                    });
                    await scan(handle as FileSystemDirectoryHandle, vPath);
                } else if (handle.kind === 'file') {
                    const existing = await db.files.get(vPath);
                    if (!existing) {
                        const file = await (handle as FileSystemFileHandle).getFile();
                        const text = await file.text(); // Assume text
                        await db.files.put({
                            path: vPath, content: text, type: 'file',
                            updatedAt: Date.now(), dirty: 0, deleted: 0
                        });
                    }
                }
            }
        };
        await scan(this.browserHandle, '');
    }
}

export const nativeSync = new NativeSyncService();
