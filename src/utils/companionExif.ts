import exifr from "exifr";
import { useImageSetStore } from "../store/imageSetStore";
import { getOriginalBlob, getSnapshot, subscribe } from "./companion";

type ExifData = Record<string, unknown>;

const pending = new Set<string>();
const running = new Map<string, Promise<void>>();
let unsubscribe: (() => void) | undefined;
const exifUpdates = new Map<string, { exifData?: ExifData; exifStatus: "complete" | "failed" }>();
let exifFlushTimer: ReturnType<typeof setTimeout> | undefined;
let exifFlush: Promise<void> = Promise.resolve();

/**
 * Persist accumulated EXIF updates in one image-store write.
 *
 * @returns The active or newly scheduled store update.
 */
function flushExifUpdates(): Promise<void> {
  if (exifFlushTimer) clearTimeout(exifFlushTimer);
  exifFlushTimer = undefined;
  if (exifUpdates.size === 0) return exifFlush;
  const updates = Object.fromEntries(exifUpdates);
  exifUpdates.clear();
  exifFlush = exifFlush.then(() => {
    useImageSetStore.getState().setImagesExifData(updates);
    for (const id of Object.keys(updates)) pending.delete(id);
  });
  return exifFlush;
}

/**
 * Queue a parsed EXIF result and persist promptly in a batch.
 *
 * @param id Image identifier.
 * @param update Parsed EXIF data and completion status.
 * @param update.exifData Parsed EXIF object, when parsing succeeded.
 * @param update.exifStatus Final parse status.
 */
function queueExifUpdate(id: string, update: { exifData?: ExifData; exifStatus: "complete" | "failed" }): void {
  exifUpdates.set(id, update);
  if (exifUpdates.size >= 16) { void flushExifUpdates(); return; }
  if (!exifFlushTimer) exifFlushTimer = setTimeout(() => { void flushExifUpdates(); }, 250);
}

/**
 * Extract companion EXIF data, resuming when its package becomes available.
 *
 * @param imageIds Companion image IDs to process.
 */
export async function extractCompanionExif(imageIds: string[]): Promise<void> {
  for (const id of imageIds) pending.add(id);
  if (!unsubscribe) unsubscribe = subscribe(pump);
  pump();

  const requested = new Set(imageIds);
  while (true) {
    pump();
    const state = useImageSetStore.getState().imageSet.images;
    const requestedRunning = [...requested].flatMap((id) => {
      const job = running.get(id);
      return job ? [job] : [];
    });
    if (requestedRunning.length > 0) {
      await Promise.race(requestedRunning);
      continue;
    }
    const requestedReady = [...requested].some((id) => {
      const image = state[id];
      return pending.has(id) && image?.companion && getSnapshot().states[image.companion.packageId] === "available";
    });
    if (requestedReady && running.size > 0) {
      await Promise.race(running.values());
      continue;
    }
    if ([...requested].some((id) => exifUpdates.has(id))) await flushExifUpdates();
    if ([...requested].every((id) => {
      const image = useImageSetStore.getState().imageSet.images[id];
      return !image || image.exifStatus === "complete" || image.exifStatus === "failed";
    })) performance.mark("catapult:exif:done");
    return;
  }
}

/**
 * Remove IDs that no longer need processing.
 *
 * @param id Image ID to check.
 * @returns Whether the image is done.
 */
function isDone(id: string): boolean {
  const image = useImageSetStore.getState().imageSet.images[id];
  const done = !image || !image.companion || Boolean(image.exifData) || image.exifStatus === "failed" || image.exifStatus === "complete";
  if (done) pending.delete(id);
  return done;
}

/**
 * Start available jobs while fewer than two jobs are running.
 */
function pump(): void {
  for (const id of pending) isDone(id);
  const images = useImageSetStore.getState().imageSet.images;
  for (const id of pending) {
    if (running.size >= 2) break;
    const image = images[id];
    if (!image?.companion || running.has(id) || exifUpdates.has(id) || getSnapshot().states[image.companion.packageId] !== "available") continue;
    const job = runJob(id);
    running.set(id, job);
    void job.finally(() => {
      running.delete(id);
      pump();
    });
  }
}

/**
 * Read and parse EXIF for one companion image.
 *
 * @param id Image ID to process.
 */
async function runJob(id: string): Promise<void> {
  try {
    const image = useImageSetStore.getState().imageSet.images[id];
    if (!image?.companion) return;
    const blob = await getOriginalBlob(image.companion.packageId, image.companion.photoId);
    const result = await parseCompanionExif(blob);
    if (useImageSetStore.getState().imageSet.images[id]) {
      queueExifUpdate(id, { exifData: result && typeof result === "object" ? result as ExifData : {}, exifStatus: "complete" });
    }
  } catch {
    const image = useImageSetStore.getState().imageSet.images[id];
    if (image && getSnapshot().states[image.companion?.packageId ?? ""] === "available") {
      queueExifUpdate(id, { exifStatus: "failed" });
    }
  }
}

/**
 * Parse a companion original with bounded reads.
 *
 * @param blob Original image bytes.
 * @returns Parsed metadata.
 */
export function parseCompanionExif(blob: Blob): Promise<unknown> {
  return exifr.parse(blob, {
    tiff: true, exif: true, gps: true, icc: true, iptc: true, xmp: true,
    translateValues: true, translateKeys: true, reviveValues: true,
    firstChunkSize: 64 * 1024, chunkSize: 256 * 1024, chunkLimit: 64,
  });
}
