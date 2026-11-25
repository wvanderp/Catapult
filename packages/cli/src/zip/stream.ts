import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FileCandidate } from "../types.js";
import { PackageWriteError } from "../types.js";
import type { PreparedFile } from "./prepare.js";

/**
 * Hash a file through a cancellable read stream.
 *
 * @param path File path to hash.
 * @param signal Optional cancellation signal.
 * @returns Byte size and lowercase SHA-256 digest.
 */
export async function hashFile(path: string, signal?: AbortSignal): Promise<{ size: number; sha256: string }> {
  const hash = createHash("sha256");
  let size = 0;
  const stream = createReadStream(path, { signal });
  try {
    for await (const chunk of stream) {
      const bytes = chunk as Buffer;
      hash.update(bytes);
      size += bytes.length;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PackageWriteError("source-changed", `Unable to read source while hashing: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { size, sha256: hash.digest("hex") };
}

/**
 * Throw a typed cancellation error when a write has been aborted.
 *
 * @param signal Cancellation signal.
 */
export function checkAbort(signal: AbortSignal): void {
  if (signal.aborted)
    throw new PackageWriteError("cancelled", "Package writing was cancelled");
}

/**
 * Verify a file still matches the snapshot prepared for the archive.
 *
 * @param path File path to verify.
 * @param file Prepared size and snapshot details.
 * @param signal Cancellation signal.
 */
export async function verifySnapshot(path: string, file: PreparedFile, signal: AbortSignal): Promise<void> {
  checkAbort(signal);
  let current;
  try { current = await stat(path); }
  catch (error) { throw new PackageWriteError("source-changed", `Unable to stat source during ZIP writing: ${error instanceof Error ? error.message : String(error)}`); }
  if (current.size !== file.size || (file.candidate && current.mtimeMs !== file.candidate.snapshot.mtimeMs))
    throw new PackageWriteError("source-changed", `Source changed during ZIP writing: ${path}`);
}

/**
 * Verify each selected source after all ZIP entries have been streamed.
 *
 * @param candidates Selected source candidates.
 * @param files Prepared hashes indexed by source path.
 * @param signal Cancellation signal.
 */
export async function verifyAllSnapshots(candidates: FileCandidate[], files: Map<string, PreparedFile>, signal: AbortSignal): Promise<void> {
  for (const candidate of candidates)
    await verifySnapshot(candidate.path, files.get(candidate.path)!, signal);
}
