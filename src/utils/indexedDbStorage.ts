import type { StateStorage } from 'zustand/middleware';

const DB_NAME = 'ImageSetDB';
const STORE_NAME = 'ImageSetStore';
const DB_VERSION = 1;

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
            // eslint-disable-next-line unicorn/no-null -- StateStorage interface requires null
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
