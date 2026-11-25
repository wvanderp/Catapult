/* eslint-disable unicorn/max-nested-calls -- ZIP fixture construction naturally nests Blob and zip.js constructors. */
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { hashBlob } from "./sha256";

export interface FixturePhoto { id: string; filename: string; mimeType?: "image/jpeg" | "image/tiff"; bytes?: string }
export interface ArchiveOptions { dataDescriptor?: boolean; zip64?: boolean; directory?: boolean; extra?: boolean }

/**
Build a real, stored ZIP package with valid manifest and per-photo metadata.
 
 * @param photosOrOptions Fixture photos or ZIP structure options.
 * @param name Archive filename.
 * @returns A package ZIP file.
 */
export async function archive(photosOrOptions: FixturePhoto[] | ArchiveOptions = [{ id: "photo-1", filename: "photo.jpg" }], name = "fixture.zip"): Promise<File> {
  const photos = Array.isArray(photosOrOptions) ? photosOrOptions : [];
  const options = Array.isArray(photosOrOptions) ? {} : photosOrOptions;
  const blobs = photos.map((photo) => ({ photo, original: new Blob([photo.bytes ?? `original:${photo.id}`]), thumbnail: new Blob([`thumb:${photo.id}`]), working: new Blob([`working:${photo.id}`]) }));
  const entries: string[] = [];
  const manifestPhotos = [];
  const metadata: unknown[] = [];
  for (const { photo, original, thumbnail, working } of blobs) {
    const base = `photos/${photo.id}`;
    const originalPath = `${base}/original/${photo.filename}`;
    const previewPaths = { thumbnail: `${base}/previews/thumbnail.jpg`, working: `${base}/previews/working.jpg` };
    const metadataPath = `${base}/metadata.json`;
    entries.push(metadataPath, originalPath, ...Object.values(previewPaths));
    const mimeType = photo.mimeType ?? "image/jpeg";
    const format = mimeType === "image/tiff" ? "tiff" : "jpeg";
    const hashes = { original: await hashBlob(original), thumbnail: await hashBlob(thumbnail), working: await hashBlob(working) };
    manifestPhotos.push({ id: photo.id, metadataPath, originalPath, originalFilename: photo.filename, mimeType, format, size: original.size, sha256: hashes.original, previewPaths, previewHashes: { thumbnail: hashes.thumbnail, working: hashes.working }, previewSizes: { thumbnail: thumbnail.size, working: working.size }, attachmentIds: [] });
    metadata.push({ schemaVersion: 1, id: photo.id, source: { originalPath: photo.filename, discoveredAt: "2026-01-01T00:00:00.000Z", modifiedAt: "2026-01-01T00:00:00.000Z", size: original.size }, original: { entryPath: originalPath, filename: photo.filename, format, mimeType, sha256: hashes.original, size: original.size }, previews: { thumbnail: { entryPath: previewPaths.thumbnail, sha256: hashes.thumbnail, size: thumbnail.size, width: 1, height: 1 }, working: { entryPath: previewPaths.working, sha256: hashes.working, size: working.size, width: 1, height: 1 } }, attachments: [], raw: { state: "accepted-missing", attachmentIds: [], matchedBy: "missing" }, ...((format === "tiff") && { tiff: { pageCount: 1, selectedPage: 0 } }), processing: [], extensions: {} });
  }
  const manifest = { format: "catapult-photo-package", version: 1, createdAt: "2026-01-01T00:00:00.000Z", generator: { name: "test", version: "1" }, entries, photos: manifestPhotos, attachments: [], extensions: {} };
  const output = new BlobWriter("application/zip");
  const writer = new ZipWriter(output);
  await writer.add("manifest.json", new BlobReader(new Blob([JSON.stringify(manifest)])), { compressionMethod: 0, dataDescriptor: options.dataDescriptor, zip64: options.zip64 });
  if (options.directory) await writer.add("folder/", new BlobReader(new Blob()), { directory: true });
  if (options.extra) await writer.add("extra", new BlobReader(new Blob(["x"])), { compressionMethod: 0 });
  for (const [index, blob] of blobs.entries()) {
    const { original, thumbnail, working } = blob!;
    const paths = manifestPhotos[index]!;
    await writer.add(paths.metadataPath, new BlobReader(new Blob([JSON.stringify(metadata[index])])), { compressionMethod: 0 });
    await writer.add(paths.originalPath, new BlobReader(original), { compressionMethod: 0 });
    await writer.add(paths.previewPaths.thumbnail, new BlobReader(thumbnail), { compressionMethod: 0 });
    await writer.add(paths.previewPaths.working, new BlobReader(working), { compressionMethod: 0 });
  }
  return new File([await writer.close()], name, { lastModified: 1 });
}
