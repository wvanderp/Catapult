const DB_NAME = "ImageBlobDB";
const STORE_NAME = "ImageBlobs";
const DB_VERSION = 1;

export interface StoredImageBlob {
  id: string;
  blob: Blob;
  mimeType: string;
}

let dbInstance: IDBDatabase | undefined;

/**
 * Gets or creates the IndexedDB database instance for image blob storage.
 * Reuses existing connection if available.
 *
 * @returns Promise resolving to the IDBDatabase instance
 */
function getDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("success", () => {
      dbInstance = request.result;
      resolve(request.result);
    });
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    });
  });
}

/**
 * Stores an image blob in IndexedDB
 * 
 * @param id The unique identifier for the image
 * @param blob The image blob data
 * @param mimeType The MIME type of the image
 */
export async function storeImageBlob(
  id: string,
  blob: Blob,
  mimeType: string,
): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ id, blob, mimeType });
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
  });
}

/**
 * Stores an image from base64 string in IndexedDB
 * 
 * @param id The unique identifier for the image
 * @param base64 The base64 encoded image data (without data URL prefix)
 * @param mimeType The MIME type of the image
 * @returns Promise that resolves when the image is successfully stored
 */
export async function storeImageFromBase64(
  id: string,
  base64: string,
  mimeType: string,
): Promise<void> {
  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let index = 0; index < byteCharacters.length; index++) {
    byteArray[index] = byteCharacters.codePointAt(index) ?? 0;
  }
  const blob = new Blob([byteArray], { type: mimeType });
  return storeImageBlob(id, blob, mimeType);
}

/**
 * Retrieves an image blob from IndexedDB
 * 
 * @param id The unique identifier for the image
 * @returns The stored image blob or undefined if not found
 */
export async function getImageBlob(
  id: string,
): Promise<StoredImageBlob | undefined> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.addEventListener("success", () =>
      resolve(request.result as StoredImageBlob | undefined),
    );
    request.addEventListener("error", () => reject(request.error));
  });
}

/**
 * Creates a data URL from an image blob
 * 
 * @param id The unique identifier for the image
 * @returns A data URL string or undefined if not found
 */
export async function getImageDataUrl(id: string): Promise<string | undefined> {
  const stored = await getImageBlob(id);
  if (!stored) return undefined;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(stored.blob);
  });
}

/**
 * Creates an object URL from an image blob (more efficient for display)
 * Note: Remember to call URL.revokeObjectURL when done with the URL
 * 
 * @param id The unique identifier for the image
 * @returns An object URL string or undefined if not found
 */
export async function getImageObjectUrl(
  id: string,
): Promise<string | undefined> {
  const stored = await getImageBlob(id);
  if (!stored) return undefined;
  return URL.createObjectURL(stored.blob);
}

/**
 * Gets the base64 string from an image blob (for API uploads)
 * 
 * @param id The unique identifier for the image
 * @returns The base64 string or undefined if not found
 */
export async function getImageBase64(id: string): Promise<string | undefined> {
  const stored = await getImageBlob(id);
  if (!stored) return undefined;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(stored.blob);
  });
}

/**
 * Retrieves an image as a File object for upload
 * 
 * @param id The unique identifier for the image
 * @param filename The filename to use for the File object
 * @returns A File object or undefined if not found
 */
export async function getImageAsFile(
  id: string,
  filename: string,
): Promise<File | undefined> {
  const stored = await getImageBlob(id);
  if (!stored) return undefined;
  return new File([stored.blob], filename, { type: stored.mimeType });
}

/**
 * Removes an image blob from IndexedDB
 * 
 * @param id The unique identifier for the image
 */
export async function removeImageBlob(id: string): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
  });
}

/**
 * Removes multiple image blobs from IndexedDB
 * 
 * @param ids Array of unique identifiers to remove
 */
export async function removeImageBlobs(ids: string[]): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    let completed = 0;
    let hasError = false;

    for (const id of ids) {
      const request = store.delete(id);
      request.addEventListener("success", () => {
        completed++;
        if (completed === ids.length && !hasError) {
          resolve();
        }
      });
      request.addEventListener("error", () => {
        if (!hasError) {
          hasError = true;
          reject(request.error);
        }
      });
    }

    // Handle empty array case
    if (ids.length === 0) {
      resolve();
    }
  });
}

/**
 * Clears all image blobs from IndexedDB
 */
export async function clearAllImageBlobs(): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
  });
}

/**
 * Gets all image IDs stored in IndexedDB
 *
 * @returns Promise resolving to array of image ID strings
 */
export async function getAllImageIds(): Promise<string[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.addEventListener("success", () =>
      resolve(request.result as string[]),
    );
    request.addEventListener("error", () => reject(request.error));
  });
}
