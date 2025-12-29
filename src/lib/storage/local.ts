import { StorageProvider, FileMeta } from './types';
import { db } from './db';
import { migrateFromIdbToDexie } from './migrate';

export class LocalStorageProvider implements StorageProvider {
    
    async init() {
        // Run migration logic once on init
        await migrateFromIdbToDexie();
    }

    async listFiles(prefix: string): Promise<FileMeta[]> {
        // Dexie 'startsWith' query
        // "misc" -> "misc/"
        // BUT: our paths are 'misc/foo.txt'.
        // If prefix is '', get all.
        
        let collection;
        if (!prefix || prefix === 'root') {
             collection = db.files.toCollection();
        } else {
             // We want all files that START with "{prefix}/" OR equal "{prefix}" (if it's a file)
             // Actually, the File Explorer passes 'misc'.
             // We want 'misc/foo', 'misc/bar'.
             // We want 'misc/foo', 'misc/bar'.
             collection = db.files.where('path').startsWith(prefix);
        }

        const records = await collection.filter(f => !f.deleted).toArray();
        
        return records.map(r => ({
            id: r.path,
            name: r.path.split('/').pop() || r.path,
            path: r.path,
            updatedAt: r.updatedAt,
            type: r.type,
            remoteId: r.remoteId
        }));
    }

    async getFile(virtualPath: string): Promise<FileMeta | null> {
        const item = await db.files.get(virtualPath);
        if (!item || item.deleted) return null;
        
        return {
            id: item.path,
            name: item.path.split('/').pop() || item.path,
            path: item.path,
            type: item.type,
            updatedAt: item.updatedAt,
            remoteId: item.remoteId
        };
    }

    async readFile(virtualPath: string): Promise<string | null> {
        const item = await db.files.get(virtualPath);
        return item ? item.content : null;
    }

    async saveFile(virtualPath: string, content: string, remoteId?: string): Promise<void> {
        await this.ensureParent(virtualPath);

        await db.transaction('rw', db.files, async () => {
            const existing = await db.files.get(virtualPath);
            
            await db.files.put({
                path: virtualPath,
                content,
                updatedAt: Date.now(),
                type: 'file', // Defaulting to file for now
                remoteId: remoteId || existing?.remoteId,
                dirty: 1,
                deleted: 0
            });
        });
    }

    async appendFile(virtualPath: string, content: string): Promise<void> {
        await this.ensureParent(virtualPath);

        await db.transaction('rw', db.files, async () => {
             const existing = await db.files.get(virtualPath);
             const newContent = existing ? (existing.content + '\n\n' + content) : content;
             
             await db.files.put({
                path: virtualPath,
                content: newContent,
                updatedAt: Date.now(),
                type: 'file',
                remoteId: existing?.remoteId,
                dirty: 1,
                deleted: 0
            });
        });
    }

    async renameFile(oldPath: string, newPath: string): Promise<void> {
        await this.ensureParent(newPath);

        await db.transaction('rw', db.files, async () => {
            const existing = await db.files.get(oldPath);
            if (!existing) throw new Error(`File not found: ${oldPath}`);

            // 1. Rename the item itself
            await db.files.add({
                ...existing,
                path: newPath,
                updatedAt: Date.now(),
                dirty: 1,
                deleted: 0
            });
            await db.files.delete(oldPath);

            // 2. If it's a folder, rename all children recursively
            if (existing.type === 'folder') {
                const prefix = oldPath + '/';
                const children = await db.files.where('path').startsWith(prefix).toArray();
                
                for (const child of children) {
                    const childNewPath = child.path.replace(prefix, newPath + '/');
                    
                    // Create new child record
                    await db.files.add({
                        ...child,
                        path: childNewPath,
                        updatedAt: Date.now(),
                        dirty: 1, // Mark dirty so sync engine moves them on remote
                        deleted: 0
                    });
                    
                    // Delete old child record
                    await db.files.delete(child.path);
                }
            }
        });
    }

    async deleteFile(virtualPath: string): Promise<void> {
        // Soft delete for sync
        await db.transaction('rw', db.files, async () => {
            const existing = await db.files.get(virtualPath);
            if (!existing) return;

            // 1. Delete the item itself
            await db.files.update(virtualPath, { deleted: 1, dirty: 1 });

            // 2. If it's a folder, soft-delete all children recursively
            if (existing.type === 'folder') {
                const prefix = virtualPath + '/';
                const children = await db.files.where('path').startsWith(prefix).toArray();
                
                for (const child of children) {
                    await db.files.update(child.path, { deleted: 1, dirty: 1 });
                }
            }
        });
    }

    async createFolder(virtualPath: string): Promise<void> {
        await this.ensureParent(virtualPath);
        
        await db.transaction('rw', db.files, async () => {
             const existing = await db.files.get(virtualPath);
             // Always update timestamp and dirty
             await db.files.put({
                 path: virtualPath,
                 content: '',
                 updatedAt: Date.now(),
                 type: 'folder',
                 remoteId: existing?.remoteId,
                 dirty: 1, // Crucial for sync
                 deleted: 0
             });
        });
    }

    private async ensureParent(path: string) {
        const parts = path.split('/');
        if (parts.length <= 1) return;

        // Try to find parent
        const parentPath = parts.slice(0, -1).join('/');
        
        // Optimize: check if exists first
        const parent = await db.files.get(parentPath);
        if (parent && !parent.deleted) return;

        // Check recursively (grandparent)
        await this.ensureParent(parentPath);

        // Create Parent Folder
        await db.files.put({
            path: parentPath,
            content: '',
            updatedAt: Date.now(),
            type: 'folder',
            dirty: 1,
            deleted: 0
        });
    }

    async resetSyncState() {
        console.log("Reseting sync state...");
        // 1. Clear Settings
        await db.settings.delete('drive_sync_token');
        await db.settings.delete('drive_root_id');
        await db.settings.delete('drive_root_id_writable');

        // 2. Clear Remote IDs & Mark Dirty
        await db.transaction('rw', db.files, async () => {
             const all = await db.files.toArray();
             for (const file of all) {
                 await db.files.update(file.path, { 
                     remoteId: undefined, 
                     dirty: 1 
                 });
             }
        });
        console.log("Sync state reset. All files marked dirty.");
    }

    async factoryReset() {
        console.warn("PERFORMING FACTORY RESET...");
        await db.transaction('rw', db.files, db.settings, async () => {
            await db.files.clear();
            await db.settings.clear();
        });
        
        // Re-init default folders
        await this.ensureFolder('misc');
        await this.ensureFolder('history');
        
        console.log("Factory Reset Complete.");
    }

    private async ensureFolder(path: string) {
        await db.files.put({
            path,
            content: '',
            updatedAt: Date.now(),
            type: 'folder',
            dirty: 1,
            deleted: 0
        });
    }

    async getKnowledgeContext(): Promise<string> {
        // Get all files in misc/
        const files = await db.files.where('path').startsWith('misc/').toArray();
        const readableFiles = files.filter(f => !f.deleted && f.type === 'file');
        
        let ctx = "--- Knowledge Base (Misc Folder) ---\n";
        if (readableFiles.length === 0) return ctx + "No files found in Knowledge Base.\n";

        let totalLength = 0;
        const CHAR_LIMIT = 50000; // Total context limit (approx 12k tokens)

        for (const file of readableFiles) {
            if (totalLength > CHAR_LIMIT) {
                ctx += `\n[System] Context limit reached. Some files omitted.\n`;
                break;
            }

            // Include text-based files and PDFs
            const isText = file.path.endsWith('.md') || file.path.endsWith('.txt');
            const isPdf = file.path.endsWith('.pdf');
            
            if (isText || isPdf) {
                // Truncate individual massive files (e.g. books) to 20k chars (approx 5k tokens)
                const content = file.content.length > 20000 
                    ? file.content.substring(0, 20000) + "\n...[Content Truncated]..." 
                    : file.content;
                
                ctx += `\nFile: ${file.path}\nContent:\n${content}\n---\n`;
                totalLength += content.length;
            } else {
                ctx += `\nFile: ${file.path} (Non-text file, content unavailable)\n---\n`;
            }
        }
        return ctx;
        return ctx;
    }
}
