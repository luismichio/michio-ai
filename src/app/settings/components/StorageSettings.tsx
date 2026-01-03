'use client';
import { AppConfig } from '@/lib/settings';
import { isTauri } from '@/lib/platform'; // Note: Importing from lib
import { nativeSync } from '@/lib/storage/native-sync';
import { useState } from 'react';

interface StorageSettingsProps {
    config: AppConfig;
    syncPath: string | null;
    setSyncPath: (path: string | null) => void;
}

export function StorageSettings({ config, syncPath, setSyncPath }: StorageSettingsProps) {
    const [isSyncing, setIsSyncing] = useState(false);

    const cardStyle = {
        padding: '1.5rem',
        background: 'var(--surface)',
        borderRadius: 'var(--radius, 8px)',
        border: '1px solid var(--border)',
        marginBottom: '1rem'
    };

    return (
        <div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', marginBottom: '1.5rem' }}>Storage</h2>

             {/* Browser Storage Stats */}
             <div style={cardStyle}>
                 <h3 style={{ margin: '0 0 0.5rem 0' }}>Browser Storage</h3>
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                     <div style={{ background: 'var(--background)', padding: '1rem', borderRadius: 4 }}>
                         <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--secondary)' }}>Database</span>
                         <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>IndexedDB</span>
                     </div>
                     <div style={{ background: 'var(--background)', padding: '1rem', borderRadius: 4 }}>
                         <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--secondary)' }}>Status</span>
                         <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent)' }}>Active</span>
                     </div>
                 </div>
                 <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--secondary)' }}>
                     Your data is currently stored privately inside your browser. Clearing browser data will delete it unless you enable sync below.
                 </p>
             </div>

            {/* Local Sync */}
            <h4 style={{ margin: '2rem 0 1rem', color: 'var(--secondary)', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                Local Synchronization
            </h4>
            <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            Local Folder
                            {syncPath && <span style={{ 
                                background: '#dcfce7', color: '#166534', 
                                fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12 
                            }}>Active</span>}
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                             {isTauri() 
                                    ? "Mirror your files to a folder on your computer." 
                                    : "Sync with a local folder (Chrome/Edge only)."}
                        </p>
                    </div>
                    
                     <div>
                        {!syncPath ? (
                            <button 
                                onClick={async () => {
                                    const path = await nativeSync.pickSyncFolder();
                                    if (path) setSyncPath(path);
                                }}
                                style={{ 
                                    background: 'var(--accent)', color: 'white', border: 'none', 
                                    padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem' 
                                }}
                            >
                                Choose Folder
                            </button>
                        ) : (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button 
                                    onClick={async () => {
                                        setIsSyncing(true);
                                        await nativeSync.syncNow();
                                        setTimeout(() => setIsSyncing(false), 1000);
                                        alert('Sync Complete!');
                                    }}
                                    disabled={isSyncing}
                                    style={{ 
                                        background: isSyncing ? 'var(--secondary)' : 'var(--surface)', 
                                        color: isSyncing ? 'white' : 'var(--foreground)',
                                        border: '1px solid var(--border)',
                                        padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem' 
                                    }}
                                >
                                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                                </button>
                                <button 
                                    onClick={async () => {
                                        const path = await nativeSync.pickSyncFolder();
                                        if (path) setSyncPath(path);
                                    }}
                                    style={{ fontSize: '0.8rem', color: 'var(--secondary)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
                                >
                                    Change
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                {syncPath && (
                    <div style={{ background: 'var(--background)', padding: '0.5rem', borderRadius: 4, fontSize: '0.85rem', color: 'var(--secondary)', border: '1px solid var(--border)', fontFamily: 'monospace' }}>
                        📁 {syncPath}
                    </div>
                )}
            </div>

            {/* Cloud Storage */}
            <h4 style={{ margin: '2rem 0 1rem', color: 'var(--secondary)', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                Cloud Drive
            </h4>
            <div style={{ ...cardStyle, opacity: 0.7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0 }}>Google Drive</h3>
                     <span style={{ fontSize: '0.8rem', color: 'var(--secondary)', background: 'var(--background)', padding: '2px 6px', borderRadius: 4 }}>Coming Soon</span>
                </div>
                 <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                    Connect your Google Drive to RAG against your cloud files.
                </p>
            </div>
            
             <div style={{ ...cardStyle, opacity: 0.7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0 }}>OneDrive</h3>
                     <span style={{ fontSize: '0.8rem', color: 'var(--secondary)', background: 'var(--background)', padding: '2px 6px', borderRadius: 4 }}>Coming Soon</span>
                </div>
                 <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                    Enterprise connection for OneDrive.
                </p>
            </div>

        </div>
    );
}
