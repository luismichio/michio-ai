'use client';
import React, { useState, useEffect, useRef } from 'react';
import { StorageProvider, FileMeta } from '@/lib/storage/types';
import styles from '../page.module.css';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, FileRecord } from '@/lib/storage/db';
import { extractTextFromPdf } from '@/lib/pdf';

interface FileExplorerProps {
    storage: StorageProvider;
    onClose: () => void;
    syncLogs?: string[];
}

export default function FileExplorer(props: FileExplorerProps) {
    const { storage, onClose } = props;
    const [currentPath, setCurrentPath] = useState('misc');
    
    // Actions State
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkMode, setIsBulkMode] = useState(false);
    const lastInteractionIndex = useRef<number>(-1);

    // Initial Migration Trigger
    useEffect(() => {
        storage.init().catch(err => console.error("Migration failed", err));
    }, [storage]);

    // REACTIVE DATA FETCHING (Dexie Magic 🪄)
    const items = useLiveQuery(async () => {
        // Dynamic Query based on path
        // optimization: if path is "root", show top level folders?
        // Our structure implies everything starts with "misc/" or "history/".
        // Let's query EVERYTHING for now to ensure folders appear?
        // No, querying everything (startsWith("")) is better for discovery if we don't strictly enforce 'misc' root.
        
        let collection;
        const isRoot = currentPath === 'root';
        const queryPath = isRoot ? '' : currentPath;
        
        // simple prefix query
        const allFiles = await db.files.where('path').startsWith(queryPath).toArray();
        
        const folders = new Set<string>();
        const currentLevelFiles: FileMeta[] = [];

        allFiles.filter(f => !f.deleted).forEach(f => {
            // Filter: Must start with currentPath + '/'
            // Special case: if isRoot, just look for top level dirs?
            
            let relative = "";
            if (isRoot) {
                 relative = f.path;
            } else {
                 if (!f.path.startsWith(currentPath + '/')) return;
                 relative = f.path.substring(currentPath.length + 1);
            }

            if (relative.includes('/')) {
                folders.add(relative.split('/')[0]);
            } else {
                // It's a file right here
                currentLevelFiles.push({
                    id: f.path,
                    name: f.path.split('/').pop() || f.path,
                    path: f.path,
                    updatedAt: f.updatedAt,
                    type: f.type,
                    remoteId: f.remoteId
                });
            }
        });

        const folderItems: FileMeta[] = Array.from(folders)
            .filter(name => !currentLevelFiles.some(f => f.name === name && f.type === 'folder'))
            .map(name => ({
                id: isRoot ? name : `${currentPath}/${name}`,
                name: name,
                path: isRoot ? name : `${currentPath}/${name}`,
                updatedAt: Date.now(),
                type: 'folder'
            }));

        return [...folderItems, ...currentLevelFiles].sort((a, b) => {
             if (a.type === b.type) return a.name.localeCompare(b.name);
             return a.type === 'folder' ? -1 : 1;
        });

    }, [currentPath]) || [];

    // Loading deleted (Dexie handles it)
    
    // ... existing handlers ...
    // Note: We no longer need to call loadFiles() manually after actions!
    // saveFile -> DB Update -> useLiveQuery triggers -> UI Updates automatically.
    
    const handleNavigate = (folderName: string) => {
        setCurrentPath(`${currentPath}/${folderName}`);
    };

    const handleBack = () => {
        if (currentPath === 'misc') return;
        const parts = currentPath.split('/');
        parts.pop();
        setCurrentPath(parts.join('/'));
    };

    const handleCreateFolder = async () => {
        const name = prompt("Folder Name:");
        if (!name) return;
        
        // Explicitly create folder record for sync
        const path = `${currentPath}/${name}`;
        await storage.createFolder(path);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const path = `${currentPath}/${file.name}`;
        
        let content = "";
        if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
             content = await file.text();
        } else if (file.type === 'application/pdf') {
             try {
                const buffer = await file.arrayBuffer();
                content = await extractTextFromPdf(buffer);
             } catch (err) {
                alert("Failed to extract text from PDF");
                return;
             }
        } else {
             alert("Only text/md/pdf files supported currently!");
             return;
        }

        await storage.saveFile(path, content);
        // loadFiles(); // Removed: Reactive
    };

    // Bulk Delete
    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Delete ${selectedIds.size} items?`)) return;
        
        // Use db transaction for bulk delete?
        // For now, loop.
        for (const id of Array.from(selectedIds)) {
             const item = items.find(i => i.id === id);
             if (item) await performDelete(item);
        }
        setSelectedIds(new Set()); // Clear selection
    };

    const handleDelete = async (file: FileMeta) => {
        if (!confirm(`Delete ${file.name}?`)) return;
        await performDelete(file);
    };

    const performDelete = async (file: FileMeta) => {
        if (file.type === 'folder') {
            const all = await storage.listFiles(file.path);
            for (const f of all) {
                await storage.deleteFile(f.path);
            }
        } else {
            await storage.deleteFile(file.path);
        }
    };

    const handleRename = async (file: FileMeta) => {
        const newName = prompt("New Name:", file.name);
        if (!newName || newName === file.name) return;
        
        const oldPath = file.path;
        const parts = oldPath.split('/');
        parts.pop();
        const newPath = `${parts.join('/')}/${newName}`;
        
        try {
            await storage.renameFile(oldPath, newPath);
        } catch (e: any) {
             alert(e.message);
        }
    };

    const handleSelectionClick = (item: FileMeta, index: number, event: React.MouseEvent) => {
        event.stopPropagation();
        
        const newSelected = new Set(selectedIds);
        
        if (event.shiftKey && lastInteractionIndex.current !== -1) {
            // Range Select
            const start = Math.min(lastInteractionIndex.current, index);
            const end = Math.max(lastInteractionIndex.current, index);
            
            for (let i = start; i <= end; i++) {
                newSelected.add(items[i].id);
            }
        } else if (event.ctrlKey || event.metaKey) {
            // Toggle
            if (newSelected.has(item.id)) newSelected.delete(item.id);
            else newSelected.add(item.id);
            lastInteractionIndex.current = index;
        } else {
            // Single Select (clears others) - Standard Logic
            // If user just clicks a checkbox, they usually expect "Add to selection" or "Toggle"
            // But if they click the *row*, they expect "Select Only This".
            // Since this is triggered by the checkbox click (mostly), let's keep it as Toggle logic if strictly checking box?
            // Actually, Windows Explorer: Checkbox click = Toggle. Row Click = Select Only This.
            // Let's assume this handles the Checkbox Click for now.
            
            if (newSelected.has(item.id)) newSelected.delete(item.id);
            else newSelected.add(item.id);
            lastInteractionIndex.current = index;
        }

        setSelectedIds(newSelected);
    };

    const handleRowClick = (item: FileMeta, index: number, event: React.MouseEvent) => {
         // Desktop Standard: Row Click = Select Only This (unless Cmd/Ctrl/Shift)
         const newSelected = new Set(selectedIds);
         
         if (event.shiftKey && lastInteractionIndex.current !== -1) {
            const start = Math.min(lastInteractionIndex.current, index);
            const end = Math.max(lastInteractionIndex.current, index);
            // Clear prior if Shift click? Usually Shift+Click keeps others? 
            // Standard: Shift+Click extends selection from anchor.
            // Simplified: Add range.
            for (let i = start; i <= end; i++) {
                newSelected.add(items[i].id);
            }
         } else if (event.ctrlKey || event.metaKey) {
             if (newSelected.has(item.id)) newSelected.delete(item.id);
             else newSelected.add(item.id);
             lastInteractionIndex.current = index;
         } else {
             // Single Click -> Select ONLY this
             newSelected.clear();
             newSelected.add(item.id);
             lastInteractionIndex.current = index;
         }
         setSelectedIds(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === items.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(items.map(i => i.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    // DRAG AND DROP
    const handleDragStart = (e: React.DragEvent, item: FileMeta) => {
        // ... (lines 258-268)
        // If the item is in current selection, drag ALL selected
        // Else just drag this one
        let dragIds = [item.id];
        if (selectedIds.has(item.id)) {
            dragIds = Array.from(selectedIds);
        }
        
        e.dataTransfer.setData('application/json', JSON.stringify(dragIds));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Allow drop
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetFolder: FileMeta) => {
        e.preventDefault();
        e.stopPropagation();

        if (targetFolder.type !== 'folder') return;
        
        const raw = e.dataTransfer.getData('application/json');
        if (!raw) return;
        const ids = JSON.parse(raw) as string[];

        // Filter out if trying to drop into self
        if (ids.includes(targetFolder.id)) return;

        // Move Logic
        for (const id of ids) {
            const item = items.find(i => i.id === id);
            if (!item) continue;
            
            // Folder Move or File Move?
            // Simplified: We assume flat structure support for now in `renameFile`
            // Old Path: misc/A.txt
            // New Path: misc/Folder/A.txt
            
            const newPath = `${targetFolder.path}/${item.name}`;
            try {
                // If it's a folder, we need recursive move?
                // IndexedDB 'folder' is virtual.
                // We actually need to find ALL files starting with item.path and replace prefix.
                // Does storage.renameFile support directory rename?
                // Our implementation in local.ts handles Single File rename.
                // We need to upgrade performMove to handle folders.
                await performMove(item, newPath);

            } catch(err) {
                console.error("Move failed", err);
            }
        }
        // loadFiles(); // Removed: Reactive
    };

    const performMove = async (item: FileMeta, newPath: string) => {
         if (item.type === 'file') {
             await storage.renameFile(item.path, newPath);
         } else {
             // Folder Move: Rename prefix for all children
             // Get all files with prefix `item.path/`
             // e.g. misc/OldFolder/... -> misc/NewFolder/...
             const allChilds = await storage.listFiles(item.path); // uses startsWith
             
             // Target Folder Path is derived from newPath (which includes the folder name)
             // item.path = misc/OldFolder
             // newPath = misc/Target/OldFolder
             
             for (const child of allChilds) {
                 const relative = child.path.substring(item.path.length); // /file.txt
                 const childNewPath = `${newPath}${relative}`;
                 await storage.renameFile(child.path, childNewPath);
             }
             
             // If local.ts implementation of renameFile handles copy+delete, this works.
         }
    };


    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    // ... existing handlers ...

    // Close menu when clicking elsewhere
    useEffect(() => {
        const handleClickOutside = () => setActiveMenuId(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ width: '80%', maxWidth: 800, height: '80vh', display: 'flex', flexDirection: 'column' }}>
                
                {/* Header ... (unchanged) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Files</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </div>

                {/* Toolbar ... (unchanged) */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #eee' }}>
                    <button onClick={handleBack} disabled={currentPath === 'misc'} style={{ cursor: 'pointer', visibility: currentPath === 'misc' ? 'hidden' : 'visible' }}>
                        ⬅ Back
                    </button>
                    
                    <button onClick={() => {
                        setIsBulkMode(!isBulkMode);
                        if (isBulkMode) setSelectedIds(new Set()); 
                    }} style={{ cursor: 'pointer', background: isBulkMode ? '#e6f7ff' : 'transparent', border: '1px solid #ccc', borderRadius: 4, padding: '2px 8px' }}>
                        {isBulkMode ? 'Done' : 'Select'}
                    </button>

                    {isBulkMode && (
                        <button onClick={handleSelectAll} style={{ cursor: 'pointer' }}>
                            {selectedIds.size === items.length && items.length > 0 ? 'Deselect All' : 'Select All'}
                        </button>
                    )}

                    {isBulkMode && selectedIds.size > 0 && (
                        <button onClick={handleBulkDelete} style={{ color: 'red', cursor: 'pointer' }}>
                            Delete Selected ({selectedIds.size})
                        </button>
                    )}

                    <div style={{ flex: 1 }} />
                    <button onClick={async () => {
                        if (confirm("Reset connection to Google Drive? This will re-upload all files to 'Michio Journal'.")) {
                            await storage.resetSyncState();
                            alert("Sync Reset. Please Sign Out and Sign In again to refresh permissions.");
                        }
                    }} style={{ cursor: 'pointer', marginRight: '1rem', color: '#ff4444', border: '1px solid #ff4444', background: 'transparent', borderRadius: 4, padding: '2px 8px' }}>
                        Reset Cloud
                    </button>
                    <button onClick={handleCreateFolder} style={{ cursor: 'pointer' }}>
                        New Folder
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} style={{ cursor: 'pointer' }}>
                        Upload Logic
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleUpload} style={{ display: 'none' }} />
                </div>

                {/* Breadcrumb ... (unchanged) */}
                <div style={{ padding: '0.5rem', background: '#f5f5f5', borderRadius: 4, marginBottom: '1rem', fontSize: '0.9rem', color: '#666', display: 'flex', gap: '0.5rem' }}>
                     {currentPath.split('/').map((part, index, arr) => {
                         // ... breadcrumb logic ...
                         const pathSoFar = arr.slice(0, index + 1).join('/');
                         const isLast = index === arr.length - 1;
                         const targetFolder: FileMeta = { id: pathSoFar, name: part, path: pathSoFar, updatedAt: Date.now(), type: 'folder' };

                         return (
                            <React.Fragment key={pathSoFar}>
                                <span 
                                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                    onDrop={(e) => handleDrop(e, targetFolder)}
                                    onClick={() => !isLast && setCurrentPath(pathSoFar)}
                                    style={{ 
                                        cursor: isLast ? 'default' : 'pointer', 
                                        fontWeight: isLast ? 600 : 400,
                                        textDecoration: isLast ? 'none' : 'underline'
                                    }}
                                >
                                    {part === 'misc' ? 'Home' : part}
                                </span>
                                {!isLast && <span>&gt;</span>}
                            </React.Fragment>
                         );
                     })}
                </div>

                {/* File Grid */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {items.length === 0 && <div style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Empty Folder</div>}
                    
                    {items.map((item, index) => (
                        <div key={item.id} 
                            className={`${styles.fileRow} ${selectedIds.has(item.id) ? styles.selected : ''}`}
                            draggable={true}
                            onDragStart={(e) => handleDragStart(e, item)}
                            onDragOver={(e) => item.type === 'folder' ? handleDragOver(e) : undefined}
                            onDrop={(e) => item.type === 'folder' ? handleDrop(e, item) : undefined}
                            onClick={(e) => handleRowClick(item, index, e)}
                            onDoubleClick={() => item.type === 'folder' && handleNavigate(item.name)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                                {isBulkMode && (
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.has(item.id)} 
                                        readOnly 
                                        onClick={(e) => handleSelectionClick(item, index, e)}
                                    />
                                )}
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                                    <span style={{ fontSize: '1.5rem' }}>{item.type === 'folder' ? '📁' : '📄'}</span>
                                    <span style={{ fontWeight: item.type === 'folder' ? 600 : 400 }}>{item.name}</span>
                                </div>
                            </div>

                            <div style={{ position: 'relative' }}>
                                <button 
                                    className={`${styles.kebabButton} ${activeMenuId === item.id ? styles.active : ''}`}
                                    onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === item.id ? null : item.id); }}
                                >
                                    ⋮
                                </button>
                                
                                {activeMenuId === item.id && (
                                    <div className={styles.dropdownMenu} onClick={e => e.stopPropagation()}>
                                        <button className={styles.dropdownItem} onClick={() => { setActiveMenuId(null); handleRename(item); }}>
                                            Rename
                                        </button>
                                        <button className={`${styles.dropdownItem} ${styles.delete}`} onClick={() => { setActiveMenuId(null); handleDelete(item); }}>
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Sync Log Panel */}
                <div style={{ marginTop: 'auto', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                           <h4 style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>Live Sync Log</h4>
                           <button 
                               onClick={() => navigator.clipboard.writeText((props.syncLogs || []).join('\n'))}
                               style={{ border: 'none', background: 'none', color: '#007bff', cursor: 'pointer', fontSize: '0.7rem' }}
                           >
                               Copy
                           </button>
                       </div>
                       <div style={{ 
                           background: '#f8f8f8', 
                           padding: '8px', 
                           borderRadius: '4px', 
                           height: '100px', 
                           overflowY: 'auto', 
                           fontSize: '0.7rem', 
                           fontFamily: 'monospace',
                           border: '1px solid #eee',
                           display: 'flex', flexDirection: 'column', gap: '2px'
                       }}>
                           {(props.syncLogs || []).length === 0 && <span style={{color: '#999', fontStyle: 'italic'}}>Waiting for logs...</span>}
                           {(props.syncLogs || []).slice().reverse().map((log, i) => (
                               <div key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>{log}</div>
                           ))}
                       </div>
                    </div>

                    <details>
                        <summary style={{ cursor: 'pointer', color: '#666' }}>Advanced Maintenance & Diagnostics</summary>
                        <div style={{ padding: '1rem', background: '#fff0f0', borderRadius: 4, marginTop: '0.5rem' }}>
                           <p><strong>Database Stats:</strong></p>
                           {/* We need a component to fetch non-reactive stats here or just buttons that trigger alerts? */}
                           <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                               <button onClick={async () => {
                                   const active = await db.files.count(); // actually this is all. need filter.
                                   const deleted = await db.files.where('deleted').equals(1).count();
                                   const dirty = await db.files.where('dirty').equals(1).count();
                                   alert(`Total Records: ${active}\nSoft Deleted: ${deleted}\nUnsynced (Dirty): ${dirty}`);
                               }} style={{ padding: '4px 8px' }}>
                                   Check Stats
                               </button>
                               
                               <button onClick={async () => {
                                   if (confirm("Restore ALL soft-deleted files? This might bring back deleted items.")) {
                                       await db.transaction('rw', db.files, async () => {
                                            await db.files.where('deleted').equals(1).modify({ deleted: 0, dirty: 1 });
                                       });
                                       alert("Restored all deleted files.");
                                   }
                               }} style={{ padding: '4px 8px' }}>
                                   Restore Deleted
                               </button>
                               
                               <button onClick={async () => {
                                    if (confirm("PERMANENTLY Delete all soft-deleted files? This cannot be undone.")) {
                                        await db.files.where('deleted').equals(1).delete();
                                        alert("Purged deleted files.");
                                    }
                               }} style={{ padding: '4px 8px', color: 'red' }}>
                                   Purge Deleted
                               </button>

                               <button onClick={async () => {
                                    if (confirm("DANGER: Delete ALL Active Files? (Only use if you want to restore from Deleted)")) {
                                        if (confirm("Are you really sure? This wipes your visible files.")) {
                                            await db.files.where('deleted').equals(0).modify({ deleted: 1, dirty: 1 });
                                            alert("All active files moved to trash.");
                                        }
                                    }
                               }} style={{ padding: '4px 8px', color: 'darkred' }}>
                                   Trash Active
                               </button>

                               <button onClick={async () => {
                                   if (confirm("Run Smart Recovery? this will Restore 'misc/*' and 'history/*' and Trash everything else.")) {
                                       await db.transaction('rw', db.files, async () => {
                                            // ... existing smart recovery logic line 534 ...
                                            // reusing logic or calling a function ideally. 
                                            // for now keeping inline as per edit target
                                            const all = await db.files.toArray();
                                            let restored = 0;
                                            let trashed = 0;
                                            
                                            for (const file of all) {
                                                const visible = file.path.startsWith('misc/') || file.path.startsWith('history/') || file.path === 'misc';
                                                
                                                if (visible) {
                                                    await db.files.update(file.path, { deleted: 0, dirty: 1, remoteId: undefined });
                                                    restored++;
                                                } else {
                                                    await db.files.update(file.path, { deleted: 1, dirty: 1 });
                                                    trashed++;
                                                }
                                            }
                                            alert(`Recovery Complete.\nRestored: ${restored}\nTrashed: ${trashed}\n\nPlease 'Reset Cloud' and Sync now.`);
                                       });
                                   }
                               }} style={{ padding: '4px 8px', color: 'blue', fontWeight: 'bold' }}>
                                   Smart Recovery
                               </button>



                                <button onClick={async () => {
                                    const code = prompt("Type 'DELETE' to confirm Factory Reset. This wipes ALL local data.");
                                    if (code === 'DELETE') {
                                        await storage.factoryReset();
                                        alert("Michio has been factory reset. Reloading...");
                                        window.location.reload();
                                    }
                                }} style={{ padding: '4px 8px', color: 'white', background: 'red', fontWeight: 'bold', border: '1px solid darkred' }}>
                                   FACTORY RESET
                                </button>
                           </div>
                        </div>
                    </details>
                </div>

            </div>
        </div>
    );
}
