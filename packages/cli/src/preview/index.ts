import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import type {
  PhotoGroup,
  PreviewArtifact,
  PreviewFailure,
  PreviewGenerator,
  PreviewResult,
  PreviewSession,
} from "../types.js";
import { PreviewCancellationError } from "../types.js";

const PIXEL_LIMIT = 268_402_689;
type PreviewKind = PreviewArtifact["kind"];

/**
 * Throw a typed cancellation error when a preview signal is aborted.
 *
 * @param activeSignal Signal for the active preview operation.
 */
function throwIfAborted(activeSignal: AbortSignal): void {
  if (activeSignal.aborted) throw new PreviewCancellationError();
}

/** Create an orientation-corrected, metadata-free preview session. */
/** @returns A generator that owns temporary preview sessions. */
export function createPreviewGenerator(): PreviewGenerator {
  let workingDirectory = "";
  return {
    get workingDirectory() {
      return workingDirectory;
    },
    async generateSession(photos, options, signal, onPhoto): Promise<PreviewSession> {
      const sessionDirectory = await mkdtemp(path.join(tmpdir(), "catapult-preview-"));
      workingDirectory = sessionDirectory;
      const results = new Map<string, PreviewResult>();
      const originalConcurrency = sharp.concurrency();
      const boundedConcurrency = Math.max(1, Math.min(options.concurrency, 4));
      const resultsInFlight = new Set<Promise<PreviewResult>>();
      let disposed = false;
      let disposal: Promise<void> | undefined;

      const one = async (photo: PhotoGroup, activeSignal: AbortSignal): Promise<PreviewResult> => {
        let stage: PreviewFailure["stage"] = "decode";
        try {
          throwIfAborted(activeSignal);
          const source = photo.chosenOriginal.path;
          const metadata = await sharp(source, {
            page: 0,
            limitInputPixels: PIXEL_LIMIT,
            failOn: "truncated",
          }).metadata();
          throwIfAborted(activeSignal);
          if (!metadata.width || !metadata.height)
            throw new Error("Image has no readable dimensions");

          const pageCount = Math.max(1, metadata.pages ?? 1);
          const warnings = pageCount > 1
            ? [`Multipage TIFF: using page 0 of ${pageCount}`]
            : [];
          const artifacts: PreviewArtifact[] = [];
          for (const [kind, edge] of [
            ["thumbnail", options.thumbnailMaxEdge],
            ["working", options.workingMaxEdge],
          ] as const) {
            stage = kind;
            throwIfAborted(activeSignal);
            const artifact = await renderArtifact(
              source,
              photo.id,
              kind,
              edge,
              sessionDirectory,
            );
            throwIfAborted(activeSignal);
            artifacts.push(artifact);
          }

          return {
            ok: true,
            photoId: photo.id,
            artifacts: artifacts as [PreviewArtifact, PreviewArtifact],
            pageCount,
            multiPage: pageCount > 1,
            warnings,
            steps: [{
              tool: "sharp",
              version: sharp.versions.sharp ?? "unknown",
              step: "decode-orient-convert-resize-jpeg",
              settings: {
                thumbnailMaxEdge: options.thumbnailMaxEdge,
                workingMaxEdge: options.workingMaxEdge,
                colourspace: "srgb",
                page: 0,
              },
              result: { pageCount },
              warnings,
            }],
          };
        } catch (error) {
          if (activeSignal.aborted || error instanceof PreviewCancellationError)
            throw new PreviewCancellationError();
          return {
            ok: false,
            photoId: photo.id,
            failure: {
              photoId: photo.id,
              sourcePath: photo.chosenOriginal.path,
              stage,
              message: error instanceof Error ? error.message : String(error),
              retryable: true,
            },
            warnings: [],
          };
        }
      };

      const workerStop = new AbortController();
      let nextPhoto = 0;
      const worker = async (): Promise<void> => {
        while (true) {
          throwIfAborted(signal);
          throwIfAborted(workerStop.signal);
          const index = nextPhoto++;
          if (index >= photos.length) return;
          const photo = photos[index]!;
          const result = await one(photo, AbortSignal.any([signal, workerStop.signal]));
          results.set(result.photoId, result);
          onPhoto(result);
        }
      };

      sharp.concurrency(Math.max(1, Math.min(2, boundedConcurrency)));
      const workerResults = await Promise.allSettled(
        Array.from({ length: Math.min(boundedConcurrency, photos.length) }, worker),
      );
      sharp.concurrency(originalConcurrency);
      const failedWorker = workerResults.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failedWorker) {
        workerStop.abort();
        await Promise.allSettled(resultsInFlight);
        await rm(sessionDirectory, { recursive: true, force: true });
        if (signal.aborted || failedWorker.reason instanceof PreviewCancellationError)
          throw new PreviewCancellationError();
        throw failedWorker.reason;
      }

      return {
        get results() {
          const snapshot: PreviewResult[] = [];
          results.forEach((result) => {
            snapshot.push(result);
          });
          return snapshot;
        },
        async retry(photoId, retrySignal) {
          if (disposed) throw new Error("Preview session is disposed");
          const photo = photos.find((item) => item.id === photoId);
          if (!photo) throw new Error(`Unknown photo: ${photoId}`);
          throwIfAborted(retrySignal);
          const retryPromise = one(photo, retrySignal);
          resultsInFlight.add(retryPromise);
          try {
            const result = await retryPromise;
            if (!disposed) results.set(photoId, result);
            return result;
          } finally {
            resultsInFlight.delete(retryPromise);
          }
        },
        async dispose() {
          if (disposal) return disposal;
          disposed = true;
          disposal = (async () => {
            await Promise.allSettled(resultsInFlight);
            await rm(sessionDirectory, { recursive: true, force: true });
          })();
          return disposal;
        },
      };
    },
  };
}

/**
 * Render and hash one preview image.
 *
 * @param source Original image path.
 * @param photoId Stable identifier used in the preview filename.
 * @param kind Preview size category.
 * @param edge Maximum preview edge length.
 * @param sessionDirectory Directory owned by the preview session.
 * @returns The generated preview artifact metadata.
 */
async function renderArtifact(
  source: string,
  photoId: string,
  kind: PreviewKind,
  edge: number,
  sessionDirectory: string,
): Promise<PreviewArtifact> {
  const output = path.join(sessionDirectory, `${photoId}-${kind}.jpg`);
  const result = await sharp(source, {
    page: 0,
    limitInputPixels: PIXEL_LIMIT,
    failOn: "truncated",
  })
    .rotate()
    .toColourspace("srgb")
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "white" })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(output);
  const [bytes, fileStats] = await Promise.all([readFile(output), stat(output)]);
  return {
    kind,
    path: output,
    width: result.width,
    height: result.height,
    size: fileStats.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    format: "jpeg",
  };
}
