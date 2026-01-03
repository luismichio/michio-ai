'use client';
import { AppConfig, UserIdentity } from '@/lib/settings';

interface ProfileSettingsProps {
    config: AppConfig;
    updateConfig: (updates: Partial<AppConfig>) => void;
}

export function ProfileSettings({ config, updateConfig }: ProfileSettingsProps) {
    const { identity } = config;

    const handleChange = (field: keyof UserIdentity, value: string) => {
        updateConfig({
            identity: {
                ...identity,
                [field]: value
            }
        });
    };

    return (
        <div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', marginBottom: '1.5rem' }}>Profile</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '600px' }}>
                {/* Name */}
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--secondary)' }}>
                        Your Name
                    </label>
                    <input 
                        type="text" 
                        value={identity.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="How should Meechi address you?"
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 'var(--radius, 6px)',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--foreground)',
                            fontSize: '0.95rem'
                        }}
                    />
                </div>

                {/* Tone / Instructions */}
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, color: 'var(--secondary)' }}>
                        Custom Instructions / Tone
                    </label>
                    <textarea 
                        value={identity.tone}
                        onChange={(e) => handleChange('tone', e.target.value)}
                        placeholder="E.g., Be concise, use pirate speak, explain like I'm 5..."
                        rows={4}
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 'var(--radius, 6px)',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--foreground)',
                            fontSize: '0.95rem',
                            resize: 'vertical',
                            fontFamily: 'inherit'
                        }}
                    />
                    <p style={{ marginTop: '6px', fontSize: '0.85rem', color: 'var(--secondary)', opacity: 0.8 }}>
                        Use this to guide how the AI responds to you.
                    </p>
                </div>
            </div>
        </div>
    );
}
