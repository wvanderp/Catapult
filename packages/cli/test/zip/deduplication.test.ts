import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import { afterEach, expect, it } from "vitest";
import { createZipWriter } from "../../src/zip/index.js";
import type { AttachmentCandidate, FileCandidate, PackagePlan, PhotoGroup } from "../../src/types.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

it("deduplicates attachment bytes, records every source, and keeps metadata states distinct", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-zip-dedupe-")); roots.push(root);
  const now = new Date();
  const candidate = async (filename: string, bytes: Buffer, role?: "raw" | "sidecar"): Promise<FileCandidate | AttachmentCandidate> => {
    const directory = path.join(root, Math.random().toString(16).slice(2)); await mkdir(directory); const file = path.join(directory, filename); await writeFile(file, bytes); const info = await stat(file);
    return { path: file, filename, extension: path.extname(filename), snapshot: { size: info.size, mtimeMs: info.mtimeMs }, createdAt: null, modifiedAt: now, discoveredAt: now, ...(role && { role }) } as FileCandidate | AttachmentCandidate;
  };
  const makePhoto = async (id: string, rawState: "disabled" | "accepted" | "accepted-missing", raw: AttachmentCandidate[] = [], sidecars: AttachmentCandidate[] = [], matchedBy: "disabled" | "user" | "exact-basename-mtime" | "missing" = "disabled") => {
    const original = await candidate(`${id}.jpg`, Buffer.from(`original-${id}`));
    const decision = rawState === "accepted" || rawState === "accepted-missing" ? "accept" : null;
    const matchState = rawState === "accepted-missing" ? "missing" : rawState;
    const photo: PhotoGroup = { id, jpegCandidates: [original], tiffCandidates: [], selected: true, suggestedOriginal: original, chosenOriginal: original,
      rawMatch: { state: matchState, candidates: raw, chosen: raw[0] ?? null, decision: rawState === "accepted-missing" ? "accept-missing" : decision, matchedBy }, sidecarMatches: sidecars };
    const thumbPath = path.join(root, `${id}-thumb.jpg`); const workPath = path.join(root, `${id}-work.jpg`);
    await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).jpeg().toFile(thumbPath); await sharp(thumbPath).toFile(workPath);
    const artifacts = await Promise.all([thumbPath, workPath].map(async (file, index) => { const bytes = await readFile(file); const meta = await sharp(file).metadata(); return { kind: index ? "working" as const : "thumbnail" as const, path: file, width: meta.width!, height: meta.height!, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, format: "jpeg" as const }; }));
    return { photo, chosenOriginal: original, raw, sidecars, preview: { ok: true as const, photoId: id, artifacts: artifacts as [typeof artifacts[number], typeof artifacts[number]], pageCount: 1, multiPage: false, steps: [], warnings: [] } };
  };

  const rawSameA = await candidate("same.nef", Buffer.from("same-raw"), "raw") as AttachmentCandidate;
  const rawSameB = await candidate("same.nef", Buffer.from("same-raw"), "raw") as AttachmentCandidate;
  const rawSidecarBytes = await candidate("dual.nef", Buffer.from("dual-bytes"), "raw") as AttachmentCandidate;
  const sidecarSameBytes = await candidate("dual.xmp", Buffer.from("dual-bytes"), "sidecar") as AttachmentCandidate;
  const sidecarShared = await candidate("shared.xmp", Buffer.from("shared-sidecar"), "sidecar") as AttachmentCandidate;
  const rawCollision1 = await candidate("same?.nef", Buffer.from("collision-a"), "raw") as AttachmentCandidate;
  const rawCollision2 = await candidate("same*.nef", Buffer.from("collision-b"), "raw") as AttachmentCandidate;
  const rows = [
    await makePhoto("a", "accepted", [rawSameA], [sidecarShared], "user"),
    await makePhoto("b", "accepted", [rawSameB], [sidecarShared], "exact-basename-mtime"),
    await makePhoto("c", "accepted", [rawSidecarBytes, rawCollision1], [], "user"),
    await makePhoto("d", "accepted", [rawCollision2], [sidecarSameBytes], "user"),
    await makePhoto("e", "accepted-missing", [], [], "missing"),
    await makePhoto("f", "disabled"),
  ];
  const plan: PackagePlan = { photos: rows, outputPath: path.join(root, "dedupe.zip"), options: { sourceDirectory: root, includeRaw: true, includeSidecars: true, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 1 }, versions: { generatorName: "catapult", generatorVersion: "test", sharpVersion: sharp.versions.sharp!, zipVersion: "2" } };
  const summary = await createZipWriter().write(plan, new AbortController().signal);
  const reader = new ZipReader(new BlobReader(new Blob([await readFile(plan.outputPath)])));
  try {
    const entries = await reader.getEntries(); const manifestEntry = entries.find((entry) => entry.filename === "manifest.json")!;
    if (manifestEntry.directory) throw new Error("Manifest unexpectedly is a directory");
    const manifest = JSON.parse(await manifestEntry.getData(new TextWriter())) as typeof summary.manifest;
    const repeated = manifest.attachments.filter((item) => item.sha256 === createHash("sha256").update("same-raw").digest("hex"));
    expect(repeated).toHaveLength(1); expect(repeated[0]!.photoIds).toEqual(["a", "b"]); expect(summary.metadataByPhotoId.a.attachments.find((item) => item.id === repeated[0]!.id)?.sources).toHaveLength(2);
    expect(manifest.attachments.filter((item) => item.sha256 === createHash("sha256").update("dual-bytes").digest("hex"))).toHaveLength(2);
    expect(manifest.attachments.find((item) => item.sha256 === createHash("sha256").update("shared-sidecar").digest("hex"))?.photoIds).toEqual(["a", "b"]);
    const sameName = manifest.attachments.filter((item) => (item.sourceFilename ?? "").startsWith("same") && item.sha256 !== repeated[0]!.sha256);
    expect(new Set(sameName.map((item) => item.entryPath)).size).toBe(sameName.length);
    expect(summary.metadataByPhotoId.a.raw).toMatchObject({ state: "collected", matchedBy: "user" });
    expect(summary.metadataByPhotoId.b.raw).toMatchObject({ state: "collected", matchedBy: "exact-basename-mtime" });
    expect(summary.metadataByPhotoId.e.raw).toMatchObject({ state: "accepted-missing", matchedBy: "missing" });
    expect(summary.metadataByPhotoId.f.raw).toMatchObject({ state: "collection-disabled", matchedBy: "disabled" });
    expect(summary.metadataByPhotoId.e.processing.at(-1)?.warnings).toContain("No RAW attachment was accepted for this photo");
  } finally { await reader.close(); }
});
