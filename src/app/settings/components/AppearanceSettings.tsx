'use client';
import { AppConfig } from '@/lib/settings';

interface AppearanceSettingsProps {
    config: AppConfig;
    updateConfig: (updates: Partial<AppConfig>) => void;
}

export function AppearanceSettings({ config, updateConfig }: AppearanceSettingsProps) {
    const themes = [
        { id: 'system', label: 'System Default' },
        { id: 'light', label: 'Light (Paper)' },
        { id: 'dark', label: 'Dark (Obsidian)' }
    ] as const;

    return (
        <div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', marginBottom: '1.5rem' }}>Appearance</h2>
            
            <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Theme */}
                <div>
                    <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500, color: 'var(--secondary)' }}>
                        Theme
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        {themes.map((t) => {
                            const isActive = config.theme === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => updateConfig({ theme: t.id })}
                                    style={{
                                        padding: '12px',
                                        borderRadius: 'var(--radius, 8px)',
                                        border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                                        background: isActive ? 'var(--overlay)' : 'var(--surface)',
                                        color: isActive ? 'var(--accent)' : 'var(--foreground)',
                                        fontWeight: isActive ? 600 : 400,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        textAlign: 'center'
                                    }}
                                >
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Font Family */}
                <div>
                     <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500, color: 'var(--secondary)' }}>
                        Typography
                    </label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {['Lora', 'Inter', 'Roboto Mono'].map((font) => (
                             <button
                                key={font}
                                onClick={() => updateConfig({ appearance: { ...config.appearance, fontFamily: font } })}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    borderRadius: 'var(--radius, 8px)',
                                    border: config.appearance.fontFamily === font ? '2px solid var(--accent)' : '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    fontFamily: font,
                                    cursor: 'pointer'
                                }}
                            >
                                {font}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Colors Grid */}
                <div>
                     <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500, color: 'var(--secondary)' }}>
                        Palette
                    </label>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                         {/* Accent */}
                         <ColorPicker 
                            label="Accent" 
                            value={config.appearance.accentColor} 
                            onChange={(v) => {
                                document.documentElement.style.setProperty('--accent', v);
                                updateConfig({ appearance: { ...config.appearance, accentColor: v } });
                            }} 
                        />
                        
                         {/* Background */}
                         <ColorPicker 
                            label="Background" 
                            value={config.appearance.backgroundColor || '#F9F7F2'} 
                            onChange={(v) => {
                                document.documentElement.style.setProperty('--background', v);
                                updateConfig({ appearance: { ...config.appearance, backgroundColor: v } });
                            }}
                        />

                         {/* Surface */}
                         <ColorPicker 
                            label="Surface (Cards)" 
                            value={config.appearance.surfaceColor || '#FFFFFF'} 
                            onChange={(v) => {
                                document.documentElement.style.setProperty('--surface', v);
                                updateConfig({ appearance: { ...config.appearance, surfaceColor: v } });
                            }}
                        />

                         {/* Text */}
                         <ColorPicker 
                            label="Text (Foreground)" 
                            value={config.appearance.foregroundColor || '#1A1C1A'} 
                            onChange={(v) => {
                                document.documentElement.style.setProperty('--foreground', v);
                                updateConfig({ appearance: { ...config.appearance, foregroundColor: v } });
                            }}
                        />
                    </div>
                </div>

                 {/* Reset Button */}
                 <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                     <button
                        onClick={() => {
                            const defaults = {
                                fontFamily: 'Lora',
                                accentColor: '#6B8E6B',
                                backgroundColor: '#F9F7F2',
                                surfaceColor: '#FFFFFF',
                                foregroundColor: '#1A1C1A',
                                secondaryColor: '#5C635C',
                                radius: '0.5rem',
                                iconLibrary: 'lucide' as const
                            };
                            updateConfig({ appearance: defaults });
                            // Force reload styles via event or direct set
                            // For simplicity, let the page re-render trigger effect or manually set:
                            document.documentElement.style.setProperty('--background', defaults.backgroundColor);
                            document.documentElement.style.setProperty('--surface', defaults.surfaceColor);
                            document.documentElement.style.setProperty('--foreground', defaults.foregroundColor);
                            document.documentElement.style.setProperty('--accent', defaults.accentColor);
                        }}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 'var(--radius, 8px)',
                            border: '1px solid var(--destructive, #ef4444)',
                            background: 'transparent',
                            color: 'var(--destructive, #ef4444)',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                        }}
                    >
                        Reset to Defaults
                    </button>
                 </div>


                 {/* Icon Library */}
                <div>
                     <label style={{ display: 'block', marginBottom: '12px', fontWeight: 500, color: 'var(--secondary)' }}>
                        Icon Style
                    </label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {['lucide', 'material', 'custom'].map((lib) => (
                             <button
                                key={lib}
                                onClick={() => updateConfig({ appearance: { ...config.appearance, iconLibrary: lib as any } })}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 'var(--radius, 8px)',
                                    border: config.appearance.iconLibrary === lib ? '2px solid var(--accent)' : '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    textTransform: 'capitalize',
                                    cursor: 'pointer'
                                }}
                            >
                                {lib}
                            </button>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}

function ColorPicker({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--foreground)' }}>{label}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input 
                    type="color" 
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    style={{
                        width: 40, height: 40, padding: 0, border: 'none', 
                        borderRadius: 'var(--radius)', cursor: 'pointer', background: 'none'
                    }}
                />
                <input 
                    type="text" 
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    style={{ 
                        width: '80px', padding: '6px', fontSize: '0.85rem', 
                        border: '1px solid var(--border)', borderRadius: 4,
                        background: 'var(--surface)', color: 'var(--foreground)'
                    }}
                />
            </div>
        </div>
    );
}
