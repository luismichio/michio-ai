import { openDB, DBSchema } from 'idb';

interface JournalEntry {
  id?: number;
  content: string;
  createdAt: Date;
}

interface MeechiDB extends DBSchema {
  journal: {
    key: number;
    value: JournalEntry;
    indexes: { 'by-date': Date };
  };
}

const DB_NAME = 'michio-guest-db';

export async function initDB() {
  return openDB<MeechiDB>(DB_NAME, 1, {
    upgrade(db) {
      const store = db.createObjectStore('journal', {
        keyPath: 'id',
        autoIncrement: true,
      });
      store.createIndex('by-date', 'createdAt');
    },
  });
}

export async function addEntry(content: string) {
  const db = await initDB();
  return db.add('journal', {
    content,
    createdAt: new Date(),
  });
}

export async function getEntries() {
  const db = await initDB();
  return db.getAllFromIndex('journal', 'by-date');
}
