import type { StateStorage } from 'zustand/middleware';

const DB_NAME = 'ImageSetDB';
const STORE_NAME = 'ImageSetStore';
const DB_VERSION = 1;

/**
 * Clears all data from the IndexedDB database by deleting the entire database.
 * This is useful for resetting the application state.
 */
export function clearDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.addEventListener('success', () => resolve());
        request.addEventListener('error', () => reject(request.error));
        request.addEventListener('blocked', () => {
            // Database is blocked, likely because there are open connections
            console.warn('Database deletion blocked. Close other tabs and try again.');
            reject(new Error('Database deletion blocked'));
        });
    });
}

/**
 * Gets or creates the IndexedDB database instance for general storage.
 * Creates the object store on first initialization.
 *
 * @returns Promise resolving to the IDBDatabase instance
 */
function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.addEventListener('error', () => reject(request.error));
        request.addEventListener('success', () => resolve(request.result));
        request.addEventListener('upgradeneeded', () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME);
            }
        });
    });
}

export const indexedDBStorage: StateStorage = {
    async getItem(name: string): Promise<string | null> {
        const database = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(name);
            request.addEventListener('success', () => resolve(request.result as string ?? null));
            request.addEventListener('error', () => reject(request.error));
        });
    },
    async setItem(name: string, value: string): Promise<void> {
        const database = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(value, name);
            request.addEventListener('success', () => resolve());
            request.addEventListener('error', () => reject(request.error));
        });
    },
    async removeItem(name: string): Promise<void> {
        const database = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(name);
            request.addEventListener('success', () => resolve());
            request.addEventListener('error', () => reject(request.error));
        });
    },
};
