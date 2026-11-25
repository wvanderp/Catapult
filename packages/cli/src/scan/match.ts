import path from "node:path";
import type { AttachmentCandidate, AttachmentMatch, PhotoWithOriginal } from "../types.js";

/**
 * Normalize a filename key for case-insensitive Unicode matching.
 *
 * @param value Filename stem to normalize.
 * @returns NFC-normalized, lowercase filename key.
 */
export function filenameKey(value: string): string { return value.normalize("NFC").toLocaleLowerCase("en-US"); }
/**
 * Resolve a directory key with platform-appropriate case handling.
 *
 * @param value Directory path to normalize.
 * @param pathApi Path implementation used to resolve the path.
 * @returns Stable directory key for comparisons and deduplication.
 */
export function directoryKey(value: string, pathApi: typeof path = path): string {
  const resolved = pathApi.resolve(value);
  return pathApi === path.win32 ? resolved.replaceAll("/", "\\").toLocaleLowerCase("en-US") : resolved;
}
/**
 * Determine whether a path identifies a filesystem root.
 *
 * @param value Directory path to check.
 * @param pathApi Path implementation used to resolve the path.
 * @returns Whether the resolved path is its own parent.
 */
export function isFilesystemRoot(value: string, pathApi: typeof path = path): boolean {
  const resolved = pathApi.resolve(value);
  return pathApi.dirname(resolved) === resolved;
}
/**
 * Classify RAW candidates matching a photo's chosen original.
 *
 * @param photo Photo and original image used for matching.
 * @param candidates RAW candidates discovered by the search.
 * @returns The automatic match state and its candidate metadata.
 */
export function classify(photo: PhotoWithOriginal, candidates: AttachmentCandidate[]): AttachmentMatch {
  const basename = filenameKey(path.parse(photo.chosenOriginal.filename).name);
  const matching = candidates.filter((file) => filenameKey(path.parse(file.filename).name) === basename);
  if (matching.length === 0) return { state: "missing", candidates: [], chosen: null, decision: null, matchedBy: null };
  if (matching.length > 1) return { state: "ambiguous", candidates: matching, chosen: null, decision: null, matchedBy: null };
  const only = matching[0]!;
  return Math.abs(only.snapshot.mtimeMs - photo.chosenOriginal.snapshot.mtimeMs) <= 5000 ? { state: "accepted", candidates: matching, chosen: only, decision: null, matchedBy: "exact-basename-mtime" } : { state: "suspicious", candidates: matching, chosen: null, decision: null, matchedBy: null, reason: "Modified times differ by more than 5 seconds" };
}
