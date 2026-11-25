/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns -- IndexedDB operations are described in function summaries. */
import type { PackageRecord } from "./types";

const DATABASE = "CatapultPackages";
const STORE = "packages";

/**
Open the package database; callers always close the returned connection.
 
 * @returns The requested result.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onblocked = () => reject(new Error("Opening the package database is blocked by another connection"));
    request.addEventListener("error", () => reject(request.error));
  });
}

/**
Run an operation with an IndexedDB connection that is always closed.
 
 * @param operation
 * @returns The requested result.
 */
async function withDatabase<T>(operation: (database: IDBDatabase) => Promise<T>): Promise<T> {
  const database = await openDatabase();
  try { return await operation(database); }
  finally { database.close(); }
}

/**
Persist a package record.
 
 * @param record
 * @returns The requested result.
 */
export function savePackage(record: PackageRecord): Promise<void> {
  return withDatabase((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error("Package save was aborted")));
  }));
}

/**
Load one package, tolerating records written by earlier importer versions.
 
 * @param id
 * @returns The requested result.
 */
export function getPackage(id: string): Promise<PackageRecord | undefined> {
  return withDatabase((database) => new Promise((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).get(id);
    request.onsuccess = () => {
      const record = request.result as PackageRecord | undefined;
      if (record) {
        record.identity ??= record.id;
        record.size ??= -1;
        record.lastModified ??= -1;
      }
      resolve(record);
    };
    request.addEventListener("error", () => reject(request.error));
  }));
}

/**
List every saved package.
 
 * @returns The requested result.
 */
export function listPackages(): Promise<PackageRecord[]> {
  return withDatabase((database) => new Promise((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as PackageRecord[]).map((record) => ({
      ...record, identity: record.identity ?? record.id, size: record.size ?? -1, lastModified: record.lastModified ?? -1,
    })));
    request.addEventListener("error", () => reject(request.error));
  }));
}

/**
Delete one package record.
 
 * @param id
 */
export function removePackageRecord(id: string): Promise<void> {
  return withDatabase((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error("Package deletion was aborted")));
  }));
}

/**
Delete all importer records and wait for the database to be released.
 */
export function clearPackageStore(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.onsuccess = () => resolve();
    request.addEventListener("error", () => reject(request.error));
    request.onblocked = () => reject(new Error("Package database deletion is blocked by another connection"));
  });
}
