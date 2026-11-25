import { sanitiseEntryFilename } from "@catapult/package-format";
import type { PackagePlan } from "../types.js";

/**
 * Estimate serialized metadata and manifest bytes from the planned records.
 *
 * @param plan Package plan used to construct the estimate.
 * @returns Estimated combined metadata and manifest byte length.
 */
export function estimateMetadataBytes(plan: PackagePlan): number {
  const metadata = plan.photos.map(({ photo, chosenOriginal, preview, raw, sidecars }) => ({
    schemaVersion: 1,
    id: photo.id,
    source: {
      originalPath: chosenOriginal.path,
      discoveredAt: chosenOriginal.discoveredAt.toISOString(),
      modifiedAt: chosenOriginal.modifiedAt.toISOString(),
      ...(chosenOriginal.createdAt && { createdAt: chosenOriginal.createdAt.toISOString() }),
      size: chosenOriginal.snapshot.size,
    },
    original: {
      entryPath: `photos/${photo.id}/original/${sanitiseEntryFilename(chosenOriginal.filename)}`,
      filename: sanitiseEntryFilename(chosenOriginal.filename),
      sourceFilename: chosenOriginal.filename,
      format: chosenOriginal.extension.toLowerCase().includes("tif") ? "tiff" : "jpeg",
      mimeType: chosenOriginal.extension.toLowerCase().includes("tif") ? "image/tiff" : "image/jpeg",
      sha256: "0".repeat(64),
      size: chosenOriginal.snapshot.size,
    },
    previews: Object.fromEntries(preview.artifacts.map((artifact) => [artifact.kind, {
      entryPath: `photos/${photo.id}/previews/${artifact.kind}.jpg`,
      sha256: artifact.sha256,
      size: artifact.size,
      width: artifact.width,
      height: artifact.height,
    }])),
    attachments: [...raw, ...sidecars].map((candidate) => ({
      id: "0".repeat(24),
      role: candidate.role,
      entryPath: `attachments/${"0".repeat(24)}/${sanitiseEntryFilename(candidate.filename)}`,
      filename: sanitiseEntryFilename(candidate.filename),
      sourceFilename: candidate.filename,
      sha256: "0".repeat(64),
      sources: [{
        path: candidate.path,
        discoveredAt: candidate.discoveredAt.toISOString(),
        modifiedAt: candidate.modifiedAt.toISOString(),
        ...(candidate.createdAt && { createdAt: candidate.createdAt.toISOString() }),
      }],
      size: candidate.snapshot.size,
    })),
    processing: [
      ...preview.steps,
      {
        tool: "@zip.js/zip.js",
        version: plan.versions.zipVersion,
        step: "package-store-zip",
        settings: { compression: "STORE", zip64: true },
        result: { entryCount: 4 + raw.length + sidecars.length },
        warnings: [
          ...preview.warnings,
          ...(raw.length === 0 && photo.rawMatch.state !== "disabled"
            ? ["No RAW attachment was accepted for this photo"]
            : []),
          ...(chosenOriginal.snapshot.size >= 100 * 1024 * 1024
            ? [`Large original at least 100 MB: ${chosenOriginal.path}`]
            : []),
        ],
      },
    ],
  }));
  const manifestEstimate = {
    format: "catapult-photo-package",
    version: 1,
    createdAt: new Date(0).toISOString(),
    generator: plan.versions,
    entries: plan.photos.flatMap((photo) => [photo.photo.id, ...photo.preview.artifacts.map((artifact) => artifact.path)]),
    attachments: [...new Set(plan.photos.flatMap((photo) => [...photo.raw, ...photo.sidecars].map((item) => `${item.role}:${item.path}`)))],
  };
  return Buffer.byteLength(`${JSON.stringify(metadata, null, 2)}\n`) + Buffer.byteLength(`${JSON.stringify(manifestEstimate, null, 2)}\n`);
}
