import Dexie, { Table } from 'dexie';

export interface FileRecord {
    path: string; // Primary Key
    content: string | Blob | ArrayBuffer;
    updatedAt: number;
    remoteId?: string; // Google Drive ID (Indexed)
    type: 'file' | 'folder' | 'source';
    dirty?: number; // 1 if dirty, 0 or undefined if clean (Indexed for fast lookup)
    deleted?: number; // 1 if deleted
}

export interface SettingRecord {
    key: string;
    value: any;
}

export interface FileChunk {
    id?: number;
    filePath: string;
    content: string;
    embedding: number[]; // 512 dimensions (TensorFlow.js Universal Sentence Encoder)
}

export interface JournalEntry {
    id?: number;
    content: string;
    createdAt: Date;
}

export class MeechiDB extends Dexie {
    files!: Table<FileRecord>;
    settings!: Table<SettingRecord>;
    chunks!: Table<FileChunk>;
    journal!: Table<JournalEntry>;

    constructor() {
        super('michio-db');
        this.version(1).stores({
            files: 'path, remoteId, type, updatedAt'
        });
        
        // Add settings table in version 2
        this.version(2).stores({
            settings: 'key'
        });

        // Add dirty/deleted index in version 3
        this.version(3).stores({
            files: 'path, remoteId, type, updatedAt, dirty, deleted'
        }).upgrade(tx => {
             return tx.table("files").toCollection().modify(file => {
                file.dirty = 0;
                file.deleted = 0;
            });
        });


        // Add semantic chunks table in version 4
        this.version(4).stores({
            chunks: '++id, filePath'
        });

        // Add journal table in version 5
        this.version(5).stores({
            journal: '++id, createdAt'
        });
    }
}

export const db = new MeechiDB();
