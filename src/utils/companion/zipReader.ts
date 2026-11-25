/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns, jsdoc/require-returns-check -- Function contracts are documented in their prose summaries. */
import { BlobReader, BlobWriter, type FileEntry, ZipReader } from "@zip.js/zip.js";
import { crossValidate, parseManifest, parsePhotoMetadata, type PackageManifest } from "@catapult/package-format";
import { hashBlob } from "./sha256";
import type { BrowserFileHandle, ImportedPhoto, PackageRecord } from "./types";

const JSON_LIMIT = 4 * 1024 * 1024;
const ENTRY_LIMIT = 10000;
const CENTRAL_DIRECTORY_LIMIT = 64 * 1024 * 1024;
const INSPECTION_CONCURRENCY = 16;
const zipCache = new Map<string, { file: File; entries: Map<string, FileEntry> }>();

/**
Reject archives whose declared directory would exceed parser limits.
 
 * @param file
 */
async function checkDirectoryLimits(file: File): Promise<void> {
  const tailStart = Math.max(0, file.size - 65_557);
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  let eocd = -1;
  for (let offset = tail.byteLength - 22; offset >= 0; offset--) {
    if (tail.getUint32(offset, true) === 0x06054B50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("ZIP end-of-central-directory record is missing");
  let count = tail.getUint16(eocd + 10, true);
  let size = tail.getUint32(eocd + 12, true);
  if (count === 0xFFFF || size === 0xFFFFFFFF) {
    const locatorOffset = tailStart + eocd - 20;
    if (locatorOffset < 0) throw new Error("ZIP64 end-of-central-directory locator is missing");
    const locator = new DataView(await file.slice(locatorOffset, locatorOffset + 20).arrayBuffer());
    if (locator.getUint32(0, true) !== 0x07064B50) throw new Error("ZIP64 end-of-central-directory locator is missing");
    const recordOffset = Number(locator.getBigUint64(8, true));
    const record = new DataView(await file.slice(recordOffset, recordOffset + 56).arrayBuffer());
    if (record.getUint32(0, true) !== 0x06064B50) throw new Error("ZIP64 end-of-central-directory record is invalid");
    count = Number(record.getBigUint64(32, true));
    size = Number(record.getBigUint64(40, true));
  }
  if (count > ENTRY_LIMIT) throw new Error("Package contains too many ZIP entries");
  if (size > CENTRAL_DIRECTORY_LIMIT) throw new Error("Package central directory exceeds the 64 MiB limit");
}

/**
Determine a descriptor's full length only when its CRC and sizes match.
 
 * @param bytes
 * @param entry
 */
function descriptorLengthOf(bytes: DataView, entry: FileEntry): number {
  for (const signature of [true, false]) {
    const prefix = signature ? 4 : 0;
    if (signature && (bytes.byteLength < 4 || bytes.getUint32(0, true) !== 0x08074B50)) continue;
    for (const zip64 of [entry.compressedSize > 0xFFFFFFFF, false, true]) {
      const length = prefix + 4 + (zip64 ? 16 : 8);
      if (bytes.byteLength < length) continue;
      const crc = bytes.getUint32(prefix, true);
      const compressed = zip64 ? Number(bytes.getBigUint64(prefix + 4, true)) : bytes.getUint32(prefix + 4, true);
      const uncompressed = zip64 ? Number(bytes.getBigUint64(prefix + 12, true)) : bytes.getUint32(prefix + 8, true);
      if (crc === (entry.crc32 ?? 0) && compressed === entry.compressedSize && uncompressed === entry.uncompressedSize) return length;
    }
  }
  throw new Error(`Data descriptor disagrees with central directory: ${entry.filename}`);
}

/**
Open a ZIP entry as a bounded text JSON value.
 
 * @param entry
 * @returns The requested result.
 */
async function readJson(entry: FileEntry): Promise<unknown> {
  if (entry.uncompressedSize > JSON_LIMIT) throw new Error(`${entry.filename} exceeds the 4 MiB JSON limit`);
  const json = await entry.getData!(new BlobWriter("application/json"));
  return JSON.parse(await json.text()) as unknown;
}

/**
 * Run bounded concurrent work while keeping results in input order.
 *
 * @param items Items to process.
 * @param worker Work performed for each item.
 * @param concurrency Maximum number of workers to run at once.
 * @returns Results corresponding to the input order.
 */
async function mapBounded<T, R>(items: readonly T[], worker: (item: T) => Promise<R>, concurrency = INSPECTION_CONCURRENCY): Promise<R[]> {
  const results = Array.from({ length: items.length }, () => undefined as R);
  let next = 0;
  let failure: unknown;
  let failed = false;
  /**
   * Run work until all items are claimed or one worker fails.
   */
  async function drain(): Promise<void> {
    while (true) {
      if (failed) return;
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await worker(items[index]!); }
      catch (error) { if (!failed) failure = error; failed = true; return; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, drain));
  if (failed) throw failure;
  return results;
}

/**
Return the manifest-declared uncompressed size for a content path.
 
 * @param manifest description.
 * @param path
 * @returns The requested result.
 */
function expectedSize(manifest: PackageManifest, path: string): number | undefined {
  for (const photo of manifest.photos) {
    if (photo.originalPath === path) return photo.size;
    if (photo.previewPaths.thumbnail === path) return photo.previewSizes.thumbnail;
    if (photo.previewPaths.working === path) return photo.previewSizes.working;
  }
  return manifest.attachments.find((item) => item.entryPath === path)?.size;
}

/**
Return the identity built from sorted original hashes and photo ids.
 
 * @param manifest
 * @returns The requested result.
 */
export async function packageIdentity(manifest: PackageManifest): Promise<string> {
  const values = manifest.photos.map((photo) => `${photo.sha256}:${photo.id}`).toSorted((left, right) => left.localeCompare(right));
  return hashBlob(new Blob([values.join("\n")]));
}

/**
Check that the saved photo ids still match an inspected package.
 
 * @param left
 * @param right
 * @returns The requested result.
 */
export function samePhotoIds(left: PackageManifest, right: PackageManifest): boolean {
  return left.photos.map((photo) => photo.id).toSorted((first, second) => first.localeCompare(second)).join("\n") === right.photos.map((photo) => photo.id).toSorted((first, second) => first.localeCompare(second)).join("\n");
}

/**
Inspect a ZIP without reading content entries into memory.
 
 * @param file
 * @param handle
 * @param id
 */
export async function inspectZip(file: File, handle?: BrowserFileHandle, id: string = crypto.randomUUID()): Promise<{ record: PackageRecord; photos: ImportedPhoto[]; entries: Map<string, FileEntry> }> {
  performance.mark("catapult:inspect:start");
  await checkDirectoryLimits(file);
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries: FileEntry[] = [];
    let centralSize = 0;
    for await (const entry of reader.getEntriesGenerator()) {
      if (entry.directory) throw new Error("ZIP directory entries are not permitted");
      if (entry.filename.length > 4096) throw new Error("ZIP entry name exceeds the 4096 character limit");
      if (entries.length >= ENTRY_LIMIT) throw new Error("Package contains too many ZIP entries");
      centralSize += (entry.filenameLength ?? entry.rawFilename.length) + (entry.extraFieldLength ?? 0) + entry.comment.length + 46;
      if (centralSize > CENTRAL_DIRECTORY_LIMIT) throw new Error("Package central directory exceeds the 64 MiB limit");
      entries.push(entry);
    }
    const names = entries.map((entry) => entry.filename);
    if (new Set(names).size !== names.length) throw new Error("ZIP contains duplicate central-directory entries");
    const byName = new Map(entries.map((entry) => [entry.filename, entry]));
    const manifestEntry = byName.get("manifest.json");
    if (!manifestEntry) throw new Error("Package is missing manifest.json");
    const manifest = parseManifest(await readJson(manifestEntry));
    const expectedNames = new Set(["manifest.json", ...manifest.entries]);
    if (expectedNames.size !== names.length || names.some((name) => !expectedNames.has(name))) throw new Error("ZIP entries do not exactly match the manifest");
    performance.mark("catapult:inspect:headers:start");
    const spans = await mapBounded(entries, async (entry): Promise<[number, number]> => {
      if (entry.encrypted || entry.compressionMethod !== 0 || entry.compressedSize !== entry.uncompressedSize) throw new Error(`Entry ${entry.filename} must be unencrypted and STORE-compressed`);
      if (entry.offset < 0 || entry.offset + 30 > file.size) throw new Error(`ZIP entry exceeds file bounds: ${entry.filename}`);
      const local = new DataView(await file.slice(entry.offset, entry.offset + 30).arrayBuffer());
      if (local.getUint32(0, true) !== 0x04034B50) throw new Error(`Invalid local header: ${entry.filename}`);
      const flags = local.getUint16(6, true);
      const method = local.getUint16(8, true);
      const nameLength = local.getUint16(26, true);
      const extraLength = local.getUint16(28, true);
      if (nameLength > 4096) throw new Error("ZIP local entry name exceeds the 4096 byte limit");
      if (entry.offset + 30 + nameLength + extraLength > file.size) throw new Error(`ZIP local header exceeds file bounds: ${entry.filename}`);
      const localParts = new Uint8Array(await file.slice(entry.offset + 30, entry.offset + 30 + nameLength + extraLength).arrayBuffer());
      const localName = new TextDecoder().decode(localParts.subarray(0, nameLength));
      if (localName !== entry.filename || flags !== (entry.rawBitFlag ?? 0) || method !== entry.compressionMethod) throw new Error(`Local header disagrees with central directory: ${entry.filename}`);
      const crc = local.getUint32(14, true);
      const compressed = local.getUint32(18, true);
      const uncompressed = local.getUint32(22, true);
      const descriptor = (flags & 8) !== 0;
      const crcMismatch = descriptor ? crc !== 0 && crc !== (entry.crc32 ?? 0) : crc !== (entry.crc32 ?? 0);
      const sizeMismatch = (descriptor ? compressed !== 0 : true) && compressed !== 0xFFFFFFFF && compressed !== entry.compressedSize || (descriptor ? uncompressed !== 0 : true) && uncompressed !== 0xFFFFFFFF && uncompressed !== entry.uncompressedSize;
      if (crcMismatch || sizeMismatch) throw new Error(`Local header sizes or CRC disagree with central directory: ${entry.filename}`);
      let descriptorLength = 0;
      if (flags & 8) {
        const descriptorOffset = entry.offset + 30 + nameLength + extraLength + entry.compressedSize;
        const descriptorBytes = new DataView(await file.slice(descriptorOffset, descriptorOffset + 24).arrayBuffer());
        descriptorLength = descriptorLengthOf(descriptorBytes, entry);
      }
      const end = entry.offset + 30 + nameLength + extraLength + entry.compressedSize + descriptorLength;
      if (end > file.size) throw new Error(`ZIP entry exceeds file bounds: ${entry.filename}`);
      const size = expectedSize(manifest, entry.filename);
      if (entry.filename !== "manifest.json" && size !== undefined && entry.uncompressedSize !== size) throw new Error(`Entry size differs from manifest: ${entry.filename}`);
      return [entry.offset, end];
    });
    performance.mark("catapult:inspect:headers:end");
    spans.sort((left, right) => left[0] - right[0]);
    for (let index = 1; index < spans.length; index++) if (spans[index]![0] < spans[index - 1]![1]) throw new Error("ZIP entries overlap");
    performance.mark("catapult:inspect:metadata:start");
    await mapBounded(manifest.photos, async (photo) => {
      const metadata = parsePhotoMetadata(await readJson(byName.get(photo.metadataPath)!));
      // parseManifest already validated the complete relationship graph. Limit
      // crossValidate's repeated schema parse to the current photo to avoid
      // reparsing all 200 photos and 801 paths once for every metadata file.
      const attachments = manifest.attachments.filter((item) => item.photoIds.includes(photo.id)).map((item) => ({ ...item, photoIds: [photo.id] }));
      crossValidate({
        ...manifest,
        entries: [photo.metadataPath, photo.originalPath, photo.previewPaths.thumbnail, photo.previewPaths.working, ...attachments.map((item) => item.entryPath)],
        photos: [photo],
        attachments,
      }, metadata);
    });
    performance.mark("catapult:inspect:metadata:end");
    const record: PackageRecord = { id, identity: await packageIdentity(manifest), name: file.name, size: file.size, lastModified: file.lastModified, manifest, handle };
    zipCache.set(id, { file, entries: byName });
    performance.mark("catapult:inspect:end");
    return { record, photos: manifest.photos.map((photo) => ({ packageId: id, photoId: photo.id, name: photo.sourceFilename ?? photo.originalFilename, mimeType: photo.mimeType, sha256: photo.sha256, size: photo.size })), entries: byName };
  } finally { await reader.close(); }
}

/**
Forget a previously opened ZIP from the in-memory cache.
 
 * @param id Description.
 */
export function forgetZip(id: string): void {
  zipCache.delete(id);
}

/**
Cache a file and parsed entries for a package id.
 
 * @param id Description.
 * @param file
 * @param entries
 * @returns The requested result.
 */
export function cacheZip(id: string, file: File, entries: Map<string, FileEntry>): void {
  zipCache.set(id, { file, entries });
}

/**
Return a cached file if still present.
 
 * @param id Description.
 * @returns The requested result.
 */
export function cachedFile(id: string): File | undefined { return zipCache.get(id)?.file; }

/**
Return the parsed directory cached for an opened package.
 
 * @param id
 */
export function getCachedEntries(id: string): Map<string, FileEntry> | undefined { return zipCache.get(id)?.entries; }

/**
Slice a stored entry from its containing ZIP file.
 
 * @param file
 * @param entries
 * @param path
 * @param mimeType
 * @returns The requested result.
 */
export async function sliceEntry(file: File, entries: Map<string, FileEntry>, path: string, mimeType: string): Promise<Blob> {
  const entry = entries.get(path);
  if (!entry) throw new Error("Package entry is missing");
  const header = new DataView(await file.slice(entry.offset, entry.offset + 30).arrayBuffer());
  const nameLength = header.getUint16(26, true);
  const extraLength = header.getUint16(28, true);
  const start = entry.offset + 30 + nameLength + extraLength;
  if (start + entry.uncompressedSize > file.size) throw new Error("ZIP entry exceeds file bounds");
  return file.slice(start, start + entry.uncompressedSize, mimeType);
}

/**
Verify a preview slice against its manifest hash.
 
 * @param blob
 * @param expected
 * @param kind
 */
export async function verifiedPreview(blob: Blob, expected: string, kind: string): Promise<Blob> {
  if (await hashBlob(blob) !== expected) throw new Error(`${kind} preview failed SHA-256 verification`);
  return blob;
}
