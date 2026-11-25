import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ZipReader, BlobReader, TextWriter } from "@zip.js/zip.js";
import { expect, it } from "vitest";
import { createServices } from "../../src/services.js";
import type { PackageOptions, PackagePlan } from "../../src/types.js";

it("runs real scan, match, preview and ZIP stages without changing source bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-pipeline-"));
  const source = path.join(root, "source with spaces");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(path.join(source, "subfolder"), { recursive: true }));
  const jpeg = path.join(source, "café.jpg");
  const raw = path.join(source, "café.nef");
  const suspicious = path.join(source, "subfolder", "hidden.CR2");
  const ambiguousOne = path.join(source, "twins.arw");
  const ambiguousTwo = path.join(source, "subfolder", "twins.ARW");
  const tiff = path.join(source, "choice.tif");
  const pairedJpeg = path.join(source, "choice.jpg");
  const missingJpeg = path.join(source, "lonely.jpg");
  const parentJpeg = path.join(source, "parent.jpg");
  const parentRaw = path.join(root, "parent.nef");
  const suspiciousRaw = path.join(source, "subfolder", "choice.nef");
  const multipageTiff = path.join(source, "multipage.tif");
  const collisionNfd = path.join(source, "café.jpg");
  const twins = path.join(source, "twins.jpg");
  const sidecars = [path.join(source, "café.xmp"), path.join(source, "twins.xmp")];
  const zipPath = path.join(root, "package.zip");
  const abort = new AbortController();
  const services = createServices();
  let session: Awaited<ReturnType<typeof services.preview.generateSession>> | undefined;
  try {
    await sharp({ create: { width: 24, height: 16, channels: 3, background: "orange" } }).jpeg().toFile(jpeg);
    await sharp({ create: { width: 12, height: 16, channels: 3, background: "blue" } }).tiff().toFile(tiff);
    await sharp({ create: { width: 12, height: 16, channels: 3, background: "yellow" } }).jpeg().toFile(pairedJpeg);
    await sharp({ create: { width: 15, height: 11, channels: 3, background: "pink" } }).jpeg().toFile(missingJpeg);
    await sharp({ create: { width: 15, height: 11, channels: 3, background: "cyan" } }).jpeg().toFile(parentJpeg);
    await writeFile(multipageTiff, Buffer.from("SUkqAAgAAAAKAAABBAABAAAABAAAAAEBBAABAAAAAgAAAAIBAwADAAAAhgAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAAjAAAABUBAwABAAAAAwAAABYBBAABAAAAAgAAABcBBAABAAAAGAAAABwBAwABAAAAAQAAALgAAAAIAAgACAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAAAAAAAAAAAAAAAAABJSSoACAAAAAoAAAEEAAEAAAAEAAAAAQEEAAEAAAACAAAAAgEDAAMAAAA2AQAAAwEDAAEAAAABAAAABgEDAAEAAAACAAAAEQEEAAEAAAA8AQAAFQEDAAEAAAADAAAAFgEEAAEAAAACAAAAFwEEAAEAAAAYAAAAHAEDAAEAAAABAAAAAAAAAAgACAAIAAAA/wAA/wAA/wAA/wAA/wAA/wAA/wAA/wAAAAAAAAAAAAAAAA==", "base64"));
    await sharp({ create: { width: 18, height: 12, channels: 3, background: "purple" } }).jpeg().toFile(twins);
    await Promise.all([writeFile(raw, "RAW fixture"), writeFile(suspicious, "unrelated RAW"), writeFile(suspiciousRaw, "stale suspicious RAW"), writeFile(parentRaw, "parent RAW"), writeFile(ambiguousOne, "ambiguous A"), writeFile(ambiguousTwo, "ambiguous B"), writeFile(collisionNfd, "NFD collision"), ...sidecars.map((file) => writeFile(file, "shared sidecar content"))]);
    await utimes(suspiciousRaw, new Date(0), new Date(0));
    const originals = await Promise.all([jpeg, tiff, pairedJpeg, missingJpeg, parentJpeg, multipageTiff, collisionNfd, twins].map(async (file) => [file, createHash("sha256").update(await readFile(file)).digest("hex")] as const));
    const scan = await services.scanner.scan(source, abort.signal);
    expect(scan.photos.length).toBe(6);
    const chosen = scan.photos.map((photo) => ({ ...photo, chosenOriginal: photo.tiffCandidates[0] ?? photo.jpegCandidates.find((candidate) => [jpeg, twins, pairedJpeg].includes(candidate.path)) ?? photo.jpegCandidates[0]! }));
    const options: PackageOptions = { sourceDirectory: source, includeRaw: true, includeSidecars: true, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 2 };
    let matches = await services.matcher.initialSearch(chosen, scan, options, abort.signal);
    const auto = matches.photos.find((photo) => photo.chosenOriginal.path === jpeg)!;
    expect(auto.rawMatch.state).toBe("accepted");
    expect(matches.photos.find((photo) => photo.chosenOriginal.filename === "choice.tif")?.rawMatch.state).toBe("suspicious");
    const parentPhoto = matches.photos.find((photo) => photo.chosenOriginal.path === parentJpeg)!;
    const parentExpansion = await services.matcher.expandParents(matches, [parentPhoto.id], abort.signal);
    matches = parentExpansion.session;
    expect(matches.photos.find((photo) => photo.id === parentPhoto.id)?.rawMatch.state).toBe("accepted");
    expect(parentExpansion.newlyVisitedDirectories).toContain(root);
    const missing = matches.photos.find((photo) => photo.rawMatch.state === "missing")!;
    const ambiguousMatch = matches.photos.find((photo) => photo.chosenOriginal.path === twins)!;
    expect(ambiguousMatch.rawMatch.state).toBe("ambiguous");
    const resolved = matches.photos.map((photo) => {
      switch (photo.rawMatch.state) {
        case "missing": {
          return services.matcher.applyDecision(matches, { photoId: photo.id, decision: "accept-missing" }).photos.find((item) => item.id === photo.id)!;
        }
        case "ambiguous":
        case "suspicious": {
          return services.matcher.applyDecision(matches, { photoId: photo.id, decision: "accept", path: photo.rawMatch.candidates[0]!.path }).photos.find((item) => item.id === photo.id)!;
        }
        default: {
          return photo;
        }
      }
    });
    expect(missing).toBeTruthy();
    const photos = await Promise.all(resolved.map(async (photo) => ({ ...photo, sidecarMatches: await services.matcher.collectSidecars({ chosenOriginal: photo.chosenOriginal, rawMatches: photo.rawMatch.chosen ? [photo.rawMatch.chosen] : [] }, abort.signal) })));
    session = await services.preview.generateSession(photos, options, abort.signal, () => {});
    const previewResults = session.results;
    const multiPagePhoto = photos.find((photo) => photo.chosenOriginal.path === multipageTiff)!;
    expect(previewResults.find((result) => result.photoId === multiPagePhoto.id)).toMatchObject({ ok: true, pageCount: 2, multiPage: true });
    const selected = photos.map((photo) => ({ photo, chosenOriginal: photo.chosenOriginal, preview: previewResults.find((result) => result.photoId === photo.id)! })).filter((item): item is typeof item & { preview: Extract<(typeof previewResults)[number], { ok: true }> } => item.preview.ok).map((item) => ({ ...item, raw: item.photo.rawMatch.chosen ? [item.photo.rawMatch.chosen] : [], sidecars: item.photo.sidecarMatches }));
    const plan: PackagePlan = { photos: selected, outputPath: zipPath, options, versions: { generatorName: "Catapult companion CLI", generatorVersion: "0.1.0", sharpVersion: sharp.versions.sharp!, zipVersion: "2.25.0" } };
    const written = await services.zip.write(plan, abort.signal);
    expect(written.manifest.photos).toHaveLength(6);
    expect(written.manifest.attachments.filter((attachment) => attachment.role === "sidecar")).toHaveLength(1);
    const reader = new ZipReader(new BlobReader(new Blob([await readFile(zipPath)])));
    try {
      const entries = await reader.getEntries();
      expect(entries.some((entry) => entry.filename === "manifest.json")).toBe(true);
      const manifestEntry = entries.find((entry) => entry.filename === "manifest.json")!;
      if (manifestEntry.directory) throw new Error("Manifest entry is a directory");
      expect(JSON.parse(await manifestEntry.getData(new TextWriter()))).toMatchObject({ format: "catapult-photo-package", version: 1 });
    } finally { await reader.close(); }
    for (const [file, hash] of originals) expect(createHash("sha256").update(await readFile(file)).digest("hex")).toBe(hash);
  } finally { await session?.dispose(); await rm(root, { recursive: true, force: true }); }
});
