import { useState } from 'react';
import styles from '../page.module.css';

interface Props {
    onClose: () => void;
    onSave: (topic: string, fileName: string, content: string) => Promise<void>;
}

export default function AddSourceModal({ onClose, onSave }: Props) {
    const [topic, setTopic] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !topic.trim()) return;

        setIsSaving(true);
        try {
            const text = await file.text(); // Browser API to read file as text
            
            // Clean topic name (remove spaces/special chars for folder safety)
            const safeTopic = topic.trim();
            
            await onSave(safeTopic, file.name, text);
            onClose();
        } catch (error) {
            console.error("Failed to read file", error);
            alert("Failed to read file");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h2>Add Knowledge Source</h2>
                <p style={{marginBottom: 16, color: '#666'}}>Teach Michio something new.</p>
                
                <form onSubmit={handleSubmit}>
                    <div style={{marginBottom: 16}}>
                        <label style={{display:'block', marginBottom: 8, fontWeight: 'bold'}}>Topic / Collection</label>
                        <input 
                            type="text" 
                            className={styles.chatInput} 
                            style={{width: '100%', border: '1px solid #ccc'}}
                            placeholder="e.g. Quantum Physics, Recipies, Project X"
                            value={topic}
                            onChange={e => setTopic(e.target.value)}
                            required
                        />
                    </div>

                    <div style={{marginBottom: 16}}>
                        <label style={{display:'block', marginBottom: 8, fontWeight: 'bold'}}>File (Text/MD)</label>
                        <input 
                            type="file" 
                            onChange={handleFileChange}
                            accept=".txt,.md,.json,.csv" // Restrict to text formats for now
                            required
                        />
                    </div>
                    
                    <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24}}>
                         <button type="button" onClick={onClose} style={{padding: '8px 16px', borderRadius: 8, border: 'none', background: '#e5e7eb', cursor: 'pointer'}}>Cancel</button>
                         <button 
                            type="submit" 
                            disabled={isSaving}
                            style={{padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color:'white', cursor: 'pointer'}}
                         >
                            {isSaving ? 'Importing...' : 'Add Source'}
                         </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
