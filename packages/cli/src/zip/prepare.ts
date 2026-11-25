import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import type { AttachmentCandidate, FileCandidate, PackageEstimate, PackagePlan, ProgressEvent } from "../types.js";
import { PackageWriteError } from "../types.js";
import { estimateMetadataBytes } from "./metadata.js";
import { checkAbort, hashFile } from "./stream.js";

/**
 * Create a stable short identifier from a deduplication key.
 *
 * @param text Key material.
 * @returns 24-character lowercase SHA-256 prefix.
 */
export const idFor = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 24);

/** Hashed source file prepared for ZIP streaming. */
export type PreparedFile = { path: string; entry: string; size: number; sha256: string; candidate?: FileCandidate };

/**
 * Collect every original and attachment selected for packaging.
 *
 * @param plan Resolved package plan.
 * @returns Source candidates in plan order.
 */
export function allFiles(plan: PackagePlan): FileCandidate[] {
  return plan.photos.flatMap((photo) => [photo.chosenOriginal, ...photo.raw, ...photo.sidecars]);
}

/**
 * Estimate source, preview, and serialized package metadata sizes.
 *
 * @param plan Resolved package plan.
 * @returns Estimated output bytes, source bytes, counts, and warnings.
 */
export function estimatePlan(plan: PackagePlan): PackageEstimate {
  const originals = plan.photos.map((photo) => photo.chosenOriginal);
  const attachmentsFiles = plan.photos.flatMap((photo) => [...photo.raw, ...photo.sidecars]);
  const attachments = new Set<string>();
  for (const candidate of attachmentsFiles) attachments.add(candidate.path);
  const sourceFiles = new Map<string, FileCandidate>();
  for (const candidate of [...originals, ...attachmentsFiles]) sourceFiles.set(candidate.path, candidate);
  let sourceBytes = 0;
  for (const file of sourceFiles.values()) sourceBytes += file.snapshot.size;
  const previewFiles = new Map<string, number>();
  for (const photo of plan.photos) for (const artifact of photo.preview.artifacts) previewFiles.set(artifact.path, artifact.size);
  let previewBytes = 0;
  for (const size of previewFiles.values()) previewBytes += size;
  const metadataBytes = estimateMetadataBytes(plan);
  const uniqueOriginals = new Map(originals.map((file) => [file.path, file]));
  const warnings: string[] = [];
  for (const file of uniqueOriginals.values()) {
    if (file.snapshot.size >= 100 * 1024 * 1024)
      warnings.push(`Large original at least 100 MB: ${file.path}`);
  }
  return {
    estimatedBytes: sourceBytes + previewBytes + metadataBytes,
    sourceBytes,
    photoCount: plan.photos.length,
    attachmentCount: attachments.size,
    warnings,
  };
}

/**
 * Hash and snapshot source and preview files before packaging.
 *
 * @param plan Resolved package plan.
 * @param signal Cancellation signal.
 * @param emit Progress callback.
 * @returns Prepared file hashes and sizes indexed by source path.
 */
export async function prepareFiles(plan: PackagePlan, signal: AbortSignal, emit: (event: ProgressEvent) => void): Promise<Map<string, PreparedFile>> {
  const result = new Map<string, PreparedFile>(); const candidates = allFiles(plan); let n = 0;
  for (const candidate of candidates) {
    checkAbort(signal); let before;
    try { before = await stat(candidate.path); }
    catch (error) { throw new PackageWriteError("source-changed", `Unable to stat source before hashing: ${error instanceof Error ? error.message : String(error)}`); }
    if (before.size !== candidate.snapshot.size || before.mtimeMs !== candidate.snapshot.mtimeMs) throw new PackageWriteError("source-changed", `Source changed since scan: ${candidate.path}`);
    const digest = await hashFile(candidate.path, signal); let after;
    try { after = await stat(candidate.path); }
    catch (error) { throw new PackageWriteError("source-changed", `Unable to stat source after hashing: ${error instanceof Error ? error.message : String(error)}`); }
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || digest.size !== before.size) throw new PackageWriteError("source-changed", `Source changed while hashing: ${candidate.path}`);
    result.set(candidate.path, { path: candidate.path, entry: "", ...digest, candidate });
    emit({ stage: "hash", completed: ++n, total: candidates.length, message: `Hashed ${candidate.filename}` });
  }
  const previewArtifacts = plan.photos.flatMap((photo) => photo.preview.artifacts);
  for (const artifact of previewArtifacts) {
    checkAbort(signal);
    let before;
    try { before = await stat(artifact.path); }
    catch (error) { throw new PackageWriteError("source-changed", `Unable to stat preview before hashing: ${error instanceof Error ? error.message : String(error)}`); }
    const digest = await hashFile(artifact.path, signal);
    let after;
    try { after = await stat(artifact.path); }
    catch (error) { throw new PackageWriteError("source-changed", `Unable to stat preview after hashing: ${error instanceof Error ? error.message : String(error)}`); }
    if (before.size !== artifact.size || after.size !== before.size || digest.size !== artifact.size || digest.sha256 !== artifact.sha256)
      throw new PackageWriteError("source-changed", `Preview changed while preparing ZIP: ${artifact.path}`);
    result.set(artifact.path, { path: artifact.path, entry: "", ...digest });
    emit({ stage: "hash", completed: ++n, total: candidates.length + previewArtifacts.length, message: `Verified ${artifact.kind} preview` });
  }
  return result;
}
/**
 * Deduplicate attachment entries by role and content digest.
 *
 * @param plan Resolved package plan.
 * @param files Prepared hashes indexed by source path.
 * @returns Attachment groups and their referencing photos.
 */
export function dedupeAttachments(plan: PackagePlan, files: Map<string, PreparedFile>): Map<string, { id: string; photoIds: string[]; candidates: AttachmentCandidate[] }> {
  const result = new Map<string, { id: string; photoIds: string[]; candidates: AttachmentCandidate[] }>();
  const candidates = plan.photos.flatMap((photo) => [...photo.raw, ...photo.sidecars].map((candidate) => ({ photo, candidate })));
  for (const { photo, candidate } of candidates) {
    const digest = files.get(candidate.path)!.sha256;
    const key = `${candidate.role}:${digest}`;
    const item = result.get(key);
    if (item) { if (!item.photoIds.includes(photo.photo.id)) item.photoIds.push(photo.photo.id); if (item.candidates.every((source) => source.path !== candidate.path)) item.candidates.push(candidate); }
    else result.set(key, { id: idFor(key), photoIds: [photo.photo.id], candidates: [candidate] });
  }
  return result;
}
