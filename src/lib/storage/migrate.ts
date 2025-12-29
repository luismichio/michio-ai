import { openDB } from 'idb';
import { db, FileRecord } from './db';

const OLD_DB_NAME = 'michio-local-v1';
const OLD_STORE_NAME = 'files';

export async function migrateFromIdbToDexie() {
    // 1. Check if we already have data in Dexie
    const count = await db.files.count();
    
    if (count > 0) {
        // Already migrated
        return;
    }

    try {
        const oldDb = await openDB(OLD_DB_NAME, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(OLD_STORE_NAME)) {
                     // No old store
                }
            }
        });

        if (!oldDb.objectStoreNames.contains(OLD_STORE_NAME)) {
            return;
        }

        const allRecords = await oldDb.getAll(OLD_STORE_NAME);
        if (allRecords.length === 0) return;

        // 4. Transform & Insert
        const recordsToInsert: FileRecord[] = allRecords.map(rec => ({
            path: rec.path,
            content: rec.content,
            updatedAt: rec.updatedAt,
            remoteId: rec.remoteId,
            type: 'file'
        }));

        // Use bulkPut to overwrite/merge
        await db.files.bulkPut(recordsToInsert);
        console.log(`[Michio] Migrated ${recordsToInsert.length} files to new storage.`);

    } catch (e) {
        console.warn("Migration check failed (safe to ignore if new user)", e);
    }
}
