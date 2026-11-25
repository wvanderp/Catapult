import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AttachmentCandidate, MatchDecisionInput, Matcher, Scanner } from "../types.js";
import type { FileCandidate } from "../types.js";
import { classify, directoryKey, filenameKey, isFilesystemRoot } from "./match.js";
import { collectSidecars } from "./sidecars.js";
import { inspect, throwIfAborted, throttledProgress, type DirectoryReader } from "./shared.js";
import { asRawCandidates, isRawExtension, walk } from "./walk.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".tif", ".tiff"]);
interface CandidateGroup { jpeg: FileCandidate[]; tiff: FileCandidate[]; name: string }


/**
 * Create a stable, filesystem-safe photo identifier and resolve collisions.
 *
 * @param name Original image filename used to derive the identifier.
 * @param seen Identifiers already assigned during this scan.
 * @returns A unique portable identifier.
 */
function safeId(name: string, seen: Set<string>): string {
  const stem = path.parse(name).name.normalize("NFC");
  const safe = stem.replaceAll(/[^A-Za-z0-9_-]+/g, "-").replaceAll(/^-+|-+$/g, "") || "photo";
  const digest = createHash("sha256").update(stem).digest("hex").slice(0, 8);
  let id = `${safe.slice(0, 48)}-${digest}`;
  let suffix = 2;
  while (seen.has(id)) id = `${safe.slice(0, 44)}-${digest}-${suffix++}`;
  seen.add(id);
  return id;
}

/**
 * Create the direct-child image scanner.
 *
 * @returns A scanner that groups image variants from the selected directory.
 */
export function createScanner(): Scanner {
  return {
    async scan(sourceDirectory, signal, onProgress) {
      const source = await fs.realpath(path.resolve(sourceDirectory));
      const progress = throttledProgress(onProgress);
      const warnings: string[] = [];
      const groups = new Map<string, CandidateGroup>();
      let entries;
      try { entries = await fs.readdir(source, { withFileTypes: true }); }
      catch (error) {
        if (signal.aborted) throwIfAborted(signal);
        throw new Error(`Could not read source directory ${source}: ${String(error)}`, { cause: error });
      }
      throwIfAborted(signal);
      const sorted = entries.toSorted((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.name.localeCompare(b.name));
      const imageEntries = sorted.filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()));
      let completed = 0;
      for (const entry of imageEntries) {
        throwIfAborted(signal);
        const extension = path.extname(entry.name).toLowerCase();
        try {
          const candidate = await inspect(path.join(source, entry.name), signal);
          const key = filenameKey(path.parse(entry.name).name);
          const group = groups.get(key) ?? { jpeg: [], tiff: [], name: path.parse(entry.name).name };
          (extension === ".jpg" || extension === ".jpeg" ? group.jpeg : group.tiff).push(candidate);
          groups.set(key, group);
        } catch (error) {
          if (signal.aborted) throwIfAborted(signal);
          warnings.push(`Could not inspect ${path.join(source, entry.name)}: ${String(error)}`);
        }
        completed++;
        progress({ stage: "scan", completed, total: imageEntries.length, message: `Scanned ${completed} files` });
      }
      const seen = new Set<string>();
      // eslint-disable-next-line unicorn/prefer-spread -- Iterator#toArray is unavailable in the configured TS libs.
      const groupedPhotos: CandidateGroup[] = Array.from(groups.values());
      const photos = groupedPhotos.toSorted((a, b) => filenameKey(a.name).localeCompare(filenameKey(b.name)) || a.name.localeCompare(b.name)).map((group) => {
        const jpegCandidates = group.jpeg.toSorted((a, b) => a.filename.localeCompare(b.filename));
        const tiffCandidates = group.tiff.toSorted((a, b) => a.filename.localeCompare(b.filename));
        return { id: safeId(group.name, seen), jpegCandidates, tiffCandidates, selected: true, suggestedOriginal: jpegCandidates[0] ?? tiffCandidates[0] ?? null };
      });
      progress({ stage: "scan", completed: imageEntries.length, total: imageEntries.length, message: `Found ${photos.length} photos` }, true);
      return { sourceDirectory: source, visitedDirectories: [source], photos, warnings };
    },
  };
}

/**
 * Create the RAW and sidecar matcher.
 *
 * @param dependencies Optional directory reader and filesystem-root override.
 * @param dependencies.readDirectory Reads directory entries during RAW walks.
 * @param dependencies.isFilesystemRoot Identifies when parent expansion has reached a filesystem root.
 * @returns A matcher for searching candidates and applying user decisions.
 */
export function createMatcher(dependencies: { readDirectory?: DirectoryReader; isFilesystemRoot?: (directory: string) => boolean } = {}): Matcher {
  const readDirectory = dependencies.readDirectory ?? ((directory) => fs.readdir(directory, { withFileTypes: true }));
  const rootCheck = dependencies.isFilesystemRoot ?? isFilesystemRoot;
  return {
    async initialSearch(photos, scan, options, signal, onProgress) {
      const progress = throttledProgress(onProgress);
      const visitedDirectories = new Set<string>();
      const warnings = [...scan.warnings];
      const sourceDirectory = path.resolve(scan.sourceDirectory);
      const rawFiles = options.includeRaw ? await walk(sourceDirectory, visitedDirectories, signal, warnings, progress, readDirectory) : [];
      const candidates = options.includeRaw ? asRawCandidates(rawFiles) : [];
      const groups = photos.map((photo) => ({
        ...photo,
        rawMatch: options.includeRaw ? classify(photo, candidates) : { state: "disabled" as const, candidates: [], chosen: null, decision: null, matchedBy: "disabled" as const },
        sidecarMatches: [],
      }));
      progress({ stage: "match", completed: photos.length, total: photos.length, message: "RAW matching complete" }, true);
      return { photos: groups, visitedDirectories, searchRoot: sourceDirectory, reachedFilesystemRoot: rootCheck(sourceDirectory), warnings };
    },
    async inspectFile(filePath, signal) {
      const candidate = await inspect(path.resolve(filePath), signal);
      if (!isRawExtension(candidate.extension)) throw new Error(`Unsupported RAW extension: ${candidate.extension}`);
      return candidate;
    },
    async expandParents(session, photoIds, signal, onProgress) {
      throwIfAborted(signal);
      const progress = throttledProgress(onProgress);
      const current = path.resolve(session.searchRoot);
      const parent = path.dirname(current);
      const warnings = [...session.warnings];
      if (rootCheck(current)) {
        progress({ stage: "match", completed: 0, total: 0, message: "Filesystem root already searched" }, true);
        return { session: { ...session, reachedFilesystemRoot: true, warnings }, newlyVisitedDirectories: [], searchRoot: current, reachedFilesystemRoot: true };
      }
      const visited = new Set(session.visitedDirectories);
      const before = new Set(visited);
      const additional = asRawCandidates(await walk(parent, visited, signal, warnings, progress, readDirectory));
      const newlyVisitedDirectories = [...visited].filter((key) => !before.has(key)).toSorted((a, b) => a.localeCompare(b));
      const resolveIds = new Set(photoIds);
      const photos = session.photos.map((photo) => {
        if (!resolveIds.has(photo.id) || photo.rawMatch.state === "accepted" || photo.rawMatch.decision !== null) return photo;
        const merged = new Map<string, AttachmentCandidate>();
        for (const candidate of photo.rawMatch.candidates) merged.set(directoryKey(candidate.path), candidate);
        for (const candidate of additional) merged.set(directoryKey(candidate.path), candidate);
        // eslint-disable-next-line unicorn/prefer-spread -- Iterator#toArray is unavailable in the configured TS libs.
        return { ...photo, rawMatch: classify(photo, Array.from(merged.values())) };
      });
      const next = { ...session, photos, visitedDirectories: visited, searchRoot: parent, reachedFilesystemRoot: rootCheck(parent), warnings };
      progress({ stage: "match", completed: newlyVisitedDirectories.length, total: newlyVisitedDirectories.length, message: "Parent search complete" }, true);
      return { session: next, newlyVisitedDirectories, searchRoot: parent, reachedFilesystemRoot: next.reachedFilesystemRoot };
    },
    applyDecision(session, input) {
      const target = session.photos.find((photo) => photo.id === input.photoId);
      if (!target) throw new Error(`Unknown photo: ${input.photoId}`);
      const decide = (photo: typeof target, decision: MatchDecisionInput): typeof target => {
        const match = photo.rawMatch;
        if (match.state === "disabled") {
          if (decision.decision === "deselect") return { ...photo, selected: false, rawMatch: { ...match, decision: "deselect" } };
          throw new Error("RAW collection is disabled");
        }
        if (decision.decision === "accept") {
          const chosen = match.candidates.find((candidate) => candidate.path === decision.path);
          if (!chosen) throw new Error("Selected RAW candidate is not available");
          return { ...photo, rawMatch: { ...match, state: "accepted", chosen, decision: "accept", matchedBy: "user" } };
        }
        if (decision.decision === "manual-pick") {
          const candidate = decision.candidate;
          if (!isRawExtension(candidate.extension) || path.extname(candidate.filename).toLowerCase() !== candidate.extension.toLowerCase() || path.basename(candidate.path) !== candidate.filename || !path.isAbsolute(candidate.path)) throw new Error("Invalid manual RAW candidate");
          const chosen: AttachmentCandidate = { ...candidate, role: "raw" };
          const candidates = new Map(match.candidates.map((item) => [directoryKey(item.path), item]));
          candidates.set(directoryKey(chosen.path), chosen);
          // eslint-disable-next-line unicorn/prefer-spread -- Iterator#toArray is unavailable in the configured TS libs.
          return { ...photo, rawMatch: { ...match, state: "accepted", candidates: Array.from(candidates.values()), chosen, decision: "manual-pick", matchedBy: "user" } };
        }
        if (decision.decision === "accept-missing") {
          return { ...photo, rawMatch: { ...match, state: "missing", chosen: null, decision: "accept-missing", matchedBy: "missing" } };
        }
        if (decision.decision === "deselect") return { ...photo, selected: false, rawMatch: { ...match, decision: "deselect" } };
        throw new Error("Accept-all decisions must be applied as a folder operation");
      };
      if (input.decision === "accept-all-in-folder") {
        const folder = directoryKey(input.directory);
        const eligible = session.photos.filter((photo) => photo.rawMatch.decision === null && photo.rawMatch.state !== "accepted" && photo.rawMatch.candidates.length === 1 && directoryKey(path.dirname(photo.rawMatch.candidates[0]!.path)) === folder);
        if (eligible.every((photo) => photo.id !== input.photoId)) throw new Error("Photo does not have exactly one unresolved candidate in this folder");
        return { ...session, photos: session.photos.map((photo) => eligible.includes(photo) ? { ...photo, rawMatch: { ...photo.rawMatch, state: "accepted", chosen: photo.rawMatch.candidates[0]!, decision: "accept-all-in-folder", matchedBy: "user" } } : photo) };
      }
      return { ...session, photos: session.photos.map((photo) => photo.id === input.photoId ? decide(photo, input) : photo) };
    },
    collectSidecars,
  };
}

export {classify, directoryKey, filenameKey, isFilesystemRoot} from "./match.js";
export {collectSidecars} from "./sidecars.js";
export {walk} from "./walk.js";
