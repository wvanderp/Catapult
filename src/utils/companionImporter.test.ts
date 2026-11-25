/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description -- Existing fixture helpers are self-explanatory. */
import "fake-indexeddb/auto";
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { afterEach, describe, expect, it } from "vitest";
import { inspectCompanion, clearCompanionDatabase, packageEntryBlob, verifiedOriginalFile, isLargeOriginal, type BrowserFileHandle } from "./companion";
import { reselect } from "./companion/packageSession";

const encoder = new TextEncoder();
const raw = encoder.encode("original TIFF-like bytes");
const thumb = encoder.encode("thumb");
const working = encoder.encode("working");
/**
 *
 * @param data
 */
async function sha(data: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(data).buffer as ArrayBuffer))].map((value) => value.toString(16).padStart(2, "0")).join("");
}

/**
 *
 * @param options
 * @param options.extra
 * @param options.duplicate
 * @param options.compressed
 * @param options.mismatch
 * @param options.manifestMismatch
 */
async function makePackage(options: { extra?: boolean; duplicate?: boolean; compressed?: boolean; mismatch?: boolean; manifestMismatch?: boolean } = {}): Promise<File> {
  const id = "photo1";
  const alteredRaw = Uint8Array.from(raw);
  if (options.mismatch || options.manifestMismatch) alteredRaw[0] = (alteredRaw[0] ?? 0) ^ 1;
  const manifest = {
    format: "catapult-photo-package", version: 1, createdAt: "2026-01-01T00:00:00.000Z",
    generator: { name: "tests", version: "1" },
    entries: [`photos/${id}/metadata.json`, `photos/${id}/original/a.tif`, `photos/${id}/previews/thumbnail.jpg`, `photos/${id}/previews/working.jpg`],
    photos: [{ id, metadataPath: `photos/${id}/metadata.json`, originalPath: `photos/${id}/original/a.tif`, originalFilename: "a.tif", mimeType: "image/tiff", format: "tiff", size: raw.length, sha256: await sha(options.manifestMismatch ? alteredRaw : raw), previewPaths: { thumbnail: `photos/${id}/previews/thumbnail.jpg`, working: `photos/${id}/previews/working.jpg` }, previewHashes: { thumbnail: await sha(thumb), working: await sha(working) }, previewSizes: { thumbnail: thumb.length, working: working.length }, attachmentIds: [] }],
    attachments: [], extensions: {},
  };
  const metadata = {
    schemaVersion: 1, id, source: { originalPath: "/source/a.tif", discoveredAt: "2026-01-01T00:00:00.000Z", modifiedAt: "2026-01-01T00:00:00.000Z", size: raw.length },
    original: { entryPath: manifest.photos[0]!.originalPath, filename: "a.tif", format: "tiff", mimeType: "image/tiff", sha256: manifest.photos[0]!.sha256, size: raw.length },
    previews: { thumbnail: { entryPath: manifest.photos[0]!.previewPaths.thumbnail, sha256: manifest.photos[0]!.previewHashes.thumbnail, size: thumb.length, width: 1, height: 1 }, working: { entryPath: manifest.photos[0]!.previewPaths.working, sha256: manifest.photos[0]!.previewHashes.working, size: working.length, width: 1, height: 1 } },
    attachments: [], raw: { state: "collection-disabled", attachmentIds: [], matchedBy: "disabled" }, tiff: { pageCount: 1, selectedPage: 0 }, processing: [], extensions: {},
  };
  const output = new BlobWriter("application/zip");
  const zip = new ZipWriter(output);
  const items: [string, Blob][] = [
    ["manifest.json", new Blob([JSON.stringify(manifest)])],
    [metadata && `photos/${id}/metadata.json`, new Blob([JSON.stringify(metadata)])],
    [manifest.photos[0]!.originalPath, new Blob([options.mismatch || options.manifestMismatch ? alteredRaw : raw])],
    [manifest.photos[0]!.previewPaths.thumbnail, new Blob([thumb])],
    [manifest.photos[0]!.previewPaths.working, new Blob([working])],
  ];
  if (options.extra) items.push(["evil.txt", new Blob(["extra"])]);
  for (const [name, blob] of items) await zip.add(name, new BlobReader(blob), { compressionMethod: options.compressed ? 8 : 0 });
  if (options.duplicate) await zip.add("evil.txt", new BlobReader(new Blob(["duplicate"])), { compressionMethod: 0 });
  const result = await zip.close();
  return new File([result], "photos.zip", { type: "application/zip" });
}

afterEach(async () => clearCompanionDatabase());

describe("companion ZIP importer", () => {
  it("reads real STORE ZIP packages and slices TIFF originals while preserving JPEG previews", async () => {
    const file = await makePackage();
    const { record, photos } = await inspectCompanion(file);
    expect(photos[0]?.mimeType).toBe("image/tiff");
    const preview = await packageEntryBlob(record.id, "photo1", "thumbnail");
    expect(preview.type).toBe("image/jpeg");
    const original = await verifiedOriginalFile(record.id, "photo1");
    expect(original.type).toBe("image/tiff");
    expect(original.name).toBe("a.tif");
  });

  it.each([{ extra: true }, { compressed: true }, { duplicate: true }])("rejects archive set violations %#", async (options) => {
    await expect(inspectCompanion(await makePackage(options))).rejects.toThrow();
  });

  it("rejects original content whose hash changed after import", async () => {
    const { record } = await inspectCompanion(await makePackage({ mismatch: true }));
    await expect(verifiedOriginalFile(record.id, "photo1")).rejects.toThrow(/SHA-256 verification/);
  });

  it("applies the 100 MiB warning boundary", () => {
    expect(isLargeOriginal(100 * 1024 * 1024)).toBe(false);
    expect(isLargeOriginal(100 * 1024 * 1024 + 1)).toBe(true);
  });

  it("accepts an unchanged selected package without persisting a test-only handle", async () => {
    const file = await makePackage();
    const handle = {
      name: file.name,
      getFile: async () => file,
      queryPermission: async () => "prompt" as PermissionState,
      requestPermission: async () => "granted" as PermissionState,
    } as BrowserFileHandle;
    const { record } = await inspectCompanion(file);
    expect(await reselect(record.id, await handle.getFile())).toEqual({ ok: true });
  });

  it("rejects a reopened ZIP whose manifest has different original hashes", async () => {
    const originalFile = await makePackage();
    const changedFile = await makePackage({ manifestMismatch: true });
    const { record } = await inspectCompanion(originalFile);
    const handle = {
      name: originalFile.name,
      getFile: async () => changedFile,
      queryPermission: async () => "prompt" as PermissionState,
      requestPermission: async () => "granted" as PermissionState,
    } as BrowserFileHandle;
    expect(await reselect(record.id, await handle.getFile(), handle)).toMatchObject({ ok: false, reason: "mismatch" });
  });
});
