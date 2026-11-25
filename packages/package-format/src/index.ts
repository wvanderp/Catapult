/* eslint-disable unicorn/filename-case -- package-format is the established workspace package name. */
/* eslint-disable no-control-regex -- portable path rules must explicitly reject Unicode control code points. */
import { z } from "zod";

/** RAW match method values recorded in per-photo metadata. */
export type RawMatchMethod = "exact-basename-mtime" | "user" | "missing" | "disabled";

/** Current supported package format version. */
export const PACKAGE_FORMAT_VERSION = 1 as const;
/** Archive path of the package manifest. */
export const MANIFEST_PATH = "manifest.json";
/** Root directory for photo entries. */
export const PHOTO_DIRECTORY = "photos";
/** Root directory for attachment entries. */
export const ATTACHMENT_DIRECTORY = "attachments";
/** Per-photo metadata filename. */
export const PHOTO_METADATA_FILENAME = "metadata.json";
/** Per-photo original directory. */
export const ORIGINAL_DIRECTORY = "original";
/** Per-photo preview directory. */
export const PREVIEWS_DIRECTORY = "previews";
/** Thumbnail preview filename. */
export const THUMBNAIL_FILENAME = "thumbnail.jpg";
/** Working preview filename. */
export const WORKING_PREVIEW_FILENAME = "working.jpg";

/** Error raised when a package uses a format version this runtime cannot read. */
export class UnsupportedVersionError extends Error {
  public readonly version: number;
  public constructor(version: number) {
    super(`Unsupported Catapult package format version: ${version}`);
    this.name = "UnsupportedVersionError";
    this.version = version;
  }
}

const idSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "IDs may contain only ASCII letters, digits, underscore, and hyphen",
  );
const hashSchema = z
  .string()
  .regex(/^[a-f\d]{64}$/i, "Expected a SHA-256 hex digest")
  .transform((value) => value.toLowerCase());
const entryPathSchema = z
  .string()
  .min(1)
  .refine(isSafeEntryPath, "Unsafe ZIP entry path");
const formatVersionSchema = z.number().int().positive();
const sizeSchema = z.number().int().nonnegative();
const recordSchema = z.record(z.string(), z.unknown());

const processingSchema = z.array(
  z
    .object({
      tool: z.string().min(1),
      version: z.string().min(1),
      step: z.string().min(1),
      settings: recordSchema,
      result: recordSchema,
      warnings: z.array(z.string()),
    })
    .strict(),
);
const portableFilenameSchema = z
  .string()
  .min(1)
  .refine(
    (value) => isSafeEntryPath(value) && !value.includes("/"),
    "Expected one safe portable filename segment",
  );
const attachmentMetadataSchema = z
  .object({
    id: idSchema,
    role: z.enum(["raw", "sidecar"]),
    entryPath: entryPathSchema,
    filename: portableFilenameSchema,
    sourceFilename: z.string().min(1).optional(),
    sha256: hashSchema,
    sources: z.array(z.object({
      path: z.string().min(1),
      discoveredAt: z.string().datetime(),
      modifiedAt: z.string().datetime(),
      createdAt: z.string().datetime().optional(),
    }).strict()).min(1),
    size: sizeSchema,
  })
  .strict();

/** Strict v1 per-photo metadata schema. Unknown fields belong in extensions. */
export const photoMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: idSchema,
    source: z
      .object({
        originalPath: z.string().min(1),
        discoveredAt: z.string().datetime(),
        modifiedAt: z.string().datetime(),
        createdAt: z.string().datetime().optional(),
        size: sizeSchema,
      })
      .strict(),
    original: z
      .object({
        entryPath: entryPathSchema,
        filename: portableFilenameSchema,
        sourceFilename: z.string().min(1).optional(),
        format: z.enum(["jpeg", "tiff"]),
        mimeType: z.enum(["image/jpeg", "image/tiff"]),
        sha256: hashSchema,
        size: sizeSchema,
      })
      .strict(),
    previews: z
      .object({
        thumbnail: z
          .object({
            entryPath: entryPathSchema,
            sha256: hashSchema,
            size: sizeSchema,
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .strict(),
        working: z
          .object({
            entryPath: entryPathSchema,
            sha256: hashSchema,
            size: sizeSchema,
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
    attachments: z.array(attachmentMetadataSchema),
    raw: z.discriminatedUnion("state", [
      z
        .object({
          state: z.literal("collected"),
          attachmentIds: z.array(idSchema).min(1),
          matchedBy: z.enum(["exact-basename-mtime", "user"]),
        })
        .strict(),
      z
        .object({
          state: z.literal("accepted-missing"),
          attachmentIds: z.tuple([]),
          matchedBy: z.literal("missing"),
        })
        .strict(),
      z
        .object({
          state: z.literal("collection-disabled"),
          attachmentIds: z.tuple([]),
          matchedBy: z.literal("disabled"),
        })
        .strict(),
    ]),
    tiff: z
      .object({
        pageCount: z.number().int().positive(),
        selectedPage: z.literal(0),
      })
      .strict()
      .optional(),
    processing: processingSchema,
    extensions: recordSchema,
  })
  .strict()
  .superRefine((metadata, context) => {
    if (
      (metadata.original.format === "tiff") !==
      (metadata.original.mimeType === "image/tiff")
    )
      context.addIssue({
        code: "custom",
        path: ["original", "mimeType"],
        message: "MIME type must agree with format",
      });
    if (metadata.original.format === "tiff" && !metadata.tiff)
      context.addIssue({
        code: "custom",
        path: ["tiff"],
        message: "TIFF metadata is required for TIFF originals",
      });
    if (metadata.original.format === "jpeg" && metadata.tiff)
      context.addIssue({
        code: "custom",
        path: ["tiff"],
        message: "TIFF metadata is forbidden for JPEG originals",
      });
    if (
      metadata.original.sourceFilename !== undefined &&
      sanitiseEntryFilename(metadata.original.sourceFilename) !==
        metadata.original.filename
    )
      context.addIssue({
        code: "custom",
        path: ["original", "sourceFilename"],
        message: "Source filename does not sanitise to the entry filename",
      });
    const sourcePathFilename = metadata.source.originalPath
      .split(/[\\/]/u)
      .at(-1);
    if (
      sourcePathFilename !==
        (metadata.original.sourceFilename ?? metadata.original.filename) ||
      sanitiseEntryFilename(sourcePathFilename ?? "") !==
        metadata.original.filename
    )
      context.addIssue({
        code: "custom",
        path: ["source", "originalPath"],
        message:
          "Source path filename does not match original filename metadata",
      });
    if (
      metadata.attachments.some(
        (item) =>
          item.sourceFilename !== undefined &&
          sanitiseEntryFilename(item.sourceFilename) !== item.filename,
      )
    )
      context.addIssue({
        code: "custom",
        path: ["attachments"],
        message: "Attachment source filename does not match its entry filename",
      });
    if (metadata.attachments.some((item) => new Set(item.sources.map((source) => source.path)).size !== item.sources.length))
      context.addIssue({ code: "custom", path: ["attachments"], message: "Attachment source paths must be unique" });
    const rawMetadata = metadata.raw;
    if (
      rawMetadata?.state === "collected" &&
      metadata.attachments.some(
        (item) =>
          item.role === "raw" && !rawMetadata.attachmentIds.includes(item.id),
      )
    )
      context.addIssue({
        code: "custom",
        path: ["raw", "attachmentIds"],
        message: "RAW attachments must be listed in RAW state",
      });
    if (
      metadata.raw?.state === "collected" &&
      metadata.raw.attachmentIds.some((id) =>
        metadata.attachments.every(
          (item) => item.id !== id || item.role !== "raw",
        ),
      )
    )
      context.addIssue({
        code: "custom",
        path: ["raw", "attachmentIds"],
        message: "RAW state references a missing RAW attachment",
      });
    if (
      rawMetadata.state !== "collected" &&
      metadata.attachments.some((item) => item.role === "raw")
    )
      context.addIssue({
        code: "custom",
        path: ["raw"],
        message: "Non-collected RAW state cannot include RAW attachments",
      });
  });
/** Parsed per-photo metadata shape. */
export type PhotoMetadata = z.infer<typeof photoMetadataSchema>;

const manifestPhotoSchema = z
  .object({
    id: idSchema,
    metadataPath: entryPathSchema,
    originalPath: entryPathSchema,
    originalFilename: portableFilenameSchema,
    sourceFilename: z.string().min(1).optional(),
    mimeType: z.enum(["image/jpeg", "image/tiff"]),
    format: z.enum(["jpeg", "tiff"]),
    size: sizeSchema,
    sha256: hashSchema,
    previewPaths: z
      .object({ thumbnail: entryPathSchema, working: entryPathSchema })
      .strict(),
    previewHashes: z
      .object({ thumbnail: hashSchema, working: hashSchema })
      .strict(),
    previewSizes: z
      .object({ thumbnail: sizeSchema, working: sizeSchema })
      .strict(),
    attachmentIds: z.array(idSchema),
  })
  .strict();
const manifestAttachmentSchema = z
  .object({
    id: idSchema,
    entryPath: entryPathSchema,
    filename: portableFilenameSchema,
    sourceFilename: z.string().min(1).optional(),
    sha256: hashSchema,
    size: sizeSchema,
    role: z.enum(["raw", "sidecar"]),
    photoIds: z.array(idSchema).min(1),
  })
  .strict();

/** Strict v1 manifest schema; generator provenance is required. */
/** Strict v1 package manifest schema. */
export const manifestSchema = z
  .object({
    format: z.literal("catapult-photo-package"),
    version: formatVersionSchema,
    createdAt: z.string().datetime(),
    generator: z
      .object({ name: z.string().min(1), version: z.string().min(1) })
      .strict(),
    entries: z.array(entryPathSchema),
    photos: z.array(manifestPhotoSchema),
    attachments: z.array(manifestAttachmentSchema),
    extensions: recordSchema,
  })
  .strict();
/** Parsed v1 package manifest shape. */
export type PackageManifest = z.infer<typeof manifestSchema> & { version: 1 };

/**
 * Validate a slash-separated relative ZIP path, including Windows and Unicode hazards.
 *
 * @param path ZIP entry path to validate.
 * @returns Whether the path is portable and safe.
 */
export function isSafeEntryPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("\\") &&
    !path.startsWith("/") &&
    !/^[a-z\d+.-]+:/i.test(path) &&
    path
      .split("/")
      .every(
        (segment) =>
          segment.length > 0 &&
          segment !== "." &&
          segment !== ".." &&
          segment === segment.normalize("NFC") &&
          !/[\u{0}-\u{1F}\u{7F}<>:"|?*]/u.test(segment) &&
          !/[. ]$/u.test(segment) &&
          !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(segment),
      )
  );
}

/**
 * Sanitise a legal source filename for portable ZIP entry paths; retain the original separately as metadata.
 *
 * @param filename Original source filename.
 * @returns A portable entry filename.
 */
export function sanitiseEntryFilename(filename: string): string {
  const normalized = filename
    .normalize("NFC")
    .replaceAll(/[\u{0}-\u{1F}\u{7F}<>:"|?*]/gu, "_")
    .replaceAll(/[. ]+$/gu, "")
    .replaceAll(/[\\/]/gu, "_");
  const safe = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(
    normalized,
  )
    ? `_${normalized}`
    : normalized;
  return safe || "_";
}

/**
 * Parse and validate a manifest's entry layout, uniqueness, and relationship graph.
 *
 * @param input Untrusted manifest value.
 * @returns Validated v1 manifest with normalised hashes.
 */
export function parseManifest(input: unknown): PackageManifest {
  const rawVersion =
    typeof input === "object" && input !== null && "version" in input
      ? (input as { version?: unknown }).version
      : undefined;
  if (typeof rawVersion === "number" && rawVersion !== 1)
    throw new UnsupportedVersionError(rawVersion);
  const manifest = manifestSchema.parse(input);
  if (manifest.version !== 1)
    throw new UnsupportedVersionError(manifest.version);
  assertPortableUnique(manifest.entries, "entry paths");
  if (manifest.entries.includes(MANIFEST_PATH))
    throw new Error("manifest.json is implicit and must not appear in entries");
  const photos = new Map<string, (typeof manifest.photos)[number]>();
  const attachments = new Map(
    manifest.attachments.map((item) => [item.id, item]),
  );
  if (attachments.size !== manifest.attachments.length)
    throw new Error("Manifest contains duplicate attachment ids");
  assertPortableUnique(
    manifest.photos.map((photo) => photo.id),
    "photo ids",
  );
  assertPortableUnique(
    manifest.attachments.map((attachment) => attachment.id),
    "attachment ids",
  );
  const referenced = new Set<string>();
  const reference = (path: string): void => {
    if (!manifest.entries.includes(path))
      throw new Error(`Referenced entry is not declared: ${path}`);
    if (referenced.has(path))
      throw new Error(`Entry path is referenced more than once: ${path}`);
    referenced.add(path);
  };
  for (const photo of manifest.photos) {
    if (photos.has(photo.id))
      throw new Error(`Duplicate photo id: ${photo.id}`);
    photos.set(photo.id, photo);
    assertUnique(photo.attachmentIds, `attachmentIds for ${photo.id}`);
    const base = `photos/${photo.id}`;
    if (
      photo.metadataPath !== `${base}/metadata.json` ||
      !photo.originalPath.startsWith(`${base}/original/`) ||
      photo.previewPaths.thumbnail !== `${base}/previews/thumbnail.jpg` ||
      photo.previewPaths.working !== `${base}/previews/working.jpg`
    )
      throw new Error(`Invalid photo entry layout for ${photo.id}`);
    if (
      photo.originalPath.split("/").at(-1) !== photo.originalFilename ||
      (photo.sourceFilename !== undefined &&
        sanitiseEntryFilename(photo.sourceFilename) !== photo.originalFilename)
    )
      throw new Error(`Invalid original filename metadata for ${photo.id}`);
    for (const path of [
      photo.metadataPath,
      photo.originalPath,
      photo.previewPaths.thumbnail,
      photo.previewPaths.working,
    ])
      reference(path);
    for (const id of photo.attachmentIds)
      if (!attachments.has(id)) throw new Error(`Unknown attachment id: ${id}`);
  }
  for (const attachment of manifest.attachments) {
    if (
      attachment.entryPath !==
      `attachments/${attachment.id}/${attachment.filename}`
    )
      throw new Error(`Invalid attachment entry layout for ${attachment.id}`);
    if (
      attachment.sourceFilename !== undefined &&
      sanitiseEntryFilename(attachment.sourceFilename) !== attachment.filename
    )
      throw new Error(
        `Invalid attachment filename metadata for ${attachment.id}`,
      );
    reference(attachment.entryPath);
    assertUnique(attachment.photoIds, `photoIds for ${attachment.id}`);
    for (const id of attachment.photoIds)
      if (!photos.has(id))
        throw new Error(`Attachment references unknown photo id: ${id}`);
    for (const photo of manifest.photos)
      if (
        photo.attachmentIds.includes(attachment.id) !==
        attachment.photoIds.includes(photo.id)
      )
        throw new Error(
          `Attachment relationship is inconsistent: ${attachment.id} and ${photo.id}`,
        );
  }
  for (const entry of manifest.entries)
    if (!referenced.has(entry))
      throw new Error(`Orphan ZIP entry declaration: ${entry}`);
  return {
    ...manifest,
    photos: manifest.photos.map((p) => ({
      ...p,
      sha256: p.sha256.toLowerCase(),
      previewHashes: {
        thumbnail: p.previewHashes.thumbnail.toLowerCase(),
        working: p.previewHashes.working.toLowerCase(),
      },
    })),
    attachments: manifest.attachments.map((a) => ({
      ...a,
      sha256: a.sha256.toLowerCase(),
    })),
  } as PackageManifest;
}
/**
 * Reject duplicate values with a useful field label.
 *
 * @param values Values to check.
 * @param label Human-readable field label.
 */
function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`Duplicate ${label}`);
}

/**
 * Reject values that collide on portable filesystems after NFC and case folding.
 *
 * @param values Values to compare.
 * @param label Name of the value group.
 */
function assertPortableUnique(values: string[], label: string): void {
  const keys = values.map((value) => portableKey(value));
  if (new Set(keys).size !== keys.length)
    throw new Error(`Duplicate ${label} after portable normalisation`);
}

/**
 * Create a portable comparison key using NFC and Unicode caseless folding.
 *
 * @param value Input string.
 * @returns The portable comparison key.
 */
function portableKey(value: string): string {
  return value.normalize("NFC").toUpperCase().toLowerCase();
}

/**
 * Parse per-photo metadata and normalise all hashes to lowercase.
 *
 * @param input Untrusted metadata value.
 * @returns Validated metadata with normalised hashes.
 */
export function parsePhotoMetadata(input: unknown): PhotoMetadata {
  const parsed = photoMetadataSchema.parse(input);
  return {
    ...parsed,
    original: {
      ...parsed.original,
      sha256: parsed.original.sha256.toLowerCase(),
    },
    previews: {
      thumbnail: {
        ...parsed.previews.thumbnail,
        sha256: parsed.previews.thumbnail.sha256.toLowerCase(),
      },
      working: {
        ...parsed.previews.working,
        sha256: parsed.previews.working.sha256.toLowerCase(),
      },
    },
    attachments: parsed.attachments.map((a) => ({
      ...a,
      sha256: a.sha256.toLowerCase(),
    })),
  };
}

/**
 * Verify a photo metadata document agrees with the manifest's ids, paths, hashes, and attachments.
 *
 * @param manifestInput Untrusted or parsed manifest.
 * @param metadataInput Untrusted or parsed metadata.
 */
export function crossValidate(
  manifestInput: PackageManifest | unknown,
  metadataInput: PhotoMetadata | unknown,
): void {
  const manifest = parseManifest(manifestInput);
  const metadata = parsePhotoMetadata(metadataInput);
  const photo = manifest.photos.find((item) => item.id === metadata.id);
  if (!photo)
    throw new Error(`Metadata photo is absent from manifest: ${metadata.id}`);
  if (
    photo.metadataPath !== `photos/${metadata.id}/metadata.json` ||
    photo.originalPath !== metadata.original.entryPath ||
    photo.originalFilename !== metadata.original.filename ||
    photo.sourceFilename !== metadata.original.sourceFilename ||
    photo.format !== metadata.original.format ||
    photo.mimeType !== metadata.original.mimeType ||
    photo.sha256 !== metadata.original.sha256 ||
    photo.size !== metadata.original.size
  )
    throw new Error(`Photo metadata disagrees with manifest: ${metadata.id}`);
  if (
    metadata.original.entryPath.split("/").at(-1) !==
      metadata.original.filename ||
    (metadata.original.sourceFilename !== undefined &&
      sanitiseEntryFilename(metadata.original.sourceFilename) !==
        metadata.original.filename)
  )
    throw new Error(
      `Original filename metadata is inconsistent: ${metadata.id}`,
    );
  if (
    photo.previewPaths.thumbnail !== metadata.previews.thumbnail.entryPath ||
    photo.previewPaths.working !== metadata.previews.working.entryPath ||
    photo.previewHashes.thumbnail !== metadata.previews.thumbnail.sha256 ||
    photo.previewHashes.working !== metadata.previews.working.sha256 ||
    photo.previewSizes.thumbnail !== metadata.previews.thumbnail.size ||
    photo.previewSizes.working !== metadata.previews.working.size
  )
    throw new Error(`Preview metadata disagrees with manifest: ${metadata.id}`);
  const ids = metadata.attachments.map((a) => a.id);
  assertUnique(ids, `metadata attachments for ${metadata.id}`);
  if (
    ids.length !== photo.attachmentIds.length ||
    ids.some((id) => !photo.attachmentIds.includes(id))
  )
    throw new Error(`Attachment ids disagree with manifest: ${metadata.id}`);
  if (
    metadata.raw?.state === "collected" &&
    (metadata.raw.attachmentIds.length !==
      metadata.attachments.filter((item) => item.role === "raw").length ||
      metadata.raw.attachmentIds.some(
        (id) =>
          !photo.attachmentIds.includes(id) ||
          metadata.attachments.every(
            (item) => item.id !== id || item.role !== "raw",
          ),
      ))
  )
    throw new Error(
      `RAW attachment ids disagree with manifest: ${metadata.id}`,
    );
  for (const item of metadata.attachments) {
    const attachment = manifest.attachments.find((a) => a.id === item.id);
    if (
      !attachment ||
      attachment.entryPath !== item.entryPath ||
      attachment.sha256 !== item.sha256 ||
      attachment.size !== item.size ||
      attachment.role !== item.role ||
      attachment.filename !== item.filename ||
      attachment.sourceFilename !== item.sourceFilename ||
      !attachment.photoIds.includes(metadata.id)
    )
      throw new Error(
        `Attachment metadata disagrees with manifest: ${item.id}`,
      );
  }
}
