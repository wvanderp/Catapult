import { createReadStream, createWriteStream, fstatSync } from "node:fs";
import { link, lstat, open, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

/** File operations used to publish an archive, injectable for filesystem behavior tests. */
export interface PublishFileOperations {
  link: typeof link;
  open: typeof open;
  unlink: typeof unlink;
  lstat: typeof lstat;
  createWriteStream: typeof createWriteStream;
}

/** Node filesystem implementation used by production publishing. */
const fileOperations: PublishFileOperations = { link, open, unlink, lstat, createWriteStream };

/**
 * Publish a completed archive without replacing an existing output.
 *
 * @param temporary Completed temporary archive.
 * @param output Requested output path.
 * @param operations Filesystem operations used for publication.
 */
export async function publishNoReplace(temporary: string, output: string, operations: PublishFileOperations = fileOperations): Promise<void> {
  try { await operations.link(temporary, output); await operations.unlink(temporary); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") throw error;
    // On filesystems without hard links (notably exFAT), exclusive stream copy keeps the no-overwrite guarantee.
    if (["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(code ?? "")) {
      let createdOutput = false;
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      let createdIdentity: { dev: number; ino: number } | undefined;
      let streamIdentity: ReturnType<typeof fstatSync> | undefined;
      let identityPending: Promise<void> | undefined;
      let cleanupWarning: string | undefined;
      try {
        const outputStream = operations.createWriteStream(output, { flags: "wx" });
        outputStream.once("open", () => {
          createdOutput = true;
          const streamFd = (outputStream as unknown as { fd: number | null }).fd;
          if (streamFd !== null) streamIdentity = fstatSync(streamFd);
          identityPending = operations.open(output, "r+").then(async (opened) => {
            handle = opened;
            const identity = await opened.stat();
            if (!streamIdentity || identity.dev !== streamIdentity.dev || identity.ino !== streamIdentity.ino)
              throw new Error(`Output file identity changed during publication: ${output}`);
            if (identity.ino !== 0) createdIdentity = { dev: identity.dev, ino: identity.ino };
          });
          void identityPending.catch(() => {});
        });
        await pipeline(createReadStream(temporary), outputStream);
        await identityPending;
        if (!handle) handle = await operations.open(output, "r+");
        await handle.sync();
        await handle.close();
        handle = undefined;
        await operations.unlink(temporary);
      } catch (copyError) {
        await identityPending?.catch(() => {});
        if (handle) {
          try { const identity = await handle.stat(); if (identity.ino !== 0) createdIdentity = { dev: identity.dev, ino: identity.ino }; }
          catch { /* Preserve the original publication error. */ }
          await handle.close().catch(() => {});
        }
        if (createdOutput && createdIdentity) {
          try {
            const current = await operations.lstat(output);
            if (current.dev === createdIdentity.dev && current.ino === createdIdentity.ino) await operations.unlink(output);
          } catch { /* The output disappeared or changed while publishing. */ }
        } else if (createdOutput) cleanupWarning = ` Partial output may remain at ${output} (file identity unavailable).`;
        if (cleanupWarning && copyError instanceof Error) copyError.message += cleanupWarning;
        throw copyError;
      }
      return;
    }
    throw error;
  }
}
/**
 *
 * @param path Directory to sync.
 */
export async function syncDirectory(path: string): Promise<void> { try { const handle = await open(path, "r"); await handle.sync(); await handle.close(); } catch { /* directory fsync is unavailable on some Windows filesystems */ } }
