import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { mkdir, open, rm, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { Readable, Writable } from "node:stream";
import { ZipWriter } from "@zip.js/zip.js";
import { ATTACHMENT_DIRECTORY, MANIFEST_PATH, ORIGINAL_DIRECTORY, PHOTO_DIRECTORY, PHOTO_METADATA_FILENAME, PREVIEWS_DIRECTORY, THUMBNAIL_FILENAME, WORKING_PREVIEW_FILENAME, crossValidate, parseManifest, parsePhotoMetadata, sanitiseEntryFilename } from "@catapult/package-format";
import { Uint8ArrayReader } from "@zip.js/zip.js";
import type { PackageEstimate, PackageSummary, ProgressEvent, ZipWriter as ZipWriterContract } from "../types.js";
import type { PackageManifest, PhotoMetadata } from "@catapult/package-format";
import { PackageWriteError } from "../types.js";
import { dedupeAttachments, estimatePlan, prepareFiles, type PreparedFile } from "./prepare.js";
import { checkAbort, verifyAllSnapshots, verifySnapshot } from "./stream.js";
import { publishNoReplace, syncDirectory } from "./publish.js";

/**
 * Serialize package JSON with the format's stable indentation and newline.
 *
 * @param value JSON-compatible package value.
 * @returns UTF-8 JSON bytes with a trailing newline.
 */
function json(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Wait briefly for a destroyed stream to emit close.
 *
 * @param stream Stream whose close event is awaited.
 */
async function waitForClose(stream: Readable | Writable): Promise<void> {
  if (stream.closed) return;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve) => stream.once("close", resolve)),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 2000); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Create a streaming, STORE-only ZIP writer for Catapult packages.
 *
 * @param dependencies Optional filesystem overrides for writing the archive stream.
 * @param dependencies.createWriteStream Optional output stream factory.
 * @param dependencies.createReadStream Optional input stream factory.
 * @param dependencies.open Optional temporary file opener.
 * @returns The package writer contract implementation.
 */
export function createZipWriter(dependencies: { createWriteStream?: typeof createWriteStream; createReadStream?: typeof createReadStream; open?: typeof open } = {}): ZipWriterContract {
  return {
    estimate(plan): PackageEstimate {
      return estimatePlan(plan);
    },
    async write(plan, signal, onProgress): Promise<PackageSummary> {
      const output = plan.outputPath;
      const temporary = path.join(
        path.dirname(output),
        `.${path.basename(output)}.${randomUUID()}.tmp`,
      );
      const emit = (event: ProgressEvent): void => {
        onProgress?.(event);
      };
      let outputStream: WriteStream | undefined;
      let outputHandle: FileHandle | undefined;
      const sourceStreams = new Set<Readable>();
      try {
        checkAbort(signal);
        await mkdir(path.dirname(output), { recursive: true });
        // First pass obtains authoritative hashes before manifest and metadata construction.
        const files = await prepareFiles(plan, signal, emit);
        const attachments = dedupeAttachments(plan, files);
        const metadataByPhotoId: Record<string, PhotoMetadata> = {};
        const manifestPhotos: PackageManifest["photos"] = [];
        const manifestAttachments: PackageManifest["attachments"] = [];
        const entryFiles: PreparedFile[] = [];
        for (const photoPlan of plan.photos) {
          const photo = photoPlan.photo;
          const id = photo.id;
          const base = `${PHOTO_DIRECTORY}/${id}`;
          const origFile = files.get(photoPlan.chosenOriginal.path)!;
          const safeOriginal = sanitiseEntryFilename(photoPlan.chosenOriginal.filename);
          const originalEntry = `${base}/${ORIGINAL_DIRECTORY}/${safeOriginal}`;
          const thumb = photoPlan.preview.artifacts.find(
            (artifact) => artifact.kind === "thumbnail",
          )!;
          const working = photoPlan.preview.artifacts.find(
            (artifact) => artifact.kind === "working",
          )!;
          const thumbEntry = `${base}/${PREVIEWS_DIRECTORY}/${THUMBNAIL_FILENAME}`;
          const workEntry = `${base}/${PREVIEWS_DIRECTORY}/${WORKING_PREVIEW_FILENAME}`;
          const attachmentMeta: PhotoMetadata["attachments"] = [];
          const attachmentIds: string[] = [];
          for (const candidate of [...photoPlan.raw, ...photoPlan.sidecars]) {
            const prepared = files.get(candidate.path)!;
            const group = attachments.get(`${candidate.role}:${prepared.sha256}`)!;
            if (attachmentMeta.some((item) => item.id === group.id)) continue;
            attachmentIds.push(group.id);
            const source = group.candidates[0]!;
            const canonical = files.get(source.path)!;
            const filename = sanitiseEntryFilename(source.filename);
            const entryPath = `${ATTACHMENT_DIRECTORY}/${group.id}/${filename}`;
            attachmentMeta.push({
              id: group.id,
              role: candidate.role,
              entryPath,
              filename,
              sourceFilename: source.filename,
              sha256: canonical.sha256,
              sources: group.candidates.map((item) => ({
                path: item.path,
                discoveredAt: item.discoveredAt.toISOString(),
                modifiedAt: item.modifiedAt.toISOString(),
                ...(item.createdAt && { createdAt: item.createdAt.toISOString() }),
              })),
              size: canonical.size,
            });
            if (manifestAttachments.every((item) => item.id !== group.id))
              manifestAttachments.push({
                id: group.id,
                entryPath,
                filename,
                sourceFilename: source.filename,
                sha256: canonical.sha256,
                size: canonical.size,
                role: candidate.role,
                photoIds: group.photoIds,
              });
            if (entryFiles.every((item) => item.entry !== entryPath)) entryFiles.push({ ...canonical, entry: entryPath });
          }
          const rawAttachmentIds = attachmentMeta
            .filter((attachment) => attachment.role === "raw")
            .map((attachment) => attachment.id);
          const rawMatchMethod = photo.rawMatch.matchedBy;
          if (photoPlan.raw.length > 0 && rawMatchMethod !== "user" && rawMatchMethod !== "exact-basename-mtime")
            throw new PackageWriteError("disk-failure", `RAW match method is missing for photo ${id}`);
          const raw: PhotoMetadata["raw"] = photoPlan.raw.length > 0
            ? { state: "collected", attachmentIds: rawAttachmentIds, matchedBy: rawMatchMethod === "user" ? "user" : "exact-basename-mtime" }
            : (photo.rawMatch.state === "disabled"
              ? { state: "collection-disabled", attachmentIds: [], matchedBy: "disabled" }
              : { state: "accepted-missing", attachmentIds: [], matchedBy: "missing" });
          const isTiff = [".tif", ".tiff"].includes(
            photoPlan.chosenOriginal.extension.toLowerCase(),
          );
          const fmt = isTiff ? "tiff" : "jpeg";
          const metadataWarnings = [
            ...photoPlan.preview.warnings,
            ...(raw.state === "accepted-missing" ? ["No RAW attachment was accepted for this photo"] : []),
            ...(origFile.size >= 100 * 1024 * 1024
              ? [`Large original at least 100 MB: ${photoPlan.chosenOriginal.path}`]
              : []),
          ];
          const processing = [...photoPlan.preview.steps, {
            tool: "@zip.js/zip.js",
            version: plan.versions.zipVersion,
            step: "package-store-zip",
            settings: { compression: "STORE", zip64: true },
            result: { entryCount: 4 + attachmentMeta.length },
            warnings: metadataWarnings,
          }];
          const metadata = {
            schemaVersion: 1,
            id,
            source: {
              originalPath: photoPlan.chosenOriginal.path,
              discoveredAt: photoPlan.chosenOriginal.discoveredAt.toISOString(),
              modifiedAt: photoPlan.chosenOriginal.modifiedAt.toISOString(),
              ...(photoPlan.chosenOriginal.createdAt && {
                createdAt: photoPlan.chosenOriginal.createdAt.toISOString(),
              }),
              size: origFile.size,
            },
            original: {
              entryPath: originalEntry,
              filename: safeOriginal,
              sourceFilename: photoPlan.chosenOriginal.filename,
              format: fmt,
              mimeType: fmt === "tiff" ? "image/tiff" : "image/jpeg",
              sha256: origFile.sha256,
              size: origFile.size,
            },
            previews: {
              thumbnail: {
                entryPath: thumbEntry,
                sha256: thumb.sha256,
                size: thumb.size,
                width: thumb.width,
                height: thumb.height,
              },
              working: {
                entryPath: workEntry,
                sha256: working.sha256,
                size: working.size,
                width: working.width,
                height: working.height,
              },
            },
            attachments: attachmentMeta,
            raw,
            ...(isTiff && {
              tiff: { pageCount: photoPlan.preview.pageCount, selectedPage: 0 },
            }),
            processing,
            extensions: {},
          };
          const parsedMetadata = parsePhotoMetadata(metadata);
          metadataByPhotoId[id] = parsedMetadata;
          manifestPhotos.push({
            id,
            metadataPath: `${base}/${PHOTO_METADATA_FILENAME}`,
            originalPath: originalEntry,
            originalFilename: safeOriginal,
            sourceFilename: photoPlan.chosenOriginal.filename,
            mimeType: parsedMetadata.original.mimeType,
            format: fmt,
            size: origFile.size,
            sha256: origFile.sha256,
            previewPaths: { thumbnail: thumbEntry, working: workEntry },
            previewHashes: { thumbnail: thumb.sha256, working: working.sha256 },
            previewSizes: { thumbnail: thumb.size, working: working.size },
            attachmentIds,
          });
          entryFiles.push(
            { ...origFile, entry: originalEntry },
            { path: thumb.path, entry: thumbEntry, size: thumb.size, sha256: thumb.sha256 },
            { path: working.path, entry: workEntry, size: working.size, sha256: working.sha256 },
          );
        }
        const photoEntries = plan.photos.flatMap((photoPlan) => {
          const photoBase = `${PHOTO_DIRECTORY}/${photoPlan.photo.id}`;
          return [
            `${photoBase}/metadata.json`,
            `${photoBase}/original/${sanitiseEntryFilename(photoPlan.chosenOriginal.filename)}`,
            `${photoBase}/previews/thumbnail.jpg`,
            `${photoBase}/previews/working.jpg`,
          ];
        });
        const manifest = parseManifest({
          format: "catapult-photo-package",
          version: 1,
          createdAt: new Date().toISOString(),
          generator: {
            name: plan.versions.generatorName,
            version: plan.versions.generatorVersion,
          },
          entries: [
            ...photoEntries,
            ...manifestAttachments.map((attachment) => attachment.entryPath),
          ],
          photos: manifestPhotos,
          attachments: manifestAttachments,
          extensions: {},
        });
        for (const metadata of Object.values(metadataByPhotoId)) crossValidate(manifest, metadata);
        for (const photo of plan.photos) {
          entryFiles.push({
            path: "",
            entry: `${PHOTO_DIRECTORY}/${photo.photo.id}/${PHOTO_METADATA_FILENAME}`,
            size: 0,
            sha256: "",
          });
        }
        const metadataBytes = new Map(
          plan.photos.map((photo) => [
            photo.photo.id,
            json(metadataByPhotoId[photo.photo.id]!),
          ]),
        );
        const manifestBytes = json(manifest);
        let total = manifestBytes.length;
        for (const file of entryFiles) {
          if (file.path) {
            total += file.size;
          } else {
            const photoId = file.entry.split("/", 2)[1]!;
            total += metadataBytes.get(photoId)!.length;
          }
        }
        // Open the file before constructing the stream. This removes the stream's
        // asynchronous open race: after abort, no pending open can recreate the temp.
        if (dependencies.createWriteStream) {
          // Keep the existing stream factory contract intact for injected streams.
          outputStream = dependencies.createWriteStream(temporary, { flags: "wx" });
        } else {
          outputHandle = await (dependencies.open ?? open)(temporary, "wx");
          outputStream = createWriteStream(temporary, {
            flags: "wx",
            fd: outputHandle.fd,
            autoClose: false,
          });
        }
        const zip = new ZipWriter(Writable.toWeb(outputStream), { zip64: true, useWebWorkers: false });
        let written = 0;
        for (const file of entryFiles) {
          checkAbort(signal);
          if (file.path) {
            await verifySnapshot(file.path, file, signal);
            const hash = createHash("sha256");
            let streamed = 0;
            let nextProgress = 4 * 1024 * 1024;
            const verifier = new Transform({
              transform(chunk: Buffer, _encoding, callback) {
                hash.update(chunk);
                streamed += chunk.length;
                if (streamed >= nextProgress) {
                  nextProgress = streamed + 4 * 1024 * 1024;
                  emit({
                    stage: "zip",
                    completed: written + streamed,
                    total,
                    message: `Writing ${file.entry}`,
                  });
                }
                callback(null, chunk);
              },
            });
            // Attach abort handling after constructing the stream so an already aborted
            // signal cannot emit before the readable has an error consumer.
            checkAbort(signal);
            const input = (dependencies.createReadStream ?? createReadStream)(file.path).compose(verifier);
            sourceStreams.add(input);
            input.once("close", () => sourceStreams.delete(input));
            let sourceReadError: unknown;
            input.on("error", (error) => { sourceReadError = error; });
            const abortInput = (): void => { input.destroy(new DOMException("The operation was aborted", "AbortError")); };
            signal.addEventListener("abort", abortInput, { once: true });
            try {
              await zip.add(
                file.entry,
                Readable.toWeb(input) as ReadableStream<Uint8Array>,
                { level: 0, zip64: true },
              );
            } catch (error) {
              if (signal.aborted) throw error;
              if (sourceReadError)
                throw new PackageWriteError("source-changed", `Unable to read source while writing: ${sourceReadError instanceof Error ? sourceReadError.message : String(sourceReadError)}`);
              throw error;
            } finally {
              signal.removeEventListener("abort", abortInput);
            }
            if (streamed !== file.size || hash.digest("hex") !== file.sha256)
              throw new PackageWriteError(
                "source-changed",
                `Source changed while writing: ${file.path}`,
              );
            await verifySnapshot(file.path, file, signal);
            written += streamed;
          }
          else {
            const photoId = file.entry.split("/", 2)[1]!;
            const data = metadataBytes.get(photoId)!;
            await zip.add(file.entry, new Uint8ArrayReader(data), {
              level: 0,
              zip64: true,
            });
            written += data.length;
          }
          emit({
            stage: "zip",
            completed: written,
            total,
            message: `Wrote ${file.entry}`,
          });
        }
        await zip.add(MANIFEST_PATH, new Uint8ArrayReader(manifestBytes), {
          level: 0,
          zip64: true,
        });
        written += manifestBytes.length;
        await zip.close();
        const candidates = plan.photos.flatMap((photo) => [
          photo.chosenOriginal,
          ...photo.raw,
          ...photo.sidecars,
        ]);
        await verifyAllSnapshots(candidates, files, signal);
        if (outputHandle) {
          await outputHandle.sync();
          await outputHandle.close();
          outputHandle = undefined;
        } else {
          const handle = await open(temporary, "r+");
          await handle.sync();
          await handle.close();
        }
        checkAbort(signal);
        await publishNoReplace(temporary, output);
        await syncDirectory(path.dirname(output));
        const estimate = estimatePlan(plan);
        return {
          ...estimate,
          estimatedBytes: written,
          outputPath: output,
          manifest,
          metadataByPhotoId,
        };
      } catch (error) {
        // zip.add/pump has settled by the time its awaited call rejects. Close source
        // streams and the sink before unlinking, including on platforms that lock open files.
        for (const input of sourceStreams) input.destroy();
        await Promise.all([...sourceStreams].map((input) => waitForClose(input)));
        if (outputStream) {
          outputStream.destroy();
          await waitForClose(outputStream);
        }
        if (outputHandle) {
          await outputHandle.close().catch(() => {});
        }
        for (let attempt = 0; ; attempt++) {
          try {
            await rm(temporary, { force: true, maxRetries: 5, retryDelay: 100 });
            break;
          } catch (cleanupError) {
            const code = (cleanupError as NodeJS.ErrnoException).code;
            if (attempt >= 5 || (code !== "EBUSY" && code !== "EPERM")) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        if (error instanceof PackageWriteError) throw error;
        if (signal.aborted || (error as NodeJS.ErrnoException).code === "ABORT_ERR") throw new PackageWriteError("cancelled", "Package writing was cancelled");
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new PackageWriteError("output-exists", `Output already exists: ${output}`);
        throw new PackageWriteError("disk-failure", error instanceof Error ? error.message : String(error));
      }
    },
  };
}

