import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp, { type Sharp } from "sharp";
import { afterEach, expect, it, vi } from "vitest";
import { createPreviewGenerator } from "../../src/preview/index.js";
import type { FileCandidate, PackageOptions, PhotoGroup, PreviewSession } from "../../src/types.js";
import { PreviewCancellationError } from "../../src/types.js";

/**
 * Build a minimal photo group for one source file.
 *
 * @param _root Source root used by the test.
 * @param file Source image path.
 * @param id Stable photo identifier.
 * @returns Photo group with the file selected as its original.
 */
async function makePhoto(_root: string, file: string, id = path.basename(file)): Promise<PhotoGroup> {
  const info = await stat(file); const now = new Date();
  const candidate: FileCandidate = { path: file, filename: path.basename(file), extension: path.extname(file), snapshot: { size: info.size, mtimeMs: info.mtimeMs }, createdAt: null, modifiedAt: now, discoveredAt: now };
  return { id, jpegCandidates: [candidate], tiffCandidates: [], selected: true, suggestedOriginal: candidate, chosenOriginal: candidate,
    rawMatch: { state: "disabled", candidates: [], chosen: null, decision: null, matchedBy: "disabled" }, sidecarMatches: [] };
}
const previewOptions: PackageOptions = { sourceDirectory: ".", includeRaw: false, includeSidecars: false, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 2 };

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

it("applies EXIF orientation, bounds dimensions, and strips source metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-preview-test-")); roots.push(root);
  const source = path.join(root, "portrait.jpg");
  await sharp({ create: { width: 40, height: 80, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation: 6 }).toFile(source);
  const fileStats = await stat(source); const now = new Date();
  const candidate: FileCandidate = { path: source, filename: "portrait.jpg", extension: ".jpg", snapshot: { size: fileStats.size, mtimeMs: fileStats.mtimeMs }, createdAt: null, modifiedAt: now, discoveredAt: now };
  const photo: PhotoGroup = { id: "p1", jpegCandidates: [candidate], tiffCandidates: [], selected: true, suggestedOriginal: candidate, chosenOriginal: candidate,
    rawMatch: { state: "disabled", candidates: [], chosen: null, decision: null, matchedBy: "disabled" }, sidecarMatches: [] };
  const options: PackageOptions = { sourceDirectory: root, includeRaw: false, includeSidecars: false, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 2 };
  const generator = createPreviewGenerator(); const session = await generator.generateSession([photo], options, new AbortController().signal, () => {});
  try {
    const result = session.results[0]; expect(result?.ok).toBe(true);
    if (!result?.ok) throw new Error("Preview did not generate");
    const [thumb, working] = result.artifacts;
    expect(thumb.width).toBe(80); expect(thumb.height).toBe(40);
    expect(working.width).toBeLessThanOrEqual(1280); expect(working.height).toBeLessThanOrEqual(1280);
    const outputMetadata = await sharp(thumb.path).metadata();
    const outputBytes = await readFile(thumb.path);
    expect(outputMetadata.exif).toBeUndefined();
    expect(outputBytes.includes(Buffer.from("Exif\0\0"))).toBe(false);
  } finally { await session.dispose(); }
});

it("normalizes all eight EXIF orientations and keeps exact edge limits without upscaling", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-preview-test-")); roots.push(root);
  const photos: PhotoGroup[] = [];
  for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const source = path.join(root, `orientation-${orientation}.jpg`);
    await sharp({ create: { width: 400, height: 800, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation }).toFile(source);
    const info = await stat(source); const now = new Date();
    const candidate: FileCandidate = { path: source, filename: path.basename(source), extension: ".jpg", snapshot: { size: info.size, mtimeMs: info.mtimeMs }, createdAt: null, modifiedAt: now, discoveredAt: now };
    photos.push({ id: `orientation-${orientation}`, jpegCandidates: [candidate], tiffCandidates: [], selected: true, suggestedOriginal: candidate, chosenOriginal: candidate,
      rawMatch: { state: "disabled", candidates: [], chosen: null, decision: null, matchedBy: "disabled" }, sidecarMatches: [] });
  }
  const small = path.join(root, "small.jpg");
  await sharp({ create: { width: 31, height: 17, channels: 3, background: "blue" } }).jpeg().toFile(small);
  const smallInfo = await stat(small); const now = new Date();
  const smallCandidate: FileCandidate = { path: small, filename: "small.jpg", extension: ".jpg", snapshot: { size: smallInfo.size, mtimeMs: smallInfo.mtimeMs }, createdAt: null, modifiedAt: now, discoveredAt: now };
  photos.push({ id: "small", jpegCandidates: [smallCandidate], tiffCandidates: [], selected: true, suggestedOriginal: smallCandidate, chosenOriginal: smallCandidate,
    rawMatch: { state: "disabled", candidates: [], chosen: null, decision: null, matchedBy: "disabled" }, sidecarMatches: [] });
  const session = await createPreviewGenerator().generateSession(photos, { sourceDirectory: root, includeRaw: false, includeSidecars: false, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 2 }, new AbortController().signal, () => {});
  try {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const result = session.results.find((item) => item.photoId === `orientation-${orientation}`);
      expect(result?.ok).toBe(true);
      if (!result?.ok) throw new Error(`Orientation ${orientation} failed`);
      const [thumbnail, working] = result.artifacts;
      expect([thumbnail.width, thumbnail.height]).toEqual(orientation >= 5 ? [320, 160] : [160, 320]);
      expect(Math.max(working.width, working.height)).toBe(800);
      const pixels = await sharp(thumbnail.path).raw().toBuffer({ resolveWithObject: true });
      const corner = (x: number, y: number): number[] => [...pixels.data.subarray((y * pixels.info.width + x) * pixels.info.channels, (y * pixels.info.width + x) * pixels.info.channels + 3)];
      expect(corner(0, 0)[0]).toBeGreaterThan(150);
      expect(corner(pixels.info.width - 1, pixels.info.height - 1)[0]).toBeGreaterThan(150);
    }
    const smallResult = session.results.find((item) => item.photoId === "small");
    expect(smallResult?.ok).toBe(true);
    if (smallResult?.ok) expect(smallResult.artifacts.map(({ width, height }) => [width, height])).toEqual([[31, 17], [31, 17]]);
  } finally { await session.dispose(); }
});

it("returns a per-photo failure for corrupt input", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-preview-test-")); roots.push(root);
  const source = path.join(root, "broken.jpg"); await sharp({ create: { width: 5, height: 5, channels: 3, background: "blue" } }).jpeg().toFile(source);
  const bytes = await readFile(source); await import("node:fs/promises").then(({ writeFile }) => writeFile(source, bytes.subarray(0, 20)));
  const fileStats = await stat(source); const now = new Date();
  const candidate: FileCandidate = { path: source, filename: "broken.jpg", extension: ".jpg", snapshot: { size: fileStats.size, mtimeMs: fileStats.mtimeMs }, createdAt: null, modifiedAt: now, discoveredAt: now };
  const photo: PhotoGroup = { id: "broken", jpegCandidates: [candidate], tiffCandidates: [], selected: true, suggestedOriginal: candidate, chosenOriginal: candidate,
    rawMatch: { state: "disabled", candidates: [], chosen: null, decision: null, matchedBy: "disabled" }, sidecarMatches: [] };
  const session = await createPreviewGenerator().generateSession([photo], { sourceDirectory: root, includeRaw: false, includeSidecars: false, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 1 }, new AbortController().signal, () => {});
  const result = session.results[0];
  await session.dispose();
  expect(result?.ok).toBe(false);
  if (result?.ok === false) {
    expect(result.failure.stage).toBe("decode");
    expect(result.failure.retryable).toBe(true);
  }
});

it("allows repeated retries and rejects cancellation with a typed error", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-preview-test-")); roots.push(root);
  const source = path.join(root, "retry.jpg");
  await sharp({ create: { width: 12, height: 8, channels: 3, background: "red" } }).jpeg().toFile(source);
  const fileStats = await stat(source); const now = new Date();
  const candidate: FileCandidate = { path: source, filename: "retry.jpg", extension: ".jpg", snapshot: { size: fileStats.size, mtimeMs: fileStats.mtimeMs }, createdAt: null, modifiedAt: now, discoveredAt: now };
  const photo: PhotoGroup = { id: "retry", jpegCandidates: [candidate], tiffCandidates: [], selected: true, suggestedOriginal: candidate, chosenOriginal: candidate,
    rawMatch: { state: "disabled", candidates: [], chosen: null, decision: null, matchedBy: "disabled" }, sidecarMatches: [] };
  const options: PackageOptions = { sourceDirectory: root, includeRaw: false, includeSidecars: false, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 1 };
  await writeFile(source, Buffer.from("not-an-image"));
  const corruptStats = await stat(source);
  candidate.snapshot = { size: corruptStats.size, mtimeMs: corruptStats.mtimeMs };
  const session: PreviewSession = await createPreviewGenerator().generateSession([photo], options, new AbortController().signal, () => {});
  try {
    expect(session.results[0]).toMatchObject({ ok: false, failure: { stage: "decode", retryable: true } });
    await sharp({ create: { width: 12, height: 8, channels: 3, background: "blue" } }).jpeg().toFile(source);
    const success = await session.retry("retry", new AbortController().signal);
    expect(success.ok).toBe(true);
    await writeFile(source, Buffer.from("still-broken"));
    const secondFailure = await session.retry("retry", new AbortController().signal);
    expect(secondFailure).toMatchObject({ ok: false, failure: { stage: "decode", retryable: true } });
    const controller = new AbortController(); controller.abort();
    await expect(session.retry("retry", controller.signal)).rejects.toBeInstanceOf(PreviewCancellationError);
  } finally {
    await session.dispose();
  }
});

it("converts CMYK, 16-bit, grayscale, alpha, and Display P3 sources to metadata-free sRGB previews", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-preview-test-")); roots.push(root);
  const sources = [
    ["cmyk.jpg", sharp({ create: { width: 8, height: 8, channels: 4, background: { c: 0, m: 255, y: 255, k: 0 } } }).toColourspace("cmyk").jpeg()],
    ["sixteen.tif", sharp(Buffer.from("SUkqAAgAAAAJAAABBAABAAAABAAAAAEBBAABAAAABAAAAAIBAwABAAAAEAAAAAMBAwABAAAAAQAAAAYBAwABAAAAAQAAABEBBAABAAAAegAAABYBBAABAAAABAAAABcBBAABAAAAIAAAABwBAwABAAAAAQAAAAAAAAAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIA==", "base64"))],
    ["gray.png", sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 128, g: 128, b: 128 } } }).toColourspace("b-w").png()],
    ["alpha.png", sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png()],
    ["p3.jpg", sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).jpeg().withMetadata({ icc: "p3" })],
  ] as const;
  const photos: PhotoGroup[] = [];
  for (const [name, pipeline] of sources) { const file = path.join(root, name); await pipeline.toFile(file); photos.push(await makePhoto(root, file)); }
  const session = await createPreviewGenerator().generateSession(photos, { ...previewOptions, sourceDirectory: root }, new AbortController().signal, () => {});
  try {
    for (const photo of photos) {
      const result = session.results.find((item) => item.photoId === photo.id)!; expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const thumb = result.artifacts[0]!; const metadata = await sharp(thumb.path).metadata();
      expect(metadata.space).toBe("srgb"); expect(metadata.channels).toBe(3); expect(metadata.icc).toBeUndefined(); expect(metadata.exif).toBeUndefined();
      const output = await sharp(thumb.path).raw().toBuffer({ resolveWithObject: true });
      expect(output.info.channels).toBe(3);
      if (photo.id === "alpha.png") expect([...output.data.subarray(0, 3)]).toEqual(expect.arrayContaining([expect.any(Number)]));
    }
    const alpha = session.results.find((item) => item.photoId === "alpha.png");
    if (alpha?.ok) { const { data, info } = await sharp(alpha.artifacts[0]!.path).raw().toBuffer({ resolveWithObject: true }); expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]); expect(info.channels).toBe(3); }
  } finally { await session.dispose(); }
});

it("uses page zero for multipage TIFF and reports its page count and warning", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-preview-test-")); roots.push(root);
  const file = path.join(root, "pages.tif"); await writeFile(file, Buffer.from("SUkqAAgAAAAKAAABBAABAAAABAAAAAEBBAABAAAAAgAAAAIBAwADAAAAhgAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAAjAAAABUBAwABAAAAAwAAABYBBAABAAAAAgAAABcBBAABAAAAGAAAABwBAwABAAAAAQAAALgAAAAIAAgACAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAAAAAAAAAAAAAAAAABJSSoACAAAAAoAAAEEAAEAAAAEAAAAAQEEAAEAAAACAAAAAgEDAAMAAAA2AQAAAwEDAAEAAAABAAAABgEDAAEAAAACAAAAEQEEAAEAAAA8AQAAFQEDAAEAAAADAAAAFgEEAAEAAAACAAAAFwEEAAEAAAAYAAAAHAEDAAEAAAABAAAAAAAAAAgACAAIAAAA/wAA/wAA/wAA/wAA/wAA/wAA/wAA/wAAAAAAAAAAAAAAAA==", "base64"));
  const photo = await makePhoto(root, file); photo.chosenOriginal.extension = ".tif";
  const session = await createPreviewGenerator().generateSession([photo], { ...previewOptions, sourceDirectory: root }, new AbortController().signal, () => {});
  try {
    const result = session.results[0]; expect(result?.ok).toBe(true);
    if (result?.ok) { expect(result.pageCount).toBe(2); expect(result.multiPage).toBe(true); expect(result.warnings.join(" ")).toMatch(/page 0 of 2/); const { data, info } = await sharp(result.artifacts[0]!.path).raw().toBuffer({ resolveWithObject: true }); expect(data[0]).toBeGreaterThan(data[2]!); expect(info.width).toBe(4); }
  } finally { await session.dispose(); }
});

it("fails a truncated image alone in a batch and removes its directory when generation is aborted", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-preview-test-")); roots.push(root);
  const good = path.join(root, "good.jpg"); const bad = path.join(root, "truncated.jpg");
  await sharp({ create: { width: 16, height: 12, channels: 3, background: "green" } }).jpeg().toFile(good); await sharp({ create: { width: 16, height: 12, channels: 3, background: "red" } }).jpeg().toFile(bad);
  const bytes = await readFile(bad); await writeFile(bad, bytes.subarray(0, -5));
  const photos = await Promise.all([makePhoto(root, good), makePhoto(root, bad)]);
  const session = await createPreviewGenerator().generateSession(photos, { ...previewOptions, sourceDirectory: root }, new AbortController().signal, () => {});
  try { expect(session.results.find((r) => r.photoId === "good.jpg")?.ok).toBe(true); expect(session.results.find((r) => r.photoId === "truncated.jpg")?.ok).toBe(false); } finally { await session.dispose(); }
  const controller = new AbortController(); controller.abort(); const abortedGenerator = createPreviewGenerator();
  await expect(abortedGenerator.generateSession(photos, { ...previewOptions, sourceDirectory: root }, controller.signal, () => {})).rejects.toBeInstanceOf(PreviewCancellationError);
  await expect(stat(abortedGenerator.workingDirectory)).rejects.toMatchObject({ code: "ENOENT" });
});

it("waits for an active retry before disposing its temporary directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-preview-test-")); roots.push(root); const source = path.join(root, "retry-dispose.jpg");
  await sharp({ create: { width: 2000, height: 2000, channels: 3, background: "yellow" } }).jpeg().toFile(source); const photo = await makePhoto(root, source);
  const generator = createPreviewGenerator(); const session = await generator.generateSession([photo], { ...previewOptions, sourceDirectory: root }, new AbortController().signal, () => {});
  const retry = session.retry(photo.id, new AbortController().signal); await session.dispose(); await expect(retry).resolves.toMatchObject({ ok: true });
  await expect(stat(generator.workingDirectory)).rejects.toMatchObject({ code: "ENOENT" });
});

it("bounds parallel preview decoding when configured concurrency is excessive", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-preview-test-")); roots.push(root);
  const photos: PhotoGroup[] = [];
  for (let index = 0; index < 8; index++) {
    const file = path.join(root, `parallel-${index}.jpg`);
    await sharp({ create: { width: 24, height: 24, channels: 3, background: "purple" } }).jpeg().toFile(file);
    photos.push(await makePhoto(root, file));
  }
  let activeDecodes = 0; let maxActiveDecodes = 0;
  const originalMetadata = sharp.prototype.metadata;
  const metadataSpy = vi.spyOn(sharp.prototype, "metadata").mockImplementation(async function (this: Sharp) {
    activeDecodes++;
    maxActiveDecodes = Math.max(maxActiveDecodes, activeDecodes);
    await new Promise((resolve) => setTimeout(resolve, 10));
    try { return await originalMetadata.call(this); }
    finally { activeDecodes--; }
  });
  try {
    const session = await createPreviewGenerator().generateSession(photos, { ...previewOptions, sourceDirectory: root, concurrency: 32 }, new AbortController().signal, () => {});
    try { expect(session.results.every((result) => result.ok)).toBe(true); }
    finally { await session.dispose(); }
  } finally { metadataSpy.mockRestore(); }
  expect(maxActiveDecodes).toBeLessThanOrEqual(4);
  expect(maxActiveDecodes).toBeGreaterThan(1);
});
