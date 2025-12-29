import { useEffect, useState, useCallback } from 'react';
import { StorageProvider } from '@/lib/storage/types';
import { Session } from 'next-auth';

export function useSourceSync(storage: StorageProvider | null, session: Session | null) {
    const [isSyncingSources, setIsSyncingSources] = useState(false);
    
    const syncSources = useCallback(async () => {
        if (!storage || !session || isSyncingSources) return;

        try {
            setIsSyncingSources(true);
            
            // 1. Get Local List
            // storage.listFiles('misc') returns { path: 'misc/Topic/file.md' }
            const localFiles = await storage.listFiles('misc');
            const localMap = new Map<string, typeof localFiles[0]>();
            
            localFiles.forEach(f => {
                // Key: "Topic/filename" (strip misc/)
                const relativePath = f.path.replace('misc/', '');
                localMap.set(relativePath, f);
            });

            // 2. Get Remote List
            // Returns { name, folder, id }
            const res = await fetch('/api/sync/sources');
            if (!res.ok) throw new Error("Failed to list remote sources");
            const data = await res.json();
            const remoteFiles: {id: string, name: string, folder: string}[] = data.files || [];
            
            const remoteMap = new Map<string, typeof remoteFiles[0]>();
            remoteFiles.forEach(f => {
                // Key: "Topic/filename" or just "filename" if root
                const key = f.folder ? `${f.folder}/${f.name}` : f.name;
                remoteMap.set(key, f);
            });

            // 3. Diff & Reconcile
            
            // A. DOWNLOAD (Remote exists, Local missing)
            for (const [key, rFile] of remoteMap.entries()) {
                if (!localMap.has(key)) {
                    console.log(`[SourceSync] Downloading ${key}...`);
                    const contentRes = await fetch(`/api/sync/sources?fileId=${rFile.id}`);
                    const contentData = await contentRes.json();
                    if (contentData.content) {
                        await storage.saveFile(`misc/${key}`, contentData.content);
                    }
                }
            }

            // B. UPLOAD (Local exists, Remote missing)
            for (const [key, lFile] of localMap.entries()) {
                 if (!remoteMap.has(key)) {
                    console.log(`[SourceSync] Uploading ${key}...`);
                    const content = await storage.readFile(lFile.path);
                    
                    // Parse Topic for API
                    // key = "Topic/file.md"
                    const parts = key.split('/');
                    const name = parts.pop()!;
                    const topic = parts.join('/'); // "Fatherhood" or "Project/Shared"

                    if (content) {
                        console.log(`[SourceSync] Pushing ${name} (Topic: ${topic})`);
                        await fetch('/api/sync/sources', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ name, content, topic })
                        });
                    }
                }
            }

        } catch (err) {
            console.error("[SourceSync] Error:", err);
        } finally {
            setIsSyncingSources(false);
        }
    }, [storage, session, isSyncingSources]);

    // Auto-sync on load
    useEffect(() => {
        // Debounce initial sync
        const timer = setTimeout(() => {
            syncSources();
        }, 1000);
        return () => clearTimeout(timer);
    }, [session, storage]); // Only on session init

    return { isSyncingSources, syncSources };
}
