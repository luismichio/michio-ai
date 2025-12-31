import React from 'react';
import ReactMarkdown from 'react-markdown';
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
                
                <div style={{ flex: 1, overflowY: 'auto', lineHeight: 1.6, padding: '1rem', background: 'var(--surface)', borderRadius: 8 }}>
                    {title.endsWith('.md') ? (
                        <div className={styles.markdownContent}>
                            <ReactMarkdown>{content}</ReactMarkdown>
                        </div>
                    ) : (
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 }}>{content}</pre>
                    )}
                </div>
            </div>
        </div>
    );
}
