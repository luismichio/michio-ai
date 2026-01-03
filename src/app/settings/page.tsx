'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from "next-auth/react";
import { settingsManager, AppConfig } from '@/lib/settings';
import { LocalStorageProvider } from '@/lib/storage/local';
import { isTauri, checkLocalOllama, checkOllamaInstalled } from '@/lib/platform';
import { nativeSync } from '@/lib/storage/native-sync';

// Components
import { SettingsSidebar } from './components/SettingsSidebar';
import { ProfileSettings } from './components/ProfileSettings';
import { AppearanceSettings } from './components/AppearanceSettings';
import { AISettings } from './components/AISettings';
import { StorageSettings } from './components/StorageSettings';

export default function SettingsPage() {
    const { data: session } = useSession();
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('profile');
    
    // Desktop State
    const [ollamaConnected, setOllamaConnected] = useState(false);
    const [ollamaInstalled, setOllamaInstalled] = useState<boolean | null>(null);
    const [syncPath, setSyncPath] = useState<string | null>(null);

    // Initial Load
    // Use state lazy init to avoid multiple checks
    const [storage] = useState(() => new LocalStorageProvider());

    useEffect(() => {
        let mounted = true;
        async function load() {
            await storage.init();
            const cfg = await settingsManager.getConfig();
            
            if (!mounted) return;
            setConfig(cfg);

            // Desktop Checks
            if (isTauri()) {
                const connected = await checkLocalOllama();
                if (mounted) setOllamaConnected(connected);
                if (!connected) {
                    const installed = await checkOllamaInstalled();
                    if (mounted) setOllamaInstalled(installed);
                } else {
                    if (mounted) setOllamaInstalled(true);
                }
            }

            // Sync Path
            const path = await nativeSync.getSyncPath();
            if (mounted) setSyncPath(path);
            
            if (mounted) setLoading(false);
        }
        load();
        return () => { mounted = false; };
    }, [storage]);

    const handleUpdate = async (updates: Partial<AppConfig>) => {
        if (!config) return;
        const newConfig = { ...config, ...updates };
        setConfig(newConfig);
        await settingsManager.saveConfig(newConfig);
    };

    if (loading || !config) {
        return (
            <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center', height: '100vh', alignItems: 'center' }}>
                <span style={{ color: 'var(--secondary)' }}>Loading settings...</span>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100%', background: 'var(--background)', overflow: 'hidden' }}>
             {/* Left Sidebar */}
             <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

             {/* Right Content */}
             <main style={{ flex: 1, padding: '2rem 3rem', overflowY: 'auto' }}>
                 <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    
                    {/* Render Active Section */}
                    {activeTab === 'profile' && (
                        <ProfileSettings config={config} updateConfig={handleUpdate} />
                    )}
                    
                    {activeTab === 'appearance' && (
                        <AppearanceSettings config={config} updateConfig={handleUpdate} />
                    )}
                    
                    {activeTab === 'ai' && (
                        <AISettings 
                            config={config} 
                            updateConfig={handleUpdate}
                            ollamaConnected={ollamaConnected}
                            ollamaInstalled={ollamaInstalled}
                        />
                    )}
                    
                    {activeTab === 'storage' && (
                        <StorageSettings 
                            config={config} 
                            syncPath={syncPath}
                            setSyncPath={setSyncPath}
                        />
                    )}
                 </div>
             </main>

             {/* Global Exit button (Top Right) */}
             <Link href="/app" style={{ 
                 position: 'absolute', top: '1rem', right: '1.5rem',
                 padding: '8px 16px', borderRadius: '20px', 
                 background: 'var(--surface)', border: '1px solid var(--border)',
                 color: 'var(--secondary)', fontSize: '0.85rem',
                 display: 'flex', alignItems: 'center', gap: 6,
                 boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                 textDecoration: 'none',
                 zIndex: 50
             }}>
                 ✕ Close
             </Link>
        </div>
    );
}
