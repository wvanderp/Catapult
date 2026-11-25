import { promises as fs } from "node:fs";
import path from "node:path";
import type { AttachmentCandidate, ResolvedPhotoMatches } from "../types.js";
import { directoryKey, filenameKey } from "./match.js";
import { inspect, throwIfAborted } from "./shared.js";

const SIDECAR_EXTENSIONS = new Set([".xmp", ".pp3", ".dop"]);
/**
 * Check whether a filesystem error indicates a missing entry.
 *
 * @param error Error thrown by a filesystem operation.
 * @returns Whether the error code is ENOENT.
 */
function isMissing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "ENOENT"; }

/**
 * Collect sidecars located beside the original and matched RAW files.
 *
 * @param photo Photo and its resolved original and RAW matches.
 * @param signal Signal controlling directory reads and file inspection.
 * @returns Matching sidecar candidates, deduplicated by path.
 */
export async function collectSidecars(photo: ResolvedPhotoMatches, signal: AbortSignal): Promise<AttachmentCandidate[]> {
  throwIfAborted(signal);
  if (!photo.chosenOriginal.path) return [];
  const found = new Map<string, AttachmentCandidate>();
  for (const parent of [photo.chosenOriginal, ...photo.rawMatches]) {
    const directory = path.dirname(parent.path);
    let names: string[];
    try { names = await fs.readdir(directory); }
    catch (error) {
      if (signal.aborted) throwIfAborted(signal);
      if (isMissing(error)) continue;
      throw new Error(`Could not read sidecar directory ${directory}: ${String(error)}`, { cause: error });
    }
    const stem = path.parse(parent.filename).name;
    const wanted = new Set([stem, parent.filename].flatMap((base) => [".xmp", ".pp3", ".dop"].map((extension) => filenameKey(`${base}${extension}`))));
    for (const entry of names) {
      if (!wanted.has(filenameKey(entry)) || !SIDECAR_EXTENSIONS.has(path.extname(entry).toLowerCase())) continue;
      const full = path.join(directory, entry);
      try {
        const candidate = { ...(await inspect(full, signal)), role: "sidecar" as const };
        found.set(directoryKey(full), candidate);
      } catch (error) {
        if (signal.aborted) throwIfAborted(signal);
        if (!isMissing(error)) throw new Error(`Could not inspect sidecar ${full}: ${String(error)}`, { cause: error });
      }
    }
  }
  // eslint-disable-next-line unicorn/prefer-spread -- Iterator#toArray is unavailable in the configured TS libs.
  return Array.from(found.values()).toSorted((a, b) => a.path.localeCompare(b.path));
}
