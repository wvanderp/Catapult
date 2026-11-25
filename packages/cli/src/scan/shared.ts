import path from "node:path";
import type { Dirent } from "node:fs";
import type { FileCandidate, FileSnapshot, ProgressEvent } from "../types.js";
import { promises as fs } from "node:fs";

export type DirectoryReader = (directory: string) => Promise<Dirent[]>;

/**
 * Throw the abort reason when an operation has been cancelled.
 *
 * @param signal Signal controlling the current operation.
 */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Operation cancelled");
}

/**
 * Limit progress notifications while always allowing a final notification.
 *
 * @param callback Optional consumer for progress events.
 * @returns A throttled progress callback.
 */
export function throttledProgress(callback?: (event: ProgressEvent) => void) {
  let last = 0;
  return (event: ProgressEvent, final = false): void => {
    const now = Date.now();
    if (callback && (final || now - last >= 50)) {
      callback(event);
      last = now;
    }
  };
}

/**
 * Inspect a regular file and capture its filesystem metadata.
 *
 * @param pathname Absolute or relative path to inspect.
 * @param signal Signal controlling the inspection.
 * @returns Candidate data including a stable file snapshot.
 */
export async function inspect(pathname: string, signal: AbortSignal): Promise<FileCandidate> {
  throwIfAborted(signal);
  const stat = await fs.lstat(pathname);
  if (!stat.isFile()) throw new Error(`Not a regular file: ${pathname}`);
  const filename = path.basename(pathname);
  const snapshot: FileSnapshot = { size: stat.size, mtimeMs: stat.mtimeMs, dev: stat.dev, ino: stat.ino };
  return {
    path: pathname, filename, extension: path.extname(filename), snapshot,
    createdAt: Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0 ? stat.birthtime : null,
    modifiedAt: stat.mtime, discoveredAt: new Date(),
  };
}
