import "fake-indexeddb/auto";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import exifr from "exifr";
import { afterEach, expect, it } from "vitest";
import { createServices } from "../../packages/cli/src/services.js";
import { clearCompanionDatabase, getOriginalBlob, getPreviewBlob, getVerifiedOriginalFile, importFile } from "./companion/index.js";
import type { AttachmentCandidate, PackageOptions, PackagePlan, PhotoGroup } from "../../packages/cli/src/types.js";

afterEach(async () => clearCompanionDatabase());
const requireCliDependency = createRequire(new URL("../../packages/cli/package.json", import.meta.url));
const sharp = requireCliDependency("sharp") as { (input: { create: { width: number; height: number; channels: number; background: string } }): { withExif(exif: { IFD0: { Artist: string } }): { jpeg(): { toFile(file: string): Promise<unknown> } } }; versions: { sharp?: string } };

it("imports a real CLI ZIP, reads previews and EXIF source bytes, verifies the original, and leaves RAW intact", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-browser-import-"));
  try {
    const originalPath = path.join(root, "original.jpg");
    const rawPath = path.join(root, "original.nef");
    await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).withExif({ IFD0: { Artist: "Catapult integration" } }).jpeg().toFile(originalPath);
    await writeFile(rawPath, Buffer.from("untouched RAW bytes"));
    const rawHash = createHash("sha256").update(await readFile(rawPath)).digest("hex");
    const sourceStats = await stat(originalPath);
    const now = new Date();
    const original = { path: originalPath, filename: "original.jpg", extension: ".jpg", snapshot: { size: sourceStats.size, mtimeMs: sourceStats.mtimeMs }, createdAt: null, modifiedAt: new Date(sourceStats.mtimeMs), discoveredAt: now };
    const rawStats = await stat(rawPath);
    const raw: AttachmentCandidate = { path: rawPath, filename: "original.nef", extension: ".nef", snapshot: { size: rawStats.size, mtimeMs: rawStats.mtimeMs }, createdAt: null, modifiedAt: new Date(rawStats.mtimeMs), discoveredAt: now, role: "raw" };
    const photo: PhotoGroup = { id: "browser-import", jpegCandidates: [original], tiffCandidates: [], selected: true, suggestedOriginal: original, chosenOriginal: original, rawMatch: { state: "accepted", candidates: [raw], chosen: raw, decision: "accept", matchedBy: "exact-basename-mtime" }, sidecarMatches: [] };
    const options: PackageOptions = { sourceDirectory: root, includeRaw: true, includeSidecars: false, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 1 };
    const previewSession = await createServices().preview.generateSession([photo], options, new AbortController().signal, () => {});
    try {
      const preview = previewSession.results[0];
      if (!preview?.ok) throw new Error("Preview generation failed");
      const plan: PackagePlan = { photos: [{ photo, chosenOriginal: original, preview, raw: [raw], sidecars: [] }], outputPath: path.join(root, "browser-import.zip"), options, versions: { generatorName: "Catapult companion CLI", generatorVersion: "0.1.0", sharpVersion: sharp.versions.sharp!, zipVersion: "2.25.0" } };
      await createServices().zip.write(plan, new AbortController().signal);
    } finally { await previewSession.dispose(); }
    const zipBytes = await readFile(path.join(root, "browser-import.zip"));
    const imported = await importFile(new File([zipBytes], "browser-import.zip", { type: "application/zip" }));
    const importedPhoto = imported.photos[0]!;
    expect(await getPreviewBlob(imported.record.id, importedPhoto.photoId, "thumbnail")).toBeInstanceOf(Blob);
    expect(await getPreviewBlob(imported.record.id, importedPhoto.photoId, "working")).toBeInstanceOf(Blob);
    const originalBlob = await getOriginalBlob(imported.record.id, importedPhoto.photoId);
    expect(originalBlob.size).toBe(sourceStats.size);
    expect(await exifr.parse(await originalBlob.arrayBuffer(), { firstChunkSize: 64 * 1024 })).toMatchObject({ Artist: "Catapult integration" });
    expect(await getVerifiedOriginalFile(imported.record.id, importedPhoto.photoId)).toBeInstanceOf(File);
    const rawAfterImport = await readFile(rawPath);
    expect(rawAfterImport.toString()).toBe("untouched RAW bytes");
    expect(createHash("sha256").update(await readFile(rawPath)).digest("hex")).toBe(rawHash);
  } finally { await rm(root, { recursive: true, force: true }); }
});
