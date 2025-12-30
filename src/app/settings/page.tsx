'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signIn, signOut } from "next-auth/react";
import { settingsManager, AppConfig, AIProviderConfig } from '@/lib/settings';
import { LocalStorageProvider } from '@/lib/storage/local';

export default function SettingsPage() {
    const { data: session } = useSession();
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    // Ensure storage is ready
    const [storage] = useState(() => new LocalStorageProvider());

    useEffect(() => {
        async function load() {
            await storage.init();
            const cfg = await settingsManager.getConfig();
            setConfig(cfg);
            setLoading(false);
        }
        load();
    }, [storage]);

    const handleSave = async () => {
        if (!config) return;
        setSaveStatus('saving');
        try {
            await settingsManager.saveConfig(config);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (e) {
            console.error(e);
            setSaveStatus('error');
        }
    };

    const updateIdentity = (field: keyof AppConfig['identity'], value: string) => {
        if (!config) return;
        setConfig({
            ...config,
            identity: { ...config.identity, [field]: value }
        });
    };

    const updateProvider = (id: string, updates: Partial<AIProviderConfig>) => {
        if (!config) return;
        setConfig({
            ...config,
            providers: config.providers.map(p => p.id === id ? { ...p, ...updates } : p)
        });
    };

    if (loading) return <div style={{ padding: '2rem' }}>Loading settings...</div>;
    if (!config) return <div style={{ padding: '2rem' }}>Failed to load settings.</div>;

    const groqProvider = config.providers.find(p => p.id === 'groq');
    const geminiProvider = config.providers.find(p => p.id === 'gemini');

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <h1 style={{ margin: 0 }}>Settings</h1>
                <Link href="/" style={{ textDecoration: 'none', color: '#666', fontSize: '0.9rem' }}>← Back to Chat</Link>
            </div>

            <section style={sectionStyle}>
                <h2 style={headerStyle}>Identity</h2>
                <div style={fieldGroupStyle}>
                    <label style={labelStyle}>Your Name</label>
                    <input 
                        style={inputStyle} 
                        value={config.identity.name}
                        onChange={e => updateIdentity('name', e.target.value)}
                        placeholder="e.g. Traveler"
                    />
                </div>
                <div style={fieldGroupStyle}>
                    <label style={labelStyle}>AI Tone</label>
                    <textarea 
                        style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} 
                        value={config.identity.tone}
                        onChange={e => updateIdentity('tone', e.target.value)}
                        placeholder="Describe how Michio should speak..."
                    />
                </div>
            </section>

            <section style={sectionStyle}>
                <h2 style={headerStyle}>MCP Marketplace (AI Providers)</h2>
                
                {/* Groq Card */}
                <div style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            Groq (Meta Llama 3)
                            {config.activeProviderId === 'groq' && <span style={badgeStyle}>Active</span>}
                        </h3>
                        <label className="switch" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                             Enabled
                             <input 
                                type="checkbox" 
                                checked={groqProvider?.enabled} 
                                onChange={e => groqProvider && updateProvider('groq', { enabled: e.target.checked })}
                             />
                        </label>
                    </div>

                    <div style={fieldGroupStyle}>
                        <label style={labelStyle}>API Key</label>
                        <input 
                            type="password"
                            style={inputStyle} 
                            value={groqProvider?.apiKey || ''}
                            onChange={e => groqProvider && updateProvider('groq', { apiKey: e.target.value })}
                            placeholder="gsk_..."
                        />
                        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: 4 }}>
                            Leave empty to use system default (if hosted). Required for personal usage.
                        </p>
                        <div style={{ marginTop: 4, textAlign: 'right' }}>
                             <a 
                                href="https://console.groq.com/keys" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ fontSize: '0.8rem', color: '#3b82f6', textDecoration: 'none' }}
                            >
                                Get API Key →
                            </a>
                        </div>
                    </div>

                    <div style={fieldGroupStyle}>
                        <label style={labelStyle}>Model</label>
                        <select 
                            style={inputStyle} 
                            value={groqProvider?.model || 'llama-3.3-70b-versatile'}
                            onChange={e => groqProvider && updateProvider('groq', { model: e.target.value })}
                        >
                            <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                            <option value="llama3-70b-8192">llama3-70b-8192</option>
                            <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                        </select>
                    </div>
                </div>

                {/* Gemini Card */}
                <div style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            Google Gemini
                            {config.activeProviderId === 'gemini' && <span style={badgeStyle}>Active</span>}
                        </h3>
                        <div style={{ display: 'flex', gap: 8 }}>
                             <button
                                onClick={() => config && setConfig({ ...config, activeProviderId: 'gemini' })}
                                disabled={config.activeProviderId === 'gemini'}
                                style={{
                                    fontSize: '0.8rem', padding: '2px 8px', cursor: 'pointer',
                                    background: config.activeProviderId === 'gemini' ? '#eee' : 'transparent',
                                    border: '1px solid #ddd', borderRadius: 4
                                }}
                             >
                                 Make Active
                             </button>
                             <label className="switch" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                                  Enabled
                                  <input 
                                     type="checkbox" 
                                     checked={geminiProvider?.enabled ?? true} 
                                     onChange={e => geminiProvider ? updateProvider('gemini', { enabled: e.target.checked }) : 
                                        setConfig(c => c ? ({ ...c, providers: [...c.providers, { id: 'gemini', name: 'Google Gemini', enabled: true }] }) : null)
                                     }
                                  />
                             </label>
                        </div>
                    </div>

                    <div style={fieldGroupStyle}>
                        <label style={labelStyle}>API Key</label>
                        <input 
                            type="password"
                            style={inputStyle} 
                            value={geminiProvider?.apiKey || ''}
                            onChange={e => {
                                if (geminiProvider) {
                                    updateProvider('gemini', { apiKey: e.target.value });
                                } else {
                                    // Initialize if missing
                                    setConfig(c => c ? ({ ...c, providers: [...c.providers, { id: 'gemini', name: 'Google Gemini', enabled: true, apiKey: e.target.value }] }) : null);
                                }
                            }}
                            placeholder="AIz..."
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                            <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>
                                Leave empty to use system fallback.
                            </p>
                            <a 
                                href="https://aistudio.google.com/app/apikey" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ fontSize: '0.8rem', color: '#3b82f6', textDecoration: 'none' }}
                            >
                                Get API Key →
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            <section style={sectionStyle}>
                <h2 style={headerStyle}>Storage Integration</h2>
                
                {/* Google Drive Card */}
                <div style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                Google Drive
                                {session && <span style={badgeStyle}>Connected</span>}
                            </h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                                Only accessed when you explicitly ask Michio to read or write files.
                            </p>
                        </div>
                        
                        <div>
                            {session ? (
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: '0.8rem', margin: '0 0 4px 0' }}>
                                        Signed in as <br/> <strong>{session.user?.email}</strong>
                                    </p>
                                    <button 
                                        onClick={() => signOut()}
                                        style={{ 
                                            background: '#ef4444', color: 'white', border: 'none', 
                                            padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' 
                                        }}
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => signIn("google")}
                                    style={{ 
                                        background: '#3b82f6', color: 'white', border: 'none', 
                                        padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem' 
                                    }}
                                >
                                    Connect
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                 {/* Placeholder for others */}
                 <div style={{ ...cardStyle, opacity: 0.6, borderStyle: 'dashed' }}>
                    <h3 style={{ margin: 0, color: '#666' }}>OneDrive (Coming Soon)</h3>
                </div>
            </section>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
                 <button 
                    onClick={handleSave} 
                    disabled={saveStatus === 'saving'}
                    style={{
                        background: saveStatus === 'saved' ? '#10b981' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        padding: '0.8rem 2rem',
                        borderRadius: 6,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        fontSize: '1rem'
                    }}
                 >
                     {saveStatus === 'saving' ? 'Saving...' : (saveStatus === 'saved' ? 'Saved!' : 'Save Changes')}
                 </button>
            </div>
        </div>
    );
}

// Simple Styles
const sectionStyle = {
    background: '#fff',
    borderRadius: 8,
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
};

const headerStyle = {
    marginTop: 0,
    marginBottom: '1.5rem',
    fontSize: '1.25rem',
    borderBottom: '1px solid #eee',
    paddingBottom: '0.5rem'
};

const fieldGroupStyle = {
    marginBottom: '1rem'
};

const labelStyle = {
    display: 'block',
    fontSize: '0.9rem',
    fontWeight: 600,
    marginBottom: '0.4rem',
    color: '#333'
};

const inputStyle = {
    width: '100%',
    padding: '0.6rem',
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: '0.95rem',
    fontFamily: 'inherit'
};

const cardStyle = {
    background: '#f9fafb',
    border: '1px solid #eee',
    borderRadius: 6,
    padding: '1rem',
    marginBottom: '1rem'
};

const badgeStyle = {
    background: '#dcfce7',
    color: '#166534',
    fontSize: '0.7rem',
    padding: '2px 6px',
    borderRadius: 4,
    marginLeft: 8,
    textTransform: 'uppercase' as const
};
