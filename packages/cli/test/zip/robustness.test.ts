import { mkdtemp, mkdir, readFile, readdir, rm, stat, chmod, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import { crossValidate } from "@catapult/package-format";
import { expect, it } from "vitest";
import type { FileCandidate, PackagePlan, PhotoGroup } from "../../src/types.js";
import { createZipWriter } from "../../src/zip/index.js";

it("settles fifty seeded aborts promptly and leaves no output behind", async () => {
  let seed = 305_419_896;
  const random = (): number => { seed = (1_664_525 * seed + 1_013_904_223) >>> 0; return seed / 4_294_967_296; };
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-abort-"));
  try {
    const source = path.join(root, "source.jpg");
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).jpeg().toFile(source);
    const info = await stat(source); const now = new Date();
    const candidate: FileCandidate = { path: source, filename: "source.jpg", extension: ".jpg", snapshot: { size: info.size, mtimeMs: info.mtimeMs }, createdAt: null, modifiedAt: now, discoveredAt: now };
    const photo: PhotoGroup = { id: "p1", jpegCandidates: [candidate], tiffCandidates: [], selected: true, suggestedOriginal: candidate, chosenOriginal: candidate, rawMatch: { state: "disabled", candidates: [], chosen: null, decision: null, matchedBy: "disabled" }, sidecarMatches: [] };
    const previewPath = path.join(root, "preview.jpg"); await sharp(source).toFile(previewPath); const previewInfo = await stat(previewPath); const previewHash = createHash("sha256").update(await readFile(previewPath)).digest("hex");
    const plan: PackagePlan = { photos: [{ photo, chosenOriginal: candidate, preview: { ok: true, photoId: photo.id, artifacts: [{ kind: "thumbnail", path: previewPath, width: 8, height: 8, size: previewInfo.size, sha256: previewHash, format: "jpeg" }, { kind: "working", path: previewPath, width: 8, height: 8, size: previewInfo.size, sha256: previewHash, format: "jpeg" }], pageCount: 1, multiPage: false, steps: [], warnings: [] }, raw: [], sidecars: [] }], outputPath: "", options: { sourceDirectory: root, includeRaw: false, includeSidecars: false, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 1 }, versions: { generatorName: "test", generatorVersion: "1", sharpVersion: sharp.versions.sharp!, zipVersion: "2" } };
    for (let index = 0; index < 50; index++) {
      const outputPath = path.join(root, `abort-${index}.zip`); const controller = new AbortController();
      let abortScheduled = false;
      const result = createZipWriter().write({ ...plan, outputPath }, controller.signal, (event) => {
        if (!abortScheduled && event.stage === "hash") { abortScheduled = true; setTimeout(() => controller.abort(), random() * 5); }
      }).catch(() => null);
      await Promise.race([result, new Promise((_, reject) => setTimeout(() => reject(new Error("abort did not settle in five seconds")), 5000))]);
      await expect(stat(outputPath)).rejects.toMatchObject({ code: "ENOENT" });
      const names = await readdir(root);
      expect(names.some((name) => name === path.basename(outputPath) || name.startsWith(`.abort-${index}.zip.`)), names.join(", ")).toBe(false);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("handles invalid output and missing source paths and writes a STORE package with many entries", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-robust-"));
  try {
    const source = path.join(root, "source.jpg"); const sidecarPath = path.join(root, "note.xmp");
    await sharp({ create: { width: 4, height: 4, channels: 3, background: "blue" } }).jpeg().toFile(source);
    await writeFile(sidecarPath, "tiny attachment");
    const previewPath = path.join(root, "preview.jpg"); const workingPath = path.join(root, "working.jpg"); await sharp(source).toFile(previewPath); await sharp(source).resize(3, 3).toFile(workingPath);
    const info = await stat(source); const previewInfo = await stat(previewPath); const now = new Date();
    const candidate: FileCandidate = { path: source, filename: "source.jpg", extension: ".jpg", snapshot: { size: info.size, mtimeMs: info.mtimeMs }, createdAt: null, modifiedAt: now, discoveredAt: now };
    const sideInfo = await stat(sidecarPath); const sidecar = { path: sidecarPath, filename: "note.xmp", extension: ".xmp", snapshot: { size: sideInfo.size, mtimeMs: sideInfo.mtimeMs }, createdAt: null, modifiedAt: now, discoveredAt: now, role: "sidecar" as const };
    const photo: PhotoGroup = { id: "p1", jpegCandidates: [candidate], tiffCandidates: [], selected: true, suggestedOriginal: candidate, chosenOriginal: candidate, rawMatch: { state: "disabled", candidates: [], chosen: null, decision: null, matchedBy: "disabled" }, sidecarMatches: [] };
    const workingInfo = await stat(workingPath);
    const artifact = (kind: "thumbnail" | "working") => ({ kind, path: kind === "thumbnail" ? previewPath : workingPath, width: 4, height: 4, size: kind === "thumbnail" ? previewInfo.size : workingInfo.size, sha256: createHash("sha256").update(readFileSync(kind === "thumbnail" ? previewPath : workingPath)).digest("hex"), format: "jpeg" as const });
    const base: PackagePlan = { photos: [], outputPath: "", options: { sourceDirectory: root, includeRaw: true, includeSidecars: true, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 2 }, versions: { generatorName: "test", generatorVersion: "1", sharpVersion: sharp.versions.sharp!, zipVersion: "2" } };
    const writer = createZipWriter();
    const missing = { ...candidate, path: path.join(root, "missing.jpg") };
    await expect(writer.write({ ...base, photos: [{ photo, chosenOriginal: missing, preview: { ok: true, photoId: "p1", artifacts: [artifact("thumbnail"), artifact("working")], pageCount: 1, multiPage: false, steps: [], warnings: [] }, raw: [], sidecars: [] }], outputPath: path.join(root, "missing.zip") }, new AbortController().signal)).rejects.toBeTruthy();
    const directoryOutput = path.join(root, "directory.zip"); await mkdir(directoryOutput);
    await expect(writer.write({ ...base, outputPath: directoryOutput }, new AbortController().signal)).rejects.toBeTruthy();
    if (process.getuid?.() !== 0) {
      const readOnly = path.join(root, "read-only"); await mkdir(readOnly); await chmod(readOnly, 0o555);
      try { await expect(writer.write({ ...base, outputPath: path.join(readOnly, "package.zip") }, new AbortController().signal)).rejects.toBeTruthy(); }
      finally { await chmod(readOnly, 0o755); }
    }
    const many = Array.from({ length: 200 }, (_, index) => { const id = `photo-${index}`; const row = { ...photo, id, sidecarMatches: [sidecar] }; return { photo: row, chosenOriginal: candidate, preview: { ok: true as const, photoId: id, artifacts: [artifact("thumbnail"), artifact("working")] as [ReturnType<typeof artifact>, ReturnType<typeof artifact>], pageCount: 1, multiPage: false, steps: [], warnings: [] }, raw: [], sidecars: [sidecar] }; });
    const outputPath = path.join(root, "many.zip"); const summary = await writer.write({ ...base, photos: many, outputPath }, new AbortController().signal);
    for (const row of many) crossValidate(summary.manifest, summary.metadataByPhotoId[row.photo.id]);
    const bytes = await readFile(outputPath); const reader = new ZipReader(new BlobReader(new Blob([bytes])));
    try { const entries = await reader.getEntries(); expect(entries.length).toBeGreaterThan(800); expect(entries.every((entry) => entry.compressionMethod === 0)).toBe(true); const manifest = entries.find((entry) => entry.filename === "manifest.json"); expect(manifest).toBeTruthy(); if (manifest && !manifest.directory) expect(JSON.parse(await manifest.getData(new TextWriter()))).toHaveProperty("photos"); }
    finally { await reader.close(); }
    const python = spawnSync("python3", ["-I", "-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None", outputPath], { encoding: "utf8", timeout: 60_000 });
    if (!python.error || (python.error as NodeJS.ErrnoException).code !== "ENOENT") expect(python.status, python.stderr).toBe(0);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);
