'use client';
import { AppConfig, AIProviderConfig } from '@/lib/settings';
import { AVAILABLE_MODELS } from '@/lib/ai/registry';

interface AISettingsProps {
    config: AppConfig;
    updateConfig: (updates: Partial<AppConfig>) => void;
    // We pass handlers for desktop connection
    ollamaConnected: boolean;
    ollamaInstalled: boolean | null;
}

export function AISettings({ config, updateConfig, ollamaConnected, ollamaInstalled }: AISettingsProps) {
    
    // --- Utils ---
    const updateProvider = (id: string, updates: Partial<AIProviderConfig>) => {
        const newProviders = config.providers.map(p => 
            p.id === id ? { ...p, ...updates } : p
        );
        // If updating a provider not in the list (e.g. adding new), need logic, but for now we assume list exists
        // Wait, app logic allows enabling/disabling.
        updateConfig({ providers: newProviders });
    };

    const getProvider = (id: string) => config.providers.find(p => p.id === id);

    const sectionStyle = {
        padding: '1.5rem',
        background: 'var(--surface)',
        borderRadius: 'var(--radius, 8px)',
        border: '1px solid var(--border)',
        marginBottom: '1.5rem'
    };

    const inputStyle = {
        width: '100%',
        padding: '8px 12px',
        borderRadius: 4,
        border: '1px solid var(--border)',
        background: 'var(--background)',
        color: 'var(--foreground)',
        marginTop: 6
    };

    return (
        <div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', marginBottom: '1.5rem' }}>AI Providers</h2>

            {/* 1. WebLLM (Browser Local) */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>WebLLM (In-Browser)</h3>
                    <label className="switch">
                        <input 
                            type="checkbox" 
                            checked={config.localAI.enabled}
                            onChange={(e) => updateConfig({ 
                                localAI: { ...config.localAI, enabled: e.target.checked } 
                            })}
                        />
                         {/* Toggle Slider (CSS needed or simplified checkbox) */}
                         <span style={{ fontSize: '0.9rem', color: config.localAI.enabled ? 'var(--accent)' : 'var(--secondary)' }}>
                             {config.localAI.enabled ? 'Active' : 'Disabled'}
                         </span>
                    </label>
                </div>
                <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Run AI entirely in your browser. Private, requires GPU, ~2GB download.
                </p>
                <div>
                     <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600 }}>Model</label>
                     <select 
                        value={config.localAI.model}
                        onChange={(e) => updateConfig({ localAI: { ...config.localAI, model: e.target.value } })}
                        style={inputStyle}
                     >
                         <option value="Llama-3.2-1B-Instruct-q4f16_1-MLC">Llama 3.2 1B (Fastest)</option>
                         <option value="Llama-3.2-3B-Instruct-q4f16_1-MLC">Llama 3.2 3B (Balanced)</option>
                     </select>
                </div>
            </div>

            {/* 2. Cloud Providers (Groq / Gemini) */}
            <h4 style={{ margin: '2rem 0 1rem', color: 'var(--secondary)', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                Cloud Providers
            </h4>
            
            {/* Groq */}
            {(() => {
                const groq = getProvider('groq');
                if (!groq) return null; 
                return (
                     <div key="groq" style={sectionStyle}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <h3 style={{ margin: 0 }}>Groq (Fast Cloud)</h3>
                             <input 
                                type="checkbox" 
                                checked={groq.enabled}
                                onChange={(e) => updateProvider('groq', { enabled: e.target.checked })}
                             />
                         </div>
                         <div style={{ marginTop: '1rem' }}>
                            <label style={{ fontSize: '0.85rem' }}>API Key</label>
                            <input 
                                type="password" 
                                value={groq.apiKey || ''} 
                                onChange={(e) => updateProvider('groq', { apiKey: e.target.value })}
                                placeholder="gsk_..."
                                style={inputStyle}
                            />
                         </div>
                         <div style={{ marginTop: '1rem' }}>
                            <label style={{ fontSize: '0.85rem' }}>Model</label>
                            <select 
                                value={groq.model}
                                onChange={(e) => updateProvider('groq', { model: e.target.value })}
                                style={inputStyle}
                            >
                                {AVAILABLE_MODELS.groq.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                         </div>
                     </div>
                );
            })()}

            {/* Gemini */}
            {(() => {
                const gemini = getProvider('gemini');
                if (!gemini) return null; 
                return (
                     <div key="gemini" style={sectionStyle}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <h3 style={{ margin: 0 }}>Google Gemini</h3>
                             <input 
                                type="checkbox" 
                                checked={gemini.enabled}
                                onChange={(e) => updateProvider('gemini', { enabled: e.target.checked })}
                             />
                         </div>
                         <div style={{ marginTop: '1rem' }}>
                            <label style={{ fontSize: '0.85rem' }}>API Key</label>
                            <input 
                                type="password" 
                                value={gemini.apiKey || ''} 
                                onChange={(e) => updateProvider('gemini', { apiKey: e.target.value })}
                                placeholder="AIza..."
                                style={inputStyle}
                            />
                         </div>
                         <div style={{ marginTop: '1rem' }}>
                            <label style={{ fontSize: '0.85rem' }}>Model</label>
                             <select 
                                value={gemini.model}
                                onChange={(e) => updateProvider('gemini', { model: e.target.value })}
                                style={inputStyle}
                            >
                                {AVAILABLE_MODELS.gemini.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                         </div>
                     </div>
                );
            })()}

            {/* 3. Local AI (Desktop / Ollama) */}
             <h4 style={{ margin: '2rem 0 1rem', color: 'var(--secondary)', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                Desktop Native
            </h4>
            <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div>
                             <h3 style={{ margin: 0 }}>Local AI (Ollama)</h3>
                             <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                                 <span style={{ 
                                     width: 8, height: 8, borderRadius: '50%', 
                                     background: ollamaConnected ? '#22c55e' : '#ef4444' 
                                 }} />
                                 <span style={{ fontSize: '0.8rem', color: ollamaConnected ? '#22c55e' : '#ef4444' }}>
                                     {ollamaConnected ? 'Connected' : 'Disconnected'}
                                 </span>
                             </div>
                        </div>
                </div>
                 <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Uses the Desktop app's native inference engine (Ollama). Zero data leaves your device.
                </p>
                 {/* Provide Model Input manually for Ollama for now, or dropdown if we fetched them */}
                 <div>
                    <label style={{ fontSize: '0.85rem' }}>Ollama URL</label>
                    <input 
                        type="text" 
                        value={config.desktop.ollamaUrl}
                        onChange={(e) => updateConfig({ desktop: { ...config.desktop, ollamaUrl: e.target.value } })}
                        style={inputStyle}
                    />
                 </div>
            </div>

        </div>
    );
}
