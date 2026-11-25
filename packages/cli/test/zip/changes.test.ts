import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, readdir, readlink, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, statSync, utimesSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { expect, it } from "vitest";
import { createZipWriter } from "../../src/zip/index.js";
import type { FileCandidate, PackagePlan, PhotoGroup } from "../../src/types.js";

/**
 *
 * @param rawBytes
 */
/**
 * Build isolated source files and a package plan for one test.
 *
 * @param rawBytes Number of bytes to write to the optional RAW.
 * @returns The temporary directory, plan, candidates, and cleanup function.
 */
async function fixture(rawBytes = 0) {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-zip-changes-"));
  const originalPath = path.join(root, "image.jpg");
  await sharp({ create: { width: 12, height: 8, channels: 3, background: "green" } }).jpeg().toFile(originalPath);
  const rawPath = path.join(root, "image.nef");
  const candidates = async (file: string, role?: "raw"): Promise<FileCandidate & { role?: "raw" }> => {
    const info = await stat(file);
    const filename = path.basename(file);
    return { path: file, filename, extension: path.extname(filename), snapshot: { size: info.size, mtimeMs: info.mtimeMs }, createdAt: null, modifiedAt: new Date(info.mtimeMs), discoveredAt: new Date(), ...(role && { role }) };
  };
  const original = await candidates(originalPath);
  let raw: (FileCandidate & { role?: "raw" }) | undefined;
  if (rawBytes) {
    await writeFile(rawPath, Buffer.alloc(rawBytes, 3));
    raw = await candidates(rawPath, "raw");
  }
  const previewArtifacts = [];
  for (const [kind, color] of [["thumbnail", "red"], ["working", "blue"]] as const) {
    const file = path.join(root, `${kind}.jpg`);
    await sharp({ create: { width: 10, height: 10, channels: 3, background: color } }).jpeg().toFile(file);
    const bytes = await readFile(file);
    const dimensions = await sharp(file).metadata();
    previewArtifacts.push({ kind, path: file, width: dimensions.width!, height: dimensions.height!, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, format: "jpeg" as const });
  }
  const photo: PhotoGroup = {
    id: "p1", jpegCandidates: [original], tiffCandidates: [], selected: true, suggestedOriginal: original, chosenOriginal: original,
    rawMatch: raw ? { state: "accepted", candidates: [raw as never], chosen: raw as never, decision: "accept", matchedBy: "user" } : { state: "disabled", candidates: [], chosen: null, decision: null, matchedBy: "disabled" }, sidecarMatches: [],
  };
  const plan: PackagePlan = {
    photos: [{ photo, chosenOriginal: original, preview: { ok: true, photoId: "p1", artifacts: previewArtifacts as [typeof previewArtifacts[number], typeof previewArtifacts[number]], pageCount: 1, multiPage: false, steps: [], warnings: [] }, raw: raw ? [raw as never] : [], sidecars: [] }],
    outputPath: path.join(root, "result.zip"),
    options: { sourceDirectory: root, includeRaw: Boolean(raw), includeSidecars: false, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 1 },
    versions: { generatorName: "catapult", generatorVersion: "0.1.0", sharpVersion: sharp.versions.sharp!, zipVersion: "2" },
  };
  const cleanup = () => rm(root, { recursive: true, force: true });
  return { root, plan, original, raw, cleanup };
}

/**
 *
 * @param root
 * @param outputPath
 */
/**
 * Assert that a failed write left neither its output nor temporary ZIP behind.
 *
 * @param root Temporary directory to inspect.
 * @param outputPath Expected archive path.
 */
async function expectNoTemporary(root: string, outputPath: string): Promise<void> {
  const names = await readdir(root);
  expect(names).not.toContain(path.basename(outputPath));
  expect(names.some((name) => name.startsWith(`.${path.basename(outputPath)}.`) && name.endsWith(".tmp"))).toBe(false);
}

/**
 *
 * @param file
 */
/**
 * Advance a file's mtime without changing its contents.
 *
 * @param file Source path to touch.
 */
async function changeMtime(file: string): Promise<void> {
  const info = statSync(file);
  utimesSync(file, info.atime, new Date(info.mtimeMs + 5000));
}

it("rejects an original changed on the last hash progress event", async () => {
  const f = await fixture();
  try {
    let changed = false;
    await expect(createZipWriter().write(f.plan, new AbortController().signal, (event) => {
      if (event.stage === "hash" && event.completed === event.total) { changed = true; changeMtime(f.original.path); }
    })).rejects.toMatchObject({ code: "source-changed" });
    expect(changed).toBe(true);
    await expectNoTemporary(f.root, f.plan.outputPath);
  } finally { await f.cleanup(); }
});

it("rejects a RAW changed on the last hash progress event", async () => {
  const f = await fixture(32);
  try {
    let changed = false;
    await expect(createZipWriter().write(f.plan, new AbortController().signal, (event) => {
      if (event.stage === "hash" && event.completed === event.total) { changed = true; changeMtime(f.raw!.path); }
    })).rejects.toMatchObject({ code: "source-changed" });
    expect(changed).toBe(true);
    await expectNoTemporary(f.root, f.plan.outputPath);
  } finally { await f.cleanup(); }
});

it("detects a RAW mtime change during attachment streaming", async () => {
  const f = await fixture(12 * 1024 * 1024);
  try {
    let changed = false;
    await expect(createZipWriter().write(f.plan, new AbortController().signal, (event) => {
      if (!changed && event.stage === "zip" && event.message.startsWith("Writing attachments/")) { changed = true; changeMtime(f.raw!.path); }
    })).rejects.toMatchObject({ code: "source-changed" });
    expect(changed).toBe(true);
    await expectNoTemporary(f.root, f.plan.outputPath);
  } finally { await f.cleanup(); }
});

it("cancels a large RAW stream promptly and removes its temporary file", async () => {
  const f = await fixture(40 * 1024 * 1024);
  try {
    const abort = new AbortController();
    let eventsAfterAbort = 0;
    let abortedAtProgress = false;
    let sourceReadCalls = 0;
    let sourceReadBytes = 0;
    let outputWriteCalls = 0;
    let outputWriteBytes = 0;
    const writer = createZipWriter({
      createReadStream: ((file: string, options?: Parameters<typeof createReadStream>[1]) => {
        const stream = createReadStream(file, options);
        stream.on("data", (chunk: Buffer) => { sourceReadCalls++; sourceReadBytes += chunk.length; });
        return stream;
      }) as typeof createReadStream,
      createWriteStream: (file, options) => {
        const stream = createWriteStream(file, options);
        const write = stream.write.bind(stream);
        stream.write = ((chunk: string | Uint8Array, ...arguments_: unknown[]) => {
          outputWriteCalls++;
          outputWriteBytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
          return (write as (...writeArguments: unknown[]) => boolean)(chunk, ...arguments_);
        }) as typeof stream.write;
        return stream;
      },
    });
    await expect(writer.write(f.plan, abort.signal, (event) => {
      if (event.stage !== "zip" || !event.message.startsWith("Writing attachments/")) return;
      if (abort.signal.aborted) { eventsAfterAbort++; }
      else { abortedAtProgress = true; abort.abort(); }
    })).rejects.toMatchObject({ code: "cancelled" });
    const settledCounts = { sourceReadCalls, sourceReadBytes, outputWriteCalls, outputWriteBytes };
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect({ sourceReadCalls, sourceReadBytes, outputWriteCalls, outputWriteBytes }).toEqual(settledCounts);
    expect(abortedAtProgress).toBe(true);
    expect(eventsAfterAbort).toBe(0);
    expect(sourceReadBytes).toBeLessThan(f.raw!.snapshot.size);
    expect(sourceReadCalls).toBeGreaterThan(0);
    expect(outputWriteCalls).toBeGreaterThan(0);
    await expectNoTemporary(f.root, f.plan.outputPath);
  } finally { await f.cleanup(); }
}, 10_000);

it("removes a temp file when its injected open completes after abort", async () => {
  const f = await fixture();
  try {
    const abort = new AbortController();
    const writer = createZipWriter({
      open: (async (file: string, flags: string) => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        abort.abort();
        return open(file, flags as "wx");
      }) as typeof open,
    });
    await expect(writer.write(f.plan, abort.signal)).rejects.toMatchObject({ code: "cancelled" });
    await expectNoTemporary(f.root, f.plan.outputPath);
    if (process.platform === "linux") {
      const descriptors = await readdir("/proc/self/fd");
      const targets = await Promise.all(descriptors.map((descriptor) => readlink(`/proc/self/fd/${descriptor}`).catch(() => "")));
      expect(targets.some((target) => target.startsWith(`${f.root}/`))).toBe(false);
    }
  } finally { await f.cleanup(); }
});

it.each(["EACCES", "EPERM", "ENOENT"] as const)("classifies output creation %s as disk-failure", async (code) => {
  const f = await fixture();
  try {
    const writer = createZipWriter({ createWriteStream: (() => { throw Object.assign(new Error("output open failed"), { code }); }) as typeof createWriteStream });
    await expect(writer.write(f.plan, new AbortController().signal)).rejects.toMatchObject({ code: "disk-failure" });
    await expectNoTemporary(f.root, f.plan.outputPath);
  } finally { await f.cleanup(); }
});

it("classifies output stream write permission errors as disk-failure", async () => {
  const f = await fixture();
  try {
    const writer = createZipWriter({ createWriteStream: (file, options) => {
      const stream = createWriteStream(file, options);
      stream.once("open", () => stream.destroy(Object.assign(new Error("output write denied"), { code: "EPERM" })));
      return stream;
    } });
    await expect(writer.write(f.plan, new AbortController().signal)).rejects.toMatchObject({ code: "disk-failure" });
    await expectNoTemporary(f.root, f.plan.outputPath);
  } finally { await f.cleanup(); }
});

it("classifies a missing source read as source-changed", async () => {
  const f = await fixture();
  try {
    await rm(f.original.path);
    await expect(createZipWriter().write(f.plan, new AbortController().signal)).rejects.toMatchObject({ code: "source-changed" });
    await expectNoTemporary(f.root, f.plan.outputPath);
  } finally { await f.cleanup(); }
});
