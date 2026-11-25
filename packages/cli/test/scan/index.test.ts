import fs, { chmod, mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PackageOptions, PhotoWithOriginal } from "../../src/types.js";
import { createMatcher, createScanner, directoryKey, filenameKey, isFilesystemRoot } from "../../src/scan/index.js";

const temporaryDirectories: string[] = [];
const options: PackageOptions = {
  sourceDirectory: "", includeRaw: true, includeSidecars: true,
  thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 1,
};

/**
 * Create a fresh temporary folder tracked for cleanup after each test.
 *
 * @returns Path to the new temporary folder.
 */
async function temporary(): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), "catapult-scan-"));
  temporaryDirectories.push(folder);
  return folder;
}

/**
 * Create a file and optionally set a deterministic modification time.
 *
 * @param folder Directory in which to create the fixture.
 * @param name Relative fixture filename.
 * @param mtime Millisecond timestamp for deterministic comparisons.
 * @returns Path to the created file.
 */
async function file(folder: string, name: string, mtime = 1_700_000_000_000): Promise<string> {
  const filename = path.join(folder, name);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, "fixture");
  const date = new Date(mtime);
  await utimes(filename, date, date);
  return filename;
}

/**
 * Scan image fixtures and return each photo with its preferred original.
 *
 * @param folder Folder containing the image fixtures.
 * @returns Scan output and photos with their suggested originals selected.
 */
async function scanPhotos(folder: string): Promise<{ scan: Awaited<ReturnType<ReturnType<typeof createScanner>["scan"]>>; photos: PhotoWithOriginal[] }> {
  const scan = await createScanner().scan(folder, new AbortController().signal);
  const photos = scan.photos.map((photo) => ({ ...photo, chosenOriginal: photo.suggestedOriginal! }));
  return { scan, photos };
}

/**
 * Freeze an object and all nested values for immutability checks.
 *
 * @param value Value to freeze recursively.
 * @returns The same value with its object graph frozen.
 */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe("scanner", () => {
  it("groups direct-child JPEG/TIFF variants case-insensitively and ignores nested images", async () => {
    const folder = await temporary();
    await file(folder, "Trip.JPG");
    await file(folder, "trip.tIfF");
    await file(folder, "nested/hidden.jpg");
    await file(folder, "notes.jpg.txt");
    const scan = await createScanner().scan(folder, new AbortController().signal);
    expect(scan.photos).toHaveLength(1);
    expect(scan.photos[0]?.jpegCandidates).toHaveLength(1);
    expect(scan.photos[0]?.tiffCandidates).toHaveLength(1);
    expect(scan.photos[0]?.suggestedOriginal?.filename).toBe("Trip.JPG");
    expect(scan.photos[0]?.id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("uses Unicode NFC basename matching and produces deterministic groups for hundreds of files", async () => {
    const folder = await temporary();
    await file(folder, "café.jpg");
    await file(folder, "cafe\u{301}.tif");
    for (let index = 0; index < 220; index++) await file(folder, `image-${String(index).padStart(3, "0")}.jpeg`);
    const scanner = createScanner();
    const first = await scanner.scan(folder, new AbortController().signal);
    const second = await scanner.scan(folder, new AbortController().signal);
    expect(first.photos).toHaveLength(221);
    expect(first.photos.find((photo) => photo.jpegCandidates[0]?.filename === "café.jpg")?.tiffCandidates[0]?.filename).toBe("cafe\u{301}.tif");
    expect(first.photos.map((photo) => photo.id)).toEqual(second.photos.map((photo) => photo.id));
    expect(filenameKey("cafe\u{301}")).toBe(filenameKey("café"));
  });

  it("creates distinct portable IDs for punctuation collisions and groups all JPEG/TIFF extensions", async () => {
    const folder = await temporary();
    for (const name of ["a-b.jpg", "a_b.jpeg", "a_b.tif", "a_b.tiff", "a_b.jpeg", "雪.jpg"]) await file(folder, name);
    const scan = await createScanner().scan(folder, new AbortController().signal);
    expect(new Set(scan.photos.map((photo) => photo.id)).size).toBe(scan.photos.length);
    expect(scan.photos.find((photo) => photo.jpegCandidates[0]?.filename === "a_b.jpeg")?.tiffCandidates).toHaveLength(2);
    expect(scan.photos.map((photo) => photo.id).every((id) => /^[A-Za-z0-9_-]+$/.test(id))).toBe(true);
  });

  it("scans 200 photos in a tree with thousands of unrelated files", async () => {
    const folder = await temporary();
    for (let index = 0; index < 200; index++) await file(folder, `photo-${index}.jpg`);
    for (let index = 0; index < 2000; index++) await file(folder, `tree/${Math.floor(index / 100)}/noise-${index}.txt`);
    const started = performance.now();
    const result = await createScanner().scan(folder, new AbortController().signal);
    expect(result.photos).toHaveLength(200);
    expect(performance.now() - started).toBeLessThan(15000);
  });

  it("canonicalizes a chosen linked root and never follows links below it", async () => {
    const real = await temporary();
    const outside = await temporary();
    const link = path.join(os.tmpdir(), `catapult-link-${Date.now()}`);
    await symlink(real, link, "dir");
    temporaryDirectories.push(link);
    await file(real, "root.jpg");
    await file(real, "raw/root.nef");
    await file(real, "linked-only.jpg");
    await file(real, "file-link-only.jpg");
    const outsideRaw = await file(outside, "linked-only.nef");
    await symlink(path.join(real, "raw"), path.join(real, "jump"), "dir");
    await symlink(outside, path.join(real, "outside-directory"), "dir");
    await symlink(outsideRaw, path.join(real, "file-link-only.nef"), "file");
    const scan = await createScanner().scan(link, new AbortController().signal);
    expect(scan.sourceDirectory).toBe(real);
    const photos = scan.photos.map((photo) => ({ ...photo, chosenOriginal: photo.suggestedOriginal! }));
    const match = await createMatcher().initialSearch(photos, scan, options, new AbortController().signal);
    expect(match.photos.find((photo) => photo.chosenOriginal.filename === "linked-only.jpg")?.rawMatch).toMatchObject({ state: "missing", candidates: [], chosen: null });
    expect(match.photos.find((photo) => photo.chosenOriginal.filename === "file-link-only.jpg")?.rawMatch).toMatchObject({ state: "missing", candidates: [], chosen: null });
    expect(match.visitedDirectories.size).toBe(2);
    expect(match.photos.find((photo) => photo.chosenOriginal.filename === "root.jpg")?.rawMatch.candidates).toHaveLength(1);
  });
});

describe("RAW and sidecar matcher", () => {
  it("accepts an exact basename at the inclusive five second boundary and marks later differences suspicious", async () => {
    const folder = await temporary();
    await file(folder, "a.jpg", 1_700_000_000_000);
    await file(folder, "a.NEF", 1_700_000_005_000);
    await file(folder, "b.jpg", 1_700_000_000_000);
    await file(folder, "b.cr3", 1_700_000_005_001);
    const { scan, photos } = await scanPhotos(folder);
    const session = await createMatcher().initialSearch(photos, scan, { ...options, sourceDirectory: folder }, new AbortController().signal);
    expect(session.photos.find((photo) => photo.chosenOriginal.filename === "a.jpg")?.rawMatch).toMatchObject({ state: "accepted", decision: null, matchedBy: "exact-basename-mtime" });
    expect(session.photos.find((photo) => photo.chosenOriginal.filename === "b.jpg")?.rawMatch.state).toBe("suspicious");
  });

  it("searches descendants once, ignores symlink loops and reports unreadable or missing directories as warnings", async () => {
    const folder = await temporary();
    await file(folder, "shot.jpg");
    await file(folder, "sub/deeper/shot.dng");
    await symlink(folder, path.join(folder, "sub", "loop"), "dir");
    const { scan, photos } = await scanPhotos(folder);
    const matcher = createMatcher();
    const session = await matcher.initialSearch(photos, scan, { ...options, sourceDirectory: folder }, new AbortController().signal);
    expect(session.photos[0]?.rawMatch.state).toBe("accepted");
    expect(session.visitedDirectories.size).toBe(3);
    expect(session.warnings).toEqual([]);
    const bad = await matcher.initialSearch(photos, { ...scan, sourceDirectory: path.join(folder, "gone") }, { ...options, sourceDirectory: folder }, new AbortController().signal);
    expect(bad.warnings.length).toBeGreaterThan(0);
  });

  it("turns directory permission errors into warnings and reports duplicate matches as ambiguous", async () => {
    const folder = await temporary();
    const blocked = path.join(folder, "blocked");
    await mkdir(blocked);
    await file(folder, "same.jpg");
    await file(folder, "first/same.nef");
    await file(folder, "second/same.nef");
    const { scan, photos } = await scanPhotos(folder);
    const matcher = createMatcher({ readDirectory: async (target): Promise<Dirent[]> => {
      if (target === blocked) {
        const error = new Error("denied") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }
      return fs.readdir(target, { withFileTypes: true });
    } });
    const session = await matcher.initialSearch(photos, scan, options, new AbortController().signal);
    expect(session.warnings.some((warning) => warning.includes("denied"))).toBe(true);
    expect(session.photos[0]?.rawMatch.state).toBe("ambiguous");
    expect(session.photos[0]?.rawMatch.candidates).toHaveLength(2);
  });

  it("expands one parent level, updates requested unresolved matches and preserves prior decisions", async () => {
    const root = await temporary();
    const folder = path.join(root, "selected");
    await mkdir(folder);
    await file(folder, "one.jpg");
    await file(root, "one.RAF");
    const { scan, photos } = await scanPhotos(folder);
    const matcher = createMatcher();
    const session = await matcher.initialSearch(photos, scan, { ...options, sourceDirectory: folder }, new AbortController().signal);
    expect(session.photos[0]?.rawMatch.state).toBe("missing");
    const expanded = await matcher.expandParents(session, [photos[0]!.id], new AbortController().signal);
    expect(expanded.session.photos[0]?.rawMatch.state).toBe("accepted");
    expect(expanded.newlyVisitedDirectories.length).toBeGreaterThan(0);
    const manuallyInspected = await matcher.inspectFile(path.join(root, "one.RAF"), new AbortController().signal);
    const preserved = matcher.applyDecision(expanded.session, { photoId: photos[0]!.id, decision: "manual-pick", candidate: manuallyInspected });
    expect(expanded.session.photos[0]?.rawMatch.decision).toBeNull();
    expect(preserved.photos[0]?.rawMatch.decision).toBe("manual-pick");
  });

  it("handles missing/disabled states, manual picks, folder acceptance and rejects invalid decisions", async () => {
    const folder = await temporary();
    await file(folder, "one.jpg");
    await file(folder, "one.nef", 1_700_000_010_000);
    await file(folder, "other.jpg");
    await file(folder, "other.cr2", 1_700_000_010_000);
    const { scan, photos } = await scanPhotos(folder);
    const matcher = createMatcher();
    const disabled = await matcher.initialSearch(photos, scan, { ...options, includeRaw: false }, new AbortController().signal);
    expect(disabled.photos.every((photo) => photo.rawMatch.state === "disabled")).toBe(true);
    expect(() => matcher.applyDecision(disabled, { photoId: photos[0]!.id, decision: "accept-missing" })).toThrow();
    expect(matcher.applyDecision(disabled, { photoId: photos[0]!.id, decision: "deselect" }).photos[0]?.selected).toBe(false);
    const session = await matcher.initialSearch(photos, scan, options, new AbortController().signal);
    const picked = await matcher.inspectFile(path.join(folder, "one.nef"), new AbortController().signal);
    const decided = matcher.applyDecision(session, { photoId: photos[0]!.id, decision: "manual-pick", candidate: picked });
    expect(decided.photos[0]?.rawMatch.matchedBy).toBe("user");
    expect(() => matcher.applyDecision(session, { photoId: photos[0]!.id, decision: "accept", path: "/nope.nef" })).toThrow();
    const otherPhoto = photos.find((photo) => photo.chosenOriginal.filename === "other.jpg")!;
    const accepted = matcher.applyDecision(decided, { photoId: otherPhoto.id, decision: "accept-all-in-folder", directory: folder });
    expect(accepted.photos.find((photo) => photo.id === otherPhoto.id)?.rawMatch.decision).toBe("accept-all-in-folder");
    expect(accepted.photos.filter((photo) => photo.rawMatch.decision === "accept-all-in-folder")).toHaveLength(1);
    expect(accepted.photos.find((photo) => photo.id === otherPhoto.id)?.rawMatch.matchedBy).toBe("user");
    expect(accepted.photos.find((photo) => photo.id === photos[0]!.id)?.rawMatch.decision).toBe("manual-pick");
  });

  it("accepts every eligible unresolved match in one folder and preserves other photos", async () => {
    const root = await temporary();
    const folder = path.join(root, "selected");
    await file(folder, "first.jpg");
    await file(folder, "first.nef", 1_700_000_010_000);
    await file(folder, "second.jpg");
    await file(folder, "second.nef", 1_700_000_010_000);
    await file(folder, "ambiguous.jpg");
    await file(folder, "one/ambiguous.nef");
    await file(folder, "two/ambiguous.nef");
    await file(folder, "already.jpg");
    await file(folder, "already.nef", 1_700_000_010_000);
    await file(folder, "elsewhere.jpg");
    await file(folder, "other-raw/elsewhere.nef");
    const { scan, photos } = await scanPhotos(folder);
    const matcher = createMatcher();
    const initial = await matcher.initialSearch(photos, scan, options, new AbortController().signal);
    const already = initial.photos.find((photo) => photo.chosenOriginal.filename === "already.jpg")!;
    const decided = matcher.applyDecision(initial, { photoId: already.id, decision: "accept", path: already.rawMatch.candidates[0]!.path });
    const first = decided.photos.find((photo) => photo.chosenOriginal.filename === "first.jpg")!;
    const accepted = matcher.applyDecision(decided, { photoId: first.id, decision: "accept-all-in-folder", directory: folder });
    const byName = new Map(accepted.photos.map((photo) => [photo.chosenOriginal.filename, photo]));

    for (const name of ["first.jpg", "second.jpg"]) {
      expect(byName.get(name)?.rawMatch).toMatchObject({ state: "accepted", decision: "accept-all-in-folder", matchedBy: "user" });
    }
    expect(byName.get("ambiguous.jpg")?.rawMatch).toMatchObject({ state: "ambiguous", decision: null });
    expect(byName.get("already.jpg")?.rawMatch.decision).toBe("accept");
    expect(byName.get("elsewhere.jpg")?.rawMatch).toMatchObject({ state: "accepted", decision: null, matchedBy: "exact-basename-mtime" });
    expect(accepted.photos.filter((photo) => photo.rawMatch.decision === "accept-all-in-folder").map((photo) => photo.chosenOriginal.filename)).toEqual(["first.jpg", "second.jpg"]);
  });

  it("keeps every decision immutable when its input session is deeply frozen", async () => {
    const folder = await temporary();
    await file(folder, "photo.jpg");
    await file(folder, "photo.nef", 1_700_000_010_000);
    const { scan, photos } = await scanPhotos(folder);
    const matcher = createMatcher();
    const base = await matcher.initialSearch(photos, scan, options, new AbortController().signal);
    const photo = base.photos[0]!;
    const candidate = await matcher.inspectFile(path.join(folder, "photo.nef"), new AbortController().signal);
    const decisions = [
      { photoId: photo.id, decision: "accept", path: candidate.path },
      { photoId: photo.id, decision: "manual-pick", candidate },
      { photoId: photo.id, decision: "accept-missing" },
      { photoId: photo.id, decision: "deselect" },
      { photoId: photo.id, decision: "accept-all-in-folder", directory: folder },
    ] as const;
    for (const decision of decisions) {
      const frozen = deepFreeze(structuredClone(base));
      expect(() => matcher.applyDecision(frozen, decision)).not.toThrow();
      expect(frozen.photos[0]?.rawMatch.decision).toBeNull();
      expect(frozen.photos[0]?.selected).toBe(true);
    }
  });

  it("records user methods for choices and accepts missing from suspicious or ambiguous states", async () => {
    const folder = await temporary();
    await file(folder, "suspicious.jpg");
    await file(folder, "suspicious.nef", 1_700_000_020_000);
    await file(folder, "ambiguous.jpg");
    await file(folder, "one/ambiguous.cr2");
    await file(folder, "two/ambiguous.cr2");
    const { scan, photos } = await scanPhotos(folder);
    const matcher = createMatcher();
    const initial = await matcher.initialSearch(photos, scan, options, new AbortController().signal);
    expect(initial.photos.find((photo) => photo.chosenOriginal.filename === "suspicious.jpg")?.rawMatch.decision).toBeNull();
    const accepted = matcher.applyDecision(initial, { photoId: initial.photos[0]!.id, decision: "accept", path: initial.photos[0]!.rawMatch.candidates[0]!.path });
    expect(accepted.photos[0]?.rawMatch.matchedBy).toBe("user");
    const unresolved = initial.photos.filter((item) => item.rawMatch.state === "suspicious" || item.rawMatch.state === "ambiguous");
    for (const photo of unresolved) {
      const result = matcher.applyDecision(initial, { photoId: photo.id, decision: "accept-missing" });
      const changed = result.photos.find((item) => item.id === photo.id)!;
      expect(changed.rawMatch).toMatchObject({ state: "missing", chosen: null, matchedBy: "missing" });
    }
  });

  it("deduplicates expanded candidates, re-resolves old plus new candidates, and never reads a directory twice", async () => {
    const root = await temporary();
    const selected = path.join(root, "selected");
    await mkdir(selected);
    await file(selected, "x.jpg");
    await file(selected, "x.nef", 1_700_000_010_000);
    await file(root, "x.NEF");
    const { scan, photos } = await scanPhotos(selected);
    const counts = new Map<string, number>();
    const matcher = createMatcher({ isFilesystemRoot: (directory) => directory === root, readDirectory: async (directory) => {
      counts.set(directory, (counts.get(directory) ?? 0) + 1);
      return fs.readdir(directory, { withFileTypes: true });
    } });
    const session = await matcher.initialSearch(photos, scan, options, new AbortController().signal);
    expect(session.photos[0]?.rawMatch.state).toBe("suspicious");
    const expanded = await matcher.expandParents(session, [photos[0]!.id], new AbortController().signal);
    expect(expanded.session.photos[0]?.rawMatch.state).toBe("ambiguous");
    expect(expanded.session.photos[0]?.rawMatch.candidates).toHaveLength(2);
    await matcher.expandParents(expanded.session, [photos[0]!.id], new AbortController().signal);
    // @ts-expect-error Iterator#every is not in the project's ES2023 type library.
    expect(counts.values().every((count: number) => count === 1)).toBe(true);
  });

  it("collects both sidecar naming styles beside originals and RAWs, including when RAW is absent", async () => {
    const folder = await temporary();
    await file(folder, "image.JPG");
    await file(folder, "image.xmp");
    await file(folder, "image.JPG.pp3");
    await file(folder, "image.dop");
    await file(folder, "image.nef");
    await file(folder, "image.NEF.xmp");
    const { photos } = await scanPhotos(folder);
    const matcher = createMatcher();
    const candidates = await matcher.collectSidecars({ chosenOriginal: photos[0]!.chosenOriginal!, rawMatches: [] }, new AbortController().signal);
    expect(candidates.map((candidate) => candidate.filename)).toEqual(expect.arrayContaining(["image.JPG.pp3", "image.dop", "image.xmp"]));
    expect(candidates).toHaveLength(3);
    const withRaw = await matcher.collectSidecars({ chosenOriginal: photos[0]!.chosenOriginal!, rawMatches: [{ ...(await matcher.inspectFile(path.join(folder, "image.nef"), new AbortController().signal)), role: "raw" }] }, new AbortController().signal);
    expect(withRaw.map((candidate) => candidate.filename)).toEqual(expect.arrayContaining(["image.JPG.pp3", "image.NEF.xmp", "image.dop", "image.xmp"]));
    expect(withRaw).toHaveLength(4);
  });

  it("normalizes sidecar case and Unicode while rejecting basename lookalikes and deduplicating paths", async () => {
    const folder = await temporary();
    await file(folder, "café.jpg");
    await file(folder, "cafe\u{301}.XMP");
    await file(folder, "café.jpg.DOP");
    await file(folder, "café-extra.xmp");
    const { photos } = await scanPhotos(folder);
    const candidate = photos[0]!.chosenOriginal!;
    const matcher = createMatcher();
    const sidecars = await matcher.collectSidecars({ chosenOriginal: candidate, rawMatches: [{ ...candidate, role: "raw" }] }, new AbortController().signal);
    expect(sidecars.map((item) => item.filename).toSorted((a, b) => a.localeCompare(b))).toEqual(["café.jpg.DOP", "cafe\u{301}.XMP"]);
  });

  it("honors AbortSignal during long-running walks", async () => {
    const folder = await temporary();
    for (let index = 0; index < 30; index++) await file(folder, `sub-${index}/a.nef`);
    const { scan, photos } = await scanPhotos(folder);
    const controller = new AbortController();
    let reads = 0;
    const matcher = createMatcher({ readDirectory: async (directory) => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      if (++reads === 2) controller.abort(new Error("stop mid-walk"));
      return entries;
    } });
    await expect(matcher.initialSearch(photos, scan, options, controller.signal)).rejects.toThrow("stop mid-walk");
  });

  it("throttles progress callbacks and always emits a final event", async () => {
    const folder = await temporary();
    for (let index = 0; index < 10; index++) await file(folder, `photo-${index}.jpg`);
    const events: Array<{ completed: number; message: string }> = [];
    await createScanner().scan(folder, new AbortController().signal, (event) => {
      if (event.stage === "scan") events.push(event);
    });
    expect(events.length).toBeLessThan(10);
    expect(events.at(-1)?.message).toBe("Found 10 photos");
  });

  it("propagates sidecar read errors except missing directories", async () => {
    const folder = await temporary();
    await file(folder, "image.jpg");
    const { photos } = await scanPhotos(folder);
    const blockedFile = path.join(folder, "block");
    await writeFile(blockedFile, "not a directory");
    const denied = path.join(blockedFile, "image.xmp");
    await expect(createMatcher().collectSidecars({ chosenOriginal: { ...photos[0]!.chosenOriginal!, path: denied }, rawMatches: [] }, new AbortController().signal)).rejects.toThrow("Could not read sidecar directory");
  });

  it("skips a chmod-unreadable directory when the process can observe permissions", async (context) => {
    if (process.getuid?.() === 0) context.skip();
    const folder = await temporary();
    const denied = path.join(folder, "blocked");
    await mkdir(denied);
    await file(folder, "photo.jpg");
    await chmod(denied, 0);
    const { scan, photos } = await scanPhotos(folder);
    const result = await createMatcher().initialSearch(photos, scan, options, new AbortController().signal);
    expect(result.warnings.some((warning) => warning.includes("Could not read directory"))).toBe(true);
  });
});

describe("path helpers", () => {
  it("normalizes Windows directory matching and preserves filesystem roots", () => {
    expect(directoryKey("C:\\Photos\\RAW", path.win32)).toBe(directoryKey("c:\\photos\\raw", path.win32));
    expect(isFilesystemRoot("C:\\", path.win32)).toBe(true);
    expect(isFilesystemRoot("\\\\server\\share\\", path.win32)).toBe(true);
    expect(isFilesystemRoot("C:\\Photos", path.win32)).toBe(false);
  });
});
