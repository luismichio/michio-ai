'use client';

import { User, Palette, Cpu, Database } from 'lucide-react';

interface SettingsSidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

const TABS = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'ai', label: 'AI Providers', icon: Cpu },
    { id: 'storage', label: 'Storage', icon: Database },
] as const;

export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
    return (
        <nav style={{
            width: '240px',
            borderRight: '1px solid var(--border)',
            padding: '1.5rem 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            background: 'var(--background)',
            height: '100%',
            overflowY: 'auto'
        }}>
            <h2 style={{ 
                padding: '0 1.5rem 1rem', 
                margin: 0, 
                fontSize: '1.2rem', 
                fontFamily: 'var(--font-serif)',
                color: 'var(--foreground)'
            }}>
                Settings
            </h2>

            {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 24px',
                            background: isActive ? 'var(--overlay)' : 'transparent',
                            border: 'none',
                            borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                            color: isActive ? 'var(--accent)' : 'var(--secondary)',
                            fontWeight: isActive ? 600 : 400,
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.95rem',
                            transition: 'all 0.2s ease',
                            outline: 'none'
                        }}
                    >
                        <Icon size={18} />
                        {tab.label}
                    </button>
                );
            })}
        </nav>
    );
}
