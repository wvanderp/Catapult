/* eslint-disable unicorn/filename-case -- package-format is the established workspace package name. */
import { describe, expect, it } from "vitest";
import {
  crossValidate,
  isSafeEntryPath,
  parseManifest,
  parsePhotoMetadata,
  sanitiseEntryFilename,
} from "../src/index.ts";

/** Valid test metadata fixture. */
const metadata = {
  schemaVersion: 1,
  id: "p1",
  source: {
    originalPath: "/source/a.jpg",
    discoveredAt: "2026-01-01T00:00:00.000Z",
    modifiedAt: "2026-01-01T00:00:00.000Z",
    size: 10,
  },
  original: {
    entryPath: "photos/p1/original/a.jpg",
    filename: "a.jpg",
    format: "jpeg",
    mimeType: "image/jpeg",
    sha256: "A".repeat(64),
    size: 10,
  },
  previews: {
    thumbnail: {
      entryPath: "photos/p1/previews/thumbnail.jpg",
      sha256: "b".repeat(64),
      size: 2,
      width: 2,
      height: 1,
    },
    working: {
      entryPath: "photos/p1/previews/working.jpg",
      sha256: "c".repeat(64),
      size: 3,
      width: 3,
      height: 2,
    },
  },
  attachments: [],
  raw: {
    state: "collection-disabled",
    attachmentIds: [],
    matchedBy: "disabled",
  },
  processing: [],
  extensions: {},
};
/**
 * Build a valid package manifest fixture.
 *
 * @returns Manifest fixture.
 */
function manifest() {
  return {
    format: "catapult-photo-package",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    generator: { name: "catapult", version: "1.0" },
    entries: [
      "photos/p1/metadata.json",
      "photos/p1/original/a.jpg",
      "photos/p1/previews/thumbnail.jpg",
      "photos/p1/previews/working.jpg",
    ],
    photos: [
      {
        id: "p1",
        metadataPath: "photos/p1/metadata.json",
        originalPath: "photos/p1/original/a.jpg",
        originalFilename: "a.jpg",
        mimeType: "image/jpeg",
        format: "jpeg",
        size: 10,
        sha256: "A".repeat(64),
        previewPaths: {
          thumbnail: "photos/p1/previews/thumbnail.jpg",
          working: "photos/p1/previews/working.jpg",
        },
        previewHashes: { thumbnail: "b".repeat(64), working: "c".repeat(64) },
        previewSizes: { thumbnail: 2, working: 3 },
        attachmentIds: [],
      },
    ],
    attachments: [],
    extensions: {},
  };
}

describe("portable entry paths", () => {
  it.each([
    "/root/a",
    "C:/root/a",
    "../a",
    "a/../b",
    "a\\b",
    "a\0b",
    "a//b",
    "CON",
    "nul.txt",
    "folder/name. ",
    "a:b",
    "a?b",
    "a\u{1}b",
    "cafe\u{301}.jpg",
  ])("rejects unsafe path %s", (path) =>
    expect(isSafeEntryPath(path)).toBe(false),
  );
  it("accepts safe paths and sanitises legal Linux names", () => {
    expect(isSafeEntryPath("photos/id/original/a.jpg")).toBe(true);
    expect(sanitiseEntryFilename("CON.txt")).toBe("_CON.txt");
    expect(sanitiseEntryFilename("name. ")).toBe("name");
  });
  it("normalises decomposed source filenames for entries while retaining the source name", () => {
    const sourceFilename = "cafe\u{301}.jpg";
    const entryFilename = sanitiseEntryFilename(sourceFilename);
    expect(entryFilename).toBe("café.jpg");
    expect(isSafeEntryPath(`photos/p1/original/${entryFilename}`)).toBe(true);
    expect(sourceFilename).not.toBe(entryFilename);
    const parsed = parsePhotoMetadata({
      ...metadata,
      source: { ...metadata.source, originalPath: `/source/${sourceFilename}` },
      original: {
        ...metadata.original,
        filename: entryFilename,
        sourceFilename,
        entryPath: `photos/p1/original/${entryFilename}`,
      },
    });
    expect(parsed.original.sourceFilename).toBe(sourceFilename);
  });
  it("rejects case and Unicode-normalisation collisions for entries and ids", () => {
    const duplicatePath = manifest();
    duplicatePath.entries.push("PHOTOS/p1/metadata.json");
    expect(() => parseManifest(duplicatePath)).toThrow(
      /portable normalisation/,
    );
    const duplicateId = manifest();
    duplicateId.photos.push({ ...duplicateId.photos[0]!, id: "P1" });
    expect(() => parseManifest(duplicateId)).toThrow(/portable normalisation/);
  });
});

describe("attachment source records", () => {
  it("keeps each deduplicated source with its own timestamps", () => {
    const record = {
      id: "attachment1",
      role: "sidecar",
      entryPath: "attachments/attachment1/note.xmp",
      filename: "note.xmp",
      sha256: "d".repeat(64),
      size: 10,
      sources: [
        { path: "/one/note.xmp", discoveredAt: "2026-01-01T00:00:00.000Z", modifiedAt: "2025-12-31T00:00:00.000Z" },
        { path: "/two/note.xmp", discoveredAt: "2026-01-02T00:00:00.000Z", modifiedAt: "2025-12-30T00:00:00.000Z", createdAt: "2025-01-01T00:00:00.000Z" },
      ],
    };
    const parsed = parsePhotoMetadata({ ...metadata, attachments: [record] });
    expect(parsed.attachments[0]?.sources).toEqual(record.sources);
    expect(() => parsePhotoMetadata({ ...metadata, attachments: [{ ...record, sources: undefined, sourcePaths: ["/one/note.xmp"], discoveredAt: record.sources[0]!.discoveredAt, modifiedAt: record.sources[0]!.modifiedAt }] })).toThrow();
  });
});

describe("strict manifest and metadata validation", () => {
  it("parses the package graph and lowercases hashes", () => {
    expect(parseManifest(manifest()).photos[0]?.sha256).toBe("a".repeat(64));
    expect(parsePhotoMetadata(metadata).original.sha256).toBe("a".repeat(64));
    crossValidate(manifest(), metadata);
  });
  it("rejects unexpected nested fields", () => {
    const value = {
      ...manifest(),
      photos: [{ ...manifest().photos[0], unsafe: true }],
    };
    expect(() => parseManifest(value)).toThrow();
    expect(() =>
      parsePhotoMetadata({
        ...metadata,
        original: { ...metadata.original, captureTime: null },
      }),
    ).toThrow();
  });
  it("rejects repeated paths, invalid layout, duplicate links and unsafe ids", () => {
    const duplicate = manifest();
    duplicate.photos.push({ ...duplicate.photos[0]!, id: "p2" });
    expect(() => parseManifest(duplicate)).toThrow();
    const bad = manifest();
    bad.photos[0]!.metadataPath = "photos/p1/meta.json";
    expect(() => parseManifest(bad)).toThrow(/layout/);
    const ids = manifest();
    ids.photos[0]!.attachmentIds = ["a", "a"];
    expect(() => parseManifest(ids)).toThrow();
    const unsafe = manifest();
    unsafe.photos[0]!.id = "../x";
    expect(() => parseManifest(unsafe)).toThrow();
  });
  it("cross-validates hashes and rejects orphan entries", () => {
    const wrong = {
      ...metadata,
      original: { ...metadata.original, sha256: "f".repeat(64) },
    };
    expect(() => crossValidate(manifest(), wrong)).toThrow(/disagrees/);
    const orphan = manifest();
    orphan.entries.push("orphan.bin");
    expect(() => parseManifest(orphan)).toThrow(/Orphan/);
  });
  it("cross-validates every shared original and preview field", () => {
    expect(() =>
      crossValidate(manifest(), {
        ...metadata,
        original: { ...metadata.original, size: 11 },
      }),
    ).toThrow(/disagrees/);
    expect(() =>
      crossValidate(manifest(), {
        ...metadata,
        previews: {
          ...metadata.previews,
          thumbnail: { ...metadata.previews.thumbnail, size: 4 },
        },
      }),
    ).toThrow(/disagrees/);
    expect(() =>
      crossValidate(manifest(), {
        ...metadata,
        original: { ...metadata.original, sourceFilename: "a.jpg" },
      }),
    ).toThrow(/disagrees/);
  });
  it("enforces RAW state and TIFF-only metadata", () => {
    expect(() =>
      parsePhotoMetadata({
        ...metadata,
        raw: { state: "collected", matchedBy: "missing", attachmentIds: [] },
      }),
    ).toThrow();
    expect(() =>
      parsePhotoMetadata({
        ...metadata,
        raw: {
          state: "accepted-missing",
          matchedBy: "user",
          attachmentIds: [],
        },
      }),
    ).toThrow();
    expect(() =>
      parsePhotoMetadata({
        ...metadata,
        tiff: { pageCount: 1, selectedPage: 0 },
      }),
    ).toThrow();
    expect(() =>
      parsePhotoMetadata({
        ...metadata,
        original: {
          ...metadata.original,
          format: "tiff",
          mimeType: "image/tiff",
        },
      }),
    ).toThrow();
  });
  it("requires every path filename to be exactly one safe segment", () => {
    expect(() =>
      parsePhotoMetadata({
        ...metadata,
        original: { ...metadata.original, filename: "../a.jpg" },
      }),
    ).toThrow();
    expect(() =>
      parsePhotoMetadata({
        ...metadata,
        original: { ...metadata.original, filename: "a/b.jpg" },
      }),
    ).toThrow();
  });
});
