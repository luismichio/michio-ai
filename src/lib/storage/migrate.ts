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
        console.log(`[Meechi] Migrated ${recordsToInsert.length} files to new storage.`);

    } catch (e) {
        console.warn("Migration check failed (safe to ignore if new user)", e);
    }
}

const GUEST_DB_NAME = 'michio-guest-db';

export async function migrateJournal() {
    const count = await db.journal.count();
    if (count > 0) return;

    try {
        // We just try to open it. If it doesn't exist, openDB might create it empty or fail?
        // Actually IDB openDB will create if not exists. We should check if it has the store.
        const guestDb = await openDB(GUEST_DB_NAME, 1, {
            upgrade(db) {
                // If it doesn't exist, we don't create stores here, we just want to read.
                // But openDB with upgrade triggers creation.
                // If we don't provide upgrade, and version matches, it opens.
                // If we want to check existence safely:
            }
        });
        
        if (!guestDb.objectStoreNames.contains('journal')) {
            return;
        }

        const allEntries = await guestDb.getAll('journal');
        
        if (allEntries.length > 0) {
           await db.journal.bulkAdd(allEntries);
           console.log(`[Meechi] Migrated ${allEntries.length} journal entries.`);
        }

    } catch (e) {
        // Likely DB doesn't exist or other error
    }
}
