import React from 'react';
import styles from '../page.module.css';

interface SourceViewerProps {
    title: string;
    content: string;
    onClose: () => void;
}

export default function SourceViewer({ title, content, onClose }: SourceViewerProps) {
    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ width: '80%', maxWidth: 800, height: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>{title}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'monospace', padding: '1rem', background: '#f9f9f9', borderRadius: 8 }}>
                    {content}
                </div>
            </div>
        </div>
    );
}
