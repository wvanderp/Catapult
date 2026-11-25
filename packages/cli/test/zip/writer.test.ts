import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { BlobReader, TextWriter, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";
import { expect, it } from "vitest";
import { createZipWriter } from "../../src/zip/index.js";
import type { FileCandidate, PackagePlan, PackageSummary, PhotoGroup } from "../../src/types.js";

it("writes validated STORE entries with matching streamed hashes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-zip-test-"));
  try {
    const original = path.join(root, "image.jpg"); await sharp({ create: { width: 12, height: 8, channels: 3, background: "green" } }).jpeg().toFile(original);
    const sidecar = path.join(root, "note.xmp"); await writeFile(sidecar, Buffer.alloc(40 * 1024 * 1024, 7));
    const now = new Date();
    const candidate = async (file: string, role?: "sidecar") => { const info = await stat(file); const name = path.basename(file); return { path: file, filename: name, extension: path.extname(name), snapshot: { size: info.size, mtimeMs: info.mtimeMs }, createdAt: null, modifiedAt: new Date(info.mtimeMs), discoveredAt: now, ...(role && { role }) } as FileCandidate & { role?: "sidecar" }; };
    const originalCandidate = await candidate(original); const sidecarCandidate = await candidate(sidecar, "sidecar");
    const photo: PhotoGroup = { id: "p1", jpegCandidates: [originalCandidate], tiffCandidates: [], selected: true, suggestedOriginal: originalCandidate, chosenOriginal: originalCandidate,
      rawMatch: { state: "disabled", candidates: [], chosen: null, decision: null, matchedBy: "disabled" }, sidecarMatches: [sidecarCandidate as never] };
    const previewPaths = [path.join(root, "thumb.jpg"), path.join(root, "working.jpg")];
    await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).jpeg().toFile(previewPaths[0]!);
    await sharp({ create: { width: 10, height: 10, channels: 3, background: "blue" } }).jpeg().toFile(previewPaths[1]!);
    const preview = await Promise.all(previewPaths.map(async (file, index) => { const bytes = await readFile(file); const dimensions = await sharp(file).metadata(); return { kind: index ? "working" as const : "thumbnail" as const, path: file, width: dimensions.width!, height: dimensions.height!, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, format: "jpeg" as const }; }));
    const options = { sourceDirectory: root, includeRaw: false, includeSidecars: true, thumbnailMaxEdge: 320 as const, workingMaxEdge: 1280 as const, concurrency: 1 };
    const plan: PackagePlan = { photos: [{ photo, chosenOriginal: originalCandidate, preview: { ok: true, photoId: "p1", artifacts: preview as [typeof preview[number], typeof preview[number]], pageCount: 1, multiPage: false, steps: [], warnings: [] }, raw: [], sidecars: [sidecarCandidate as never, sidecarCandidate as never] }], outputPath: path.join(root, "package.zip"), options, versions: { generatorName: "catapult", generatorVersion: "0.1.0", sharpVersion: sharp.versions.sharp!, zipVersion: "2" } };
    const estimate = createZipWriter().estimate(plan);
    expect(estimate.sourceBytes).toBe(originalCandidate.snapshot.size + sidecarCandidate.snapshot.size);
    expect(estimate.estimatedBytes).toBeGreaterThanOrEqual(estimate.sourceBytes + preview.reduce((sum, artifact) => sum + artifact.size, 0));
    expect(estimate.attachmentCount).toBe(1);
    const warningEstimate = createZipWriter().estimate({ ...plan, photos: [{ ...plan.photos[0]!, chosenOriginal: { ...originalCandidate, snapshot: { ...originalCandidate.snapshot, size: 100 * 1024 * 1024 } }, raw: [{ ...sidecarCandidate, snapshot: { ...sidecarCandidate.snapshot, size: 200 * 1024 * 1024 }, role: "raw" } as never] }] });
    expect(warningEstimate.warnings).toHaveLength(1);
    expect(warningEstimate.warnings[0]).toContain(originalCandidate.path);
    expect(createZipWriter().estimate({ ...plan, photos: [{ ...plan.photos[0]!, raw: [{ ...sidecarCandidate, snapshot: { ...sidecarCandidate.snapshot, size: 200 * 1024 * 1024 }, role: "raw" } as never] }] }).warnings).toEqual([]);
    await writeFile(plan.outputPath, "keep existing bytes");
    await expect(createZipWriter().write(plan, new AbortController().signal)).rejects.toMatchObject({ code: "output-exists" });
    expect(await readFile(plan.outputPath, "utf8")).toBe("keep existing bytes");
    await rm(plan.outputPath, { force: true });
    const diskFullPath = path.join(root, "disk-full.zip");
    const diskFullWriter = createZipWriter({ createWriteStream: (file, options) => {
      const stream = createWriteStream(file, options);
      stream.once("open", () => stream.destroy(Object.assign(new Error("disk full"), { code: "ENOSPC" })));
      return stream;
    } });
    await expect(diskFullWriter.write({ ...plan, outputPath: diskFullPath }, new AbortController().signal)).rejects.toMatchObject({ code: "disk-failure" });
    expect(await import("node:fs/promises").then(({ readdir }) => readdir(root))).not.toContain(path.basename(diskFullPath));
    let measuring = false;
    let sourceBytes = 0;
    let outputBytes = 0;
    let maxInFlight = 0;
    const trackMaximum = (): void => { maxInFlight = Math.max(maxInFlight, sourceBytes - outputBytes); };
    const measuredWriter = createZipWriter({
      createReadStream: ((file: string, options?: Parameters<typeof createReadStream>[1]) => {
        const stream = createReadStream(file, options);
        stream.on("data", (chunk: Buffer) => { if (measuring) { sourceBytes += chunk.length; trackMaximum(); } });
        return stream;
      }) as typeof createReadStream,
      createWriteStream: (file, options) => {
        const stream = createWriteStream(file, options);
        measuring = true;
        const write = stream.write.bind(stream);
        stream.write = ((chunk: string | Uint8Array, ...arguments_: unknown[]) => {
          const length = typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
          outputBytes += length;
          trackMaximum();
          return (write as (...writeArguments: unknown[]) => boolean)(chunk, ...arguments_);
        }) as typeof stream.write;
        const originalWrite = stream._write.bind(stream);
        stream._write = (chunk, encoding, callback) => { setTimeout(() => originalWrite(chunk, encoding, callback), 1); };
        return stream;
      },
    });
    const originalHashBeforeWrite = createHash("sha256").update(await readFile(original)).digest("hex");
    let summary: PackageSummary;
    try { summary = await measuredWriter.write(plan, new AbortController().signal); }
    finally { measuring = false; }
    expect(createHash("sha256").update(await readFile(original)).digest("hex")).toBe(originalHashBeforeWrite);
    console.info(`ZIP maximum source bytes ahead of output: ${maxInFlight}`);
    expect(sourceBytes).toBeGreaterThanOrEqual(40 * 1024 * 1024);
    expect(outputBytes).toBeGreaterThanOrEqual(40 * 1024 * 1024);
    // Node's source and output streams buffer 64 KiB and 16 KiB respectively;
    // the remaining allowance covers ZIP's Web Stream adapter queues.
    expect(maxInFlight).toBeLessThan(2 * 1024 * 1024);
    expect(summary.manifest.photos).toHaveLength(1);
    const reader = new ZipReader(new BlobReader(new Blob([await readFile(plan.outputPath)])));
    try {
      const entries = await reader.getEntries();
      expect(entries.every((entry) => entry.compressionMethod === 0)).toBe(true);
      const rawArchive = await readFile(plan.outputPath);
      const eocd = rawArchive.lastIndexOf(Buffer.from([0x50, 0x4B, 0x5, 0x6]));
      expect(eocd).toBeGreaterThanOrEqual(0);
      const zip64Locator = rawArchive.lastIndexOf(Buffer.from([0x50, 0x4B, 0x6, 0x7]));
      const zip64Record = zip64Locator === -1 ? -1 : Number(rawArchive.readBigUInt64LE(zip64Locator + 8));
      let offset = zip64Record >= 0 ? Number(rawArchive.readBigUInt64LE(zip64Record + 48)) : rawArchive.readUInt32LE(eocd + 16);
      let centralEntries = 0;
      let zip64Extra = false;
      while (rawArchive.readUInt32LE(offset) === 0x2014B50) {
        expect(rawArchive.readUInt16LE(offset + 10)).toBe(0);
        expect(rawArchive.readUInt32LE(offset + 20)).toBe(rawArchive.readUInt32LE(offset + 24));
        const nameLength = rawArchive.readUInt16LE(offset + 28);
        const extraLength = rawArchive.readUInt16LE(offset + 30);
        for (let field = offset + 46 + nameLength; field < offset + 46 + nameLength + extraLength;) {
          const id = rawArchive.readUInt16LE(field);
          const length = rawArchive.readUInt16LE(field + 2);
          if (id === 0x1) zip64Extra = true;
          field += 4 + length;
        }
        offset += 46 + nameLength + extraLength + rawArchive.readUInt16LE(offset + 32);
        centralEntries++;
      }
      expect(centralEntries).toBeGreaterThan(0);
      expect(zip64Extra || rawArchive.includes(Buffer.from([0x50, 0x4B, 0x6, 0x6]))).toBe(true);
      const manifestEntry = entries.find((entry) => entry.filename === "manifest.json")!;
      if (manifestEntry.directory) throw new Error("Manifest entry unexpectedly is a directory");
      const manifest = JSON.parse(await manifestEntry.getData(new TextWriter())) as typeof summary.manifest;
      const originalEntry = entries.find((entry) => entry.filename === manifest.photos[0]!.originalPath)!;
      if (originalEntry.directory) throw new Error("Original entry unexpectedly is a directory");
      const bytes = new Uint8ArrayWriter(); await originalEntry.getData(bytes);
      expect(createHash("sha256").update(await bytes.getData()).digest("hex")).toBe(manifest.photos[0]!.sha256);
      const previewRecords = Object.entries(manifest.photos[0]!.previewPaths);
      for (const [kind, entryPath] of previewRecords) {
        const previewEntry = entries.find((entry) => entry.filename === entryPath)!;
        if (previewEntry.directory) throw new Error("Preview entry unexpectedly is a directory");
        const previewData = new Uint8ArrayWriter(); await previewEntry.getData(previewData);
        expect(createHash("sha256").update(await previewData.getData()).digest("hex")).toBe(manifest.photos[0]!.previewHashes[kind as "thumbnail" | "working"]);
      }
      for (const attachment of manifest.attachments) {
        const attachmentEntry = entries.find((entry) => entry.filename === attachment.entryPath)!;
        if (attachmentEntry.directory) throw new Error("Attachment entry unexpectedly is a directory");
        const attachmentData = new Uint8ArrayWriter(); await attachmentEntry.getData(attachmentData);
        expect(createHash("sha256").update(await attachmentData.getData()).digest("hex")).toBe(attachment.sha256);
      }
      expect(manifest.attachments).toHaveLength(1);
      expect(manifest.photos[0]!.attachmentIds).toEqual([manifest.attachments[0]!.id]);
    expect(summary.metadataByPhotoId.p1.processing.at(-1)).toMatchObject({ tool: "@zip.js/zip.js", version: "2", step: "package-store-zip" });
    expect(summary.metadataByPhotoId.p1.attachments[0]?.sources).toMatchObject([{ path: sidecar, discoveredAt: now.toISOString() }]);
    } finally { await reader.close(); }
    let raced = false;
    const racePath = path.join(root, "race.zip");
    await expect(createZipWriter().write({ ...plan, outputPath: racePath }, new AbortController().signal, (event) => {
      if (!raced && event.stage === "hash") { raced = true; writeFileSync(racePath, "external output"); }
    })).rejects.toMatchObject({ code: "output-exists" });
    expect(await readFile(racePath, "utf8")).toBe("external output");

    const abortController = new AbortController();
    await expect(createZipWriter().write({ ...plan, outputPath: path.join(root, "cancelled.zip") }, abortController.signal, (event) => {
      if (event.stage === "hash") abortController.abort();
    })).rejects.toMatchObject({ code: "cancelled" });

    const within = async <T>(promise: Promise<T>): Promise<T> => Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error("ZIP write did not settle promptly")), 30000)),
    ]);
    const removedDuringWrite = path.join(root, "removed.zip");
    let removed = false;
    await expect(within(createZipWriter().write({ ...plan, outputPath: removedDuringWrite }, new AbortController().signal, (event) => {
      if (!removed && event.message.includes("attachments/")) {
        removed = true;
        unlinkSync(sidecar);
      }
    }))).rejects.toMatchObject({ code: "source-changed" });
    expect(removed).toBe(true);
    expect(await import("node:fs/promises").then(({ readdir }) => readdir(root))).not.toContain(path.basename(removedDuringWrite));

    await writeFile(sidecar, Buffer.alloc(40 * 1024 * 1024, 7));
    const restoredCandidate = await candidate(sidecar, "sidecar");
    const restoredPhoto = { ...photo, sidecarMatches: [restoredCandidate as never] };
    const restoredPlan = { ...plan, photos: [{ ...plan.photos[0]!, photo: restoredPhoto, sidecars: [restoredCandidate as never] }] };
    const abortedDuringWrite = path.join(root, "aborted-midstream.zip");
    const midstreamAbort = new AbortController();
    let aborted = false;
    await expect(within(createZipWriter().write({ ...restoredPlan, outputPath: abortedDuringWrite }, midstreamAbort.signal, (event) => {
      if (!aborted && event.message.includes("attachments/")) {
        aborted = true;
        midstreamAbort.abort();
      }
    }))).rejects.toMatchObject({ code: "cancelled" });
    expect(aborted).toBe(true);
    expect(await import("node:fs/promises").then(({ readdir }) => readdir(root))).not.toContain(path.basename(abortedDuringWrite));

    const abortBeforePublishPath = path.join(root, "abort-before-publish.zip");
    const beforePublish = new AbortController(); let didAbortBeforePublish = false;
    await expect(createZipWriter().write({ ...restoredPlan, outputPath: abortBeforePublishPath }, beforePublish.signal, (event) => {
      if (!didAbortBeforePublish && event.stage === "zip" && event.message.includes("metadata.json")) { didAbortBeforePublish = true; beforePublish.abort(); }
    })).rejects.toMatchObject({ code: "cancelled" });
    expect(didAbortBeforePublish).toBe(true);
    expect(await import("node:fs/promises").then(({ readdir }) => readdir(root))).not.toContain(path.basename(abortBeforePublishPath));
    const previewChangedPath = path.join(root, "preview-changed.zip");
    let previewChanged = false;
    const thumbnail = preview.find((artifact) => artifact.kind === "thumbnail")!;
    const thumbnailBytes = await readFile(thumbnail.path);
    await expect(createZipWriter().write({ ...restoredPlan, outputPath: previewChangedPath }, new AbortController().signal, (event) => {
      if (!previewChanged && event.message.includes("original/")) {
        previewChanged = true;
        writeFileSync(thumbnail.path, Buffer.alloc(thumbnailBytes.length, 9));
      }
    })).rejects.toMatchObject({ code: "source-changed" });
    expect(previewChanged).toBe(true);
    expect(await import("node:fs/promises").then(({ readdir }) => readdir(root))).not.toContain(path.basename(previewChangedPath));
    writeFileSync(thumbnail.path, thumbnailBytes);

    const changedPath = path.join(root, "changed.zip");
    const originalBytesBeforeChange = readFileSync(original);
    let changed = false;
    await expect(createZipWriter().write({ ...plan, outputPath: changedPath }, new AbortController().signal, (event) => {
      if (!changed && event.stage === "zip" && event.message.includes("original")) { changed = true; writeFileSync(original, Buffer.concat([readFileSync(original), Buffer.from("changed")])); }
    })).rejects.toMatchObject({ code: "source-changed" });
    writeFileSync(original, originalBytesBeforeChange);

  } finally { await rm(root, { recursive: true, force: true }); }
}, 120_000);

it("refuses an existing output without replacing it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-zip-test-"));
  try { const output = path.join(root, "exists.zip"); await writeFile(output, "keep"); expect(await readFile(output, "utf8")).toBe("keep"); }
  finally { await rm(root, { recursive: true, force: true }); }
});

it.skipIf(!process.env.CATAPULT_RUN_LARGE_ZIP_TEST)("streams a sparse source larger than 4 GiB with ZIP64", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-zip64-test-"));
  try {
    const image = path.join(root, "image.jpg"); await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).jpeg().toFile(image);
    const raw = path.join(root, "large.nef"); const rawHandle = await open(raw, "w"); await rawHandle.truncate(4_294_967_297); await rawHandle.close();
    const now = new Date();
    const candidate = async (file: string, role?: "raw") => { const info = await stat(file); const filename = path.basename(file); return { path: file, filename, extension: path.extname(file), snapshot: { size: info.size, mtimeMs: info.mtimeMs }, createdAt: null, modifiedAt: new Date(info.mtimeMs), discoveredAt: now, ...(role && { role }) }; };
    const original = await candidate(image); const attachment = await candidate(raw, "raw");
    const photo: PhotoGroup = { id: "large", jpegCandidates: [original], tiffCandidates: [], selected: true, suggestedOriginal: original, chosenOriginal: original,
      rawMatch: { state: "accepted", candidates: [attachment as never], chosen: attachment as never, decision: "accept", matchedBy: "user" }, sidecarMatches: [] };
    const previewBytes = await readFile(image); const dims = await sharp(image).metadata();
    const artifact = { kind: "thumbnail" as const, path: image, width: dims.width!, height: dims.height!, sha256: createHash("sha256").update(previewBytes).digest("hex"), size: previewBytes.length, format: "jpeg" as const };
    const plan: PackagePlan = { photos: [{ photo, chosenOriginal: original, preview: { ok: true, photoId: "large", artifacts: [artifact, { ...artifact, kind: "working" }], pageCount: 1, multiPage: false, steps: [], warnings: [] }, raw: [attachment as never], sidecars: [] }], outputPath: path.join(root, "large.zip"),
      options: { sourceDirectory: root, includeRaw: true, includeSidecars: false, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 1 }, versions: { generatorName: "catapult", generatorVersion: "0.1", sharpVersion: sharp.versions.sharp!, zipVersion: "2" } };
    const summary = await createZipWriter().write(plan, new AbortController().signal);
    const archiveStats = await stat(plan.outputPath);
    expect(archiveStats.size).toBeGreaterThan(4_294_967_296);
    expect(summary.manifest.attachments[0]?.size).toBe(4_294_967_297);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 600_000);
