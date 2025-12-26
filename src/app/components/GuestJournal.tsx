'use client';

import { useState, useEffect } from 'react';
import { addEntry, getEntries } from '@/lib/db';
import styles from './GuestJournal.module.css';

interface JournalEntry {
  id?: number;
  content: string;
  createdAt: Date;
}

export default function GuestJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [newEntry, setNewEntry] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    try {
      const data = await getEntries();
      // Sort by date descending
      data.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setEntries(data);
    } catch (err) {
      console.error('Failed to load entries:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newEntry.trim()) return;

    try {
      await addEntry(newEntry);
      setNewEntry('');
      await loadEntries();
    } catch (err) {
      console.error('Failed to add entry:', err);
    }
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Guest Journal</h2>
      <p className={styles.subtitle}>Leave a note on your journey.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <textarea
          className={styles.textarea}
          value={newEntry}
          onChange={(e) => setNewEntry(e.target.value)}
          placeholder="What have you seen today?"
          rows={4}
        />
        <button type="submit" className={styles.button}>
          Save Entry
        </button>
      </form>

      <div className={styles.entries}>
        {loading ? (
          <p>Loading thoughts...</p>
        ) : entries.length === 0 ? (
          <p className={styles.empty}>No entries yet. Be the first.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={styles.entry}>
              <p className={styles.date}>
                {entry.createdAt.toLocaleDateString()}
              </p>
              <p className={styles.content}>{entry.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
