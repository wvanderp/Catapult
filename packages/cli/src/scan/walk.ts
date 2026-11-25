import { promises as fs } from "node:fs";
import path from "node:path";
import type { AttachmentCandidate, FileCandidate, ProgressEvent } from "../types.js";
import { directoryKey } from "./match.js";
import { inspect, throwIfAborted, type DirectoryReader } from "./shared.js";

const RAW_EXTENSIONS = new Set("nef cr2 cr3 crw arw srf sr2 raf orf rw2 dng pef srw x3f 3fr fff iiq kdc dcr mrw nrw erf mef mos rwl raw gpr".split(" ").map((extension) => `.${extension}`));
export const isRawExtension = (extension: string): boolean => RAW_EXTENSIONS.has(extension.toLowerCase());

/**
 * Walk real directories and collect regular RAW files without following links.
 *
 * @param root Directory at which to begin the walk.
 * @param visited Directory keys already visited by this search session.
 * @param signal Signal controlling traversal and inspection.
 * @param warnings Receives recoverable directory and file errors.
 * @param progress Reports traversal progress.
 * @param readDirectory Reads entries from a real directory.
 * @returns Discovered RAW file candidates in deterministic order.
 */
export async function walk(root: string, visited: Set<string>, signal: AbortSignal, warnings: string[], progress: (event: ProgressEvent, final?: boolean) => void, readDirectory: DirectoryReader): Promise<FileCandidate[]> {
  const found: FileCandidate[] = [];
  const stack = [root];
  let files = 0;
  while (stack.length > 0) {
    throwIfAborted(signal);
    const directory = stack.pop()!;
    let real: string;
    try { real = await fs.realpath(directory); }
    catch (error) {
      if (signal.aborted) throwIfAborted(signal);
      warnings.push(`Could not access directory ${directory}: ${String(error)}`);
      continue;
    }
    // A symlink/junction is never a walk root, even when its target is real.
    if (path.resolve(directory) !== path.resolve(real)) continue;
    const key = directoryKey(real);
    if (visited.has(key)) continue;
    visited.add(key);
    let entries;
    try { entries = await readDirectory(real); }
    catch (error) {
      if (signal.aborted) throwIfAborted(signal);
      warnings.push(`Could not read directory ${real}: ${String(error)}`);
      continue;
    }
    entries = entries.toSorted((a, b) => b.name.localeCompare(a.name, "en", { sensitivity: "base" }) || b.name.localeCompare(a.name));
    for (const entry of entries) {
      throwIfAborted(signal);
      const full = path.join(real, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && isRawExtension(path.extname(entry.name))) {
        try { found.push(await inspect(full, signal)); }
        catch (error) {
          if (signal.aborted) throwIfAborted(signal);
          warnings.push(`Could not inspect ${full}: ${String(error)}`);
        }
      }
      files++;
      progress({ stage: "match", completed: files, total: files, message: `Searched ${files} entries` });
    }
  }
  return found.toSorted((a, b) => a.path.localeCompare(b.path, "en", { sensitivity: "base" }) || a.path.localeCompare(b.path));
}

export const asRawCandidates = (files: FileCandidate[]): AttachmentCandidate[] => files.map((file) => ({ ...file, role: "raw" }));
