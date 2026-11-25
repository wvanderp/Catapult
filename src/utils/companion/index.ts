/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns, jsdoc/escape-inline-tags -- Compatibility API contracts are documented in their summaries. */
import { hashBlob } from "./sha256";
import { clear, getOriginalBlob, getPackage, getPreviewBlob, getVerifiedOriginalFile, importFile, reselect, remove } from "./packageSession";
export type { BrowserFileHandle, ImportedPhoto, PackageAvailability, PackageRecord, PackageSessionSnapshot } from "./types";


/**
 * Large-original warning boundary in bytes.
 *
 * @returns The requested result.
 */
export const LARGE_ORIGINAL_BYTES = 100 * 1024 * 1024;

/**
 * Check whether an original exceeds the upload warning threshold.
 *
 * @param size
 */
export function isLargeOriginal(size: number): boolean { return size > LARGE_ORIGINAL_BYTES; }

/**
 * Compatibility wrapper for existing import callers.
 */
export const inspectCompanion = importFile;

/**
 * Compatibility wrapper for existing package cleanup callers.
 */
export const clearCompanionDatabase = clear;

/**
 * Compatibility wrapper for package removal callers.
 *
 * @param kind Value provided to the function.
 * @returns The requested result.
 */
export const removePackage = remove;

/**
 * Compatibility wrapper for package lookup callers.
 *
 * @param packageId Value provided to the function.
 * @param photoId Value provided to the function.
 */
export const getPackageRecord = getPackage;

/**
 * Compatibility wrapper for prior preview/original loading callers.
 *
 * @param packageId
 * @param photoId
 * @param kind
 * @param signal
 */
export async function packageEntryBlob(packageId: string, photoId: string, kind: "thumbnail" | "working" | "original", signal?: AbortSignal): Promise<Blob> {
  return kind === "original" ? getOriginalBlob(packageId, photoId, signal) : getPreviewBlob(packageId, photoId, kind, signal);
}

/**
 * Compatibility wrapper for the previous original-file API.
 *
 * @returns The requested result.
 */
export const verifiedOriginalFile = getVerifiedOriginalFile;

/**
 * Compatibility wrapper for EXIF consumers.
 */
export const getOriginalExifBlob = getOriginalBlob;

/**
 * Hash an image Blob in bounded chunks for duplicate detection.
 *
 * @param blob
 * @returns The requested result.
 */
export async function hashImageBlob(blob: Blob): Promise<string> { return hashBlob(blob); }

/**
 * Compatibility wrapper that reopens a package from a user gesture.
 */
/**
Reopen a saved package handle and return whether reconciliation succeeded. @param id Package id.
 
 * @param id
 */
export async function reopenPackage(id: string): Promise<boolean> {
  const record = await getPackage(id);
  if (!record?.handle) return false;
  try {
    if (await record.handle.requestPermission({ mode: "read" }) !== "granted") return false;
    const result = await reselect(id, await record.handle.getFile(), record.handle);
    return result.ok;
  } catch { return false; }
}

/**
 * Remove an unused package record.
 *
 * @param id
 * @param usedPackageIds
 */
export async function forgetPackageWhenUnused(id: string, usedPackageIds: string[]): Promise<void> {
  if (!usedPackageIds.includes(id)) await remove(id);
}

/**
 * Compatibility alias matching the established package API name.
 */
export const verifiedOriginalFileCompat = verifiedOriginalFile;

export {reselect, restoreAll, requestAccess, subscribe, getSnapshot, findByIdentity, importFile, getPreviewBlob, getOriginalBlob, getVerifiedOriginalFile, remove} from "./packageSession";
