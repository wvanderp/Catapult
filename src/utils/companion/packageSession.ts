import { savePackage, getPackage as getStoredPackage, listPackages, removePackageRecord, clearPackageStore } from "./packageStore";
import { cacheZip, cachedFile, forgetZip, getCachedEntries, inspectZip, samePhotoIds, sliceEntry, verifiedPreview } from "./zipReader";
import { hashBlob } from "./sha256";
import type { BrowserFileHandle, ImportedPhoto, PackageAvailability, PackageRecord, PackageSessionSnapshot } from "./types";

const states = new Map<string, PackageAvailability>();
const records = new Map<string, PackageRecord>();
const listeners = new Set<() => void>();
let snapshot: PackageSessionSnapshot = Object.freeze({ packages: Object.freeze({}), states: Object.freeze({}) });
let active = 0;
let verificationActive = false;
const waiting: Array<{ resolve: () => void; reject: (error: unknown) => void; signal?: AbortSignal; abort?: () => void }> = [];
const verificationWaiting: Array<() => void> = [];
const reselectTails = new Map<string, Promise<void>>();
type Result = { ok: true } | { ok: false; reason: "mismatch" | "invalid" | "missing" | "permission"; message: string };

/**
 * Publish immutable copies of current package records and availability states.
 */
function publish(): void {
  performance.mark("catapult:publish:start");
  const packages = Object.fromEntries([...records].map(([id, record]) => [id, freezeDeep({ ...record, manifest: structuredClone(record.manifest) })]));
  snapshot = Object.freeze({ packages: Object.freeze(packages), states: Object.freeze(Object.fromEntries(states)) });
  for (const listener of listeners) listener();
  performance.mark("catapult:publish:end");
}

/**
 * Freeze a detached record graph before exposing it to subscribers.
 *
 * @param value Detached object graph to freeze.
 * @returns The same value with all reachable objects frozen.
 */
function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Subscribe to published package changes.
 *
 * @param listener Callback invoked after a snapshot is published.
 * @returns Function that removes the subscription.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/**
 * Return the latest stable package snapshot.
 *
 * @returns The result of the requested package session operation.
 */
export function getSnapshot(): PackageSessionSnapshot {
  return snapshot;
}

/**
 * Acquire one of four slots, removing abort listeners when a waiter leaves the queue.
 *
 * @param signal Optional cancellation signal for the queued read.
 * @returns The result of the requested package session operation.
 */
async function enterQueue(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  let transferred = false;
  if (active >= 4) await new Promise<void>((resolve, reject) => {
    const item: typeof waiting[number] = { resolve, reject, signal };
    item.abort = () => { const index = waiting.indexOf(item); if (index !== -1) waiting.splice(index, 1); reject(signal?.reason ?? new DOMException("Aborted", "AbortError")); };
    waiting.push(item);
    signal?.addEventListener("abort", item.abort, { once: true });
  }).then(() => { transferred = true; });
  if (!transferred) active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = waiting.shift();
    if (next) { next.signal?.removeEventListener("abort", next.abort!); next.resolve(); }
    else active--;
  };
}

/**
 * Acquire the separate single slot reserved for full original verification.
 *
 * @returns The result of the requested package session operation.
 */
async function enterVerificationQueue(): Promise<() => void> {
  if (verificationActive) await new Promise<void>((resolve) => { verificationWaiting.push(resolve); });
  verificationActive = true;
  return () => { verificationActive = false; verificationWaiting.shift()?.(); };
}

/**
 * Inspect a selected ZIP and persist its record before publishing it.
 *
 * @param file Selected ZIP file to inspect and persist.
 * @param handle Optional browser file handle associated with the package.
 * @returns The result of the requested package session operation.
 */
export async function importFile(file: File, handle?: BrowserFileHandle): Promise<{ record: PackageRecord; photos: ImportedPhoto[] }> {
  const result = await inspectZip(file, handle);
  performance.mark("catapult:persist:start");
  try { await savePackage(result.record); }
  catch (error) { forgetZip(result.record.id); throw error; }
  performance.mark("catapult:persist:end");
  records.set(result.record.id, result.record);
  states.set(result.record.id, "available");
  publish();
  return { record: result.record, photos: result.photos };
}

/**
 * Find an imported package by its content identity.
 *
 * @param identity Content identity used to find an existing package.
 * @returns The result of the requested package session operation.
 */
export async function findByIdentity(identity: string): Promise<PackageRecord | undefined> {
  let match: PackageRecord | undefined;
  for (const record of records.values()) if (record.identity === identity) { match = record; break; }
  if (match) return match;
  const savedRecords = await listPackages();
  const stored = savedRecords.find((record) => record.identity === identity);
  if (stored) { records.set(stored.id, stored); states.set(stored.id, "unselected"); publish(); }
  return stored;
}

/**
 * Restore persisted records without prompting for permissions.
 *
 * @returns The result of the requested package session operation.
 */
export async function restoreAll(): Promise<void> {
  const savedRecords = await listPackages();
  for (const record of savedRecords) {
    records.set(record.id, record);
    if (cachedFile(record.id)) states.set(record.id, "available");
    else if (record.handle) {
      try {
        if (await record.handle.queryPermission({ mode: "read" }) === "granted") {
          const file = await record.handle.getFile();
          const result = await reselect(record.id, file, record.handle);
          if (!result.ok && result.reason === "invalid") states.set(record.id, "unselected");
        }
        else {states.set(record.id, "needs-permission");}
      } catch (error) { states.set(record.id, isMissing(error) ? "missing" : "needs-permission"); }
    }
    else {states.set(record.id, "unselected");}
  }
  publish();
}

/**
 * Request read access and return a typed outcome without changing state on failure.
 *
 * @param id Package identifier used to locate the saved record.
 * @returns The result of the requested package session operation.
 */
export async function requestAccess(id: string): Promise<Result> {
  const record = records.get(id) ?? await getStoredPackage(id);
  if (!record) return { ok: false, reason: "missing", message: "Package record does not exist" };
  if (!record.handle) return { ok: false, reason: "permission", message: "Package has no saved file handle" };
  try {
    return await record.handle.requestPermission({ mode: "read" }) === "granted" ? reselect(id, await record.handle.getFile(), record.handle) : { ok: false, reason: "permission", message: "Read permission was not granted" };
  } catch (error) { return { ok: false, reason: isMissing(error) ? "missing" : "permission", message: errorMessage(error) }; }
}

/**
 * Reconcile a newly selected ZIP with saved work; failures preserve the working package state.
 *
 * @param id Package identifier used to locate the saved record.
 * @param file Selected ZIP file to inspect and persist.
 * @param handle Optional browser file handle associated with the package.
 * @returns The result of the requested package session operation.
 */
export async function reselect(id: string, file: File, handle?: BrowserFileHandle): Promise<Result> {
  const previous = reselectTails.get(id) ?? Promise.resolve();
  const { promise: tail, resolve: release } = Promise.withResolvers<void>();
  reselectTails.set(id, tail);
  await previous;
  try {
    return await reselectExclusive(id, file, handle);
  } finally {
    release();
    if (reselectTails.get(id) === tail) reselectTails.delete(id);
  }
}

/**
 * Perform a reselect while holding the per-package serialization slot.
 *
 * @param id Package identifier used to locate the saved record.
 * @param file Selected ZIP file to inspect and persist.
 * @param handle Optional browser file handle associated with the package.
 * @returns The result of the requested package session operation.
 */
async function reselectExclusive(id: string, file: File, handle?: BrowserFileHandle): Promise<Result> {
  const record = records.get(id) ?? await getStoredPackage(id);
  if (!record) return { ok: false, reason: "missing", message: "Package record does not exist" };
  const inspectionId = crypto.randomUUID();
  try {
    let inspected: Awaited<ReturnType<typeof inspectZip>> | undefined;
    if (file.size !== record.size || file.lastModified !== record.lastModified || !cachedFile(id)) inspected = await inspectZip(file, handle, inspectionId);
    if (inspected && (inspected.record.identity !== record.identity || !samePhotoIds(inspected.record.manifest, record.manifest))) {
      forgetZip(inspectionId);
      return { ok: false, reason: "mismatch", message: "Selected package originals do not match saved work" };
    }
    const updated: PackageRecord = { ...record, name: file.name, size: file.size, lastModified: file.lastModified, ...(handle && { handle }) };
    await savePackage(updated);
    if (inspected) cacheZip(id, file, inspected.entries);
    records.set(id, updated);
    states.set(id, "available");
    publish();
    return { ok: true };
  } catch (error) {
    forgetZip(inspectionId);
    return isMissing(error)
      ? { ok: false, reason: "missing", message: errorMessage(error) }
      : { ok: false, reason: "invalid", message: errorMessage(error) };
  }
}

/**
 * Return a package record by id.
 *
 * @param id Package identifier used to locate the saved record.
 * @returns The result of the requested package session operation.
 */
export async function getPackage(id: string): Promise<PackageRecord | undefined> {
  return records.get(id) ?? getStoredPackage(id);
}
/**
 * Resolve an available file without prompting.
 *
 * @param record Package record whose data is being resolved.
 * @returns The result of the requested package session operation.
 */
async function packageFile(record: PackageRecord): Promise<File | undefined> {
  const cached = cachedFile(record.id);
  if (cached && cached.size === record.size && cached.lastModified === record.lastModified) return cached;
  if (!record.handle) return undefined;
  try {
    if (await record.handle.queryPermission({ mode: "read" }) !== "granted") return undefined;
    const file = await record.handle.getFile();
    const result = await reselect(record.id, file, record.handle);
    return result.ok ? file : undefined;
  } catch (error) {
    if (isMissing(error)) { forgetZip(record.id); states.set(record.id, "missing"); publish(); }
    return undefined;
  }
}

/**
 * Load a JPEG preview through the bounded package queue.
 *
 * @param id Package identifier used to locate the saved record.
 * @param photoId Photo identifier within the package.
 * @param kind Package entry kind to read.
 * @param signal Optional cancellation signal for the queued read.
 * @returns The result of the requested package session operation.
 */
export async function getPreviewBlob(id: string, photoId: string, kind: "thumbnail" | "working", signal?: AbortSignal): Promise<Blob> {
  return getBlob(id, photoId, kind, signal);
}
/**
 * Lazily slice an original without verifying its hash.
 *
 * @param id Package identifier used to locate the saved record.
 * @param photoId Photo identifier within the package.
 * @param signal Optional cancellation signal for the queued read.
 * @returns The result of the requested package session operation.
 */
export async function getOriginalBlob(id: string, photoId: string, signal?: AbortSignal): Promise<Blob> {
  return getBlob(id, photoId, "original", signal, false);
}

/**
 * Resolve and slice a package entry; only preview bytes are hash-verified here.
 *
 * @param id Package identifier used to locate the saved record.
 * @param photoId Photo identifier within the package.
 * @param kind Package entry kind to read.
 * @param signal Optional cancellation signal for the queued read.
 * @param verifyOriginal Whether to verify the original file hash.
 * @param usePreviewQueue Whether to acquire a preview read slot.
 * @returns The result of the requested package session operation.
 */
async function getBlob(id: string, photoId: string, kind: "thumbnail" | "working" | "original", signal?: AbortSignal, verifyOriginal = false, usePreviewQueue = true): Promise<Blob> {
  const release = usePreviewQueue ? await enterQueue(signal) : () => {};
  try {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const record = await getPackage(id);
    if (!record) throw new Error("Companion package record is missing");
    const photo = record.manifest.photos.find((item) => item.id === photoId);
    if (!photo) throw new Error("Photo is not present in its companion package");
    const file = await packageFile(record);
    if (!file) throw new Error("Package is unavailable. Select the package again.");
    const entries = getCachedEntries(id);
    if (!entries) throw new Error("Package directory is not available");
    try {
      const path = kind === "original" ? photo.originalPath : photo.previewPaths[kind];
      const blob = await sliceEntry(file, entries, path, kind === "original" ? photo.mimeType : "image/jpeg");
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      if (kind === "original" && verifyOriginal && await hashBlob(blob, signal) !== photo.sha256) throw new Error(`Original ${photo.originalFilename} failed SHA-256 verification`);
      if (kind !== "original") await verifiedPreview(blob, photo.previewHashes[kind], kind);
      return blob;
    } catch (error) {
      if (isMissing(error)) { forgetZip(id); states.set(id, "missing"); publish(); }
      throw error;
    }
  } finally { release(); }
}

/**
 * Return a fully verified original as a named File using its own one-slot queue.
 *
 * @param id Package identifier used to locate the saved record.
 * @param photoId Photo identifier within the package.
 * @returns The result of the requested package session operation.
 */
export async function getVerifiedOriginalFile(id: string, photoId: string): Promise<File> {
  const record = await getPackage(id);
  const photo = record?.manifest.photos.find((item) => item.id === photoId);
  if (!photo) throw new Error("Photo is not present in its companion package");
  const release = await enterVerificationQueue();
  try {
    const blob = await getBlob(id, photoId, "original", undefined, false, false);
    if (await hashBlob(blob) !== photo.sha256) throw new Error(`Original ${photo.originalFilename} failed SHA-256 verification`);
    return new File([blob], photo.sourceFilename ?? photo.originalFilename, { type: photo.mimeType });
  } finally { release(); }
}

/**
 * Remove a package and its cached file data.
 *
 * @param id Package identifier used to locate the saved record.
 * @returns The result of the requested package session operation.
 */
export async function remove(id: string): Promise<void> {
  forgetZip(id);
  await removePackageRecord(id);
  records.delete(id);
  states.delete(id);
  publish();
}
/**
 * Delete persisted packages, then clear caches and publish the empty snapshot.
 *
 * @returns The result of the requested package session operation.
 */
export async function clear(): Promise<void> {
  await clearPackageStore();
  for (const id of records.keys()) forgetZip(id);
  records.clear();
  states.clear();
  publish();
}
/**
 * Perform the documented package session operation.
 *
 * @param error Caught error to classify or format.
 * @returns The result of the requested package session operation.
 */
function isMissing(error: unknown): boolean {
  return error instanceof DOMException && ["NotFoundError", "NotReadableError"].includes(error.name);
}
/**
 * Perform the documented package session operation.
 *
 * @param error Caught error to classify or format.
 * @returns The result of the requested package session operation.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Package file could not be read";
}
