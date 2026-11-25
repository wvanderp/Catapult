# Catapult companion CLI and package format, v1

This document is the shared implementation contract for the companion CLI and browser importer. Keep the package format browser-safe: `@catapult/package-format` must not import Node APIs. Its source exports are directly consumable from Vite, Vitest, TypeScript, and the Node CLI.

## Goal and scope

Prepare one ZIP for Catapult so preview display is fast and browser memory stays low, while originals and related files remain together. V1 supports JPEG and TIFF originals. Video is deferred. Windows is the primary platform and Linux is secondary. The CLI runs from the project folder and targets about 200 photos / 2 GB plus RAW files. It does not resume an interrupted run or silently overwrite output. Source files are never modified.

Run `pnpm install`, then `pnpm package-photos "<source-folder>"` from the repository root. Use Node.js 20 or newer and pnpm 11.7.0. The package metadata intentionally records full local source paths (including drive and folder names), so users should review the ZIP before sharing it.

## TUI flow

1. Choose a source folder.
2. Configure package contents. Originals, both previews, and JSON metadata are mandatory. RAW and sidecar collection are optional and default on.
3. Select photos directly in the chosen folder. JPEG and TIFF files are all selected by default. Show name, date, and size and allow filtering. Same-basename JPEG/TIFF files form one photo; the user chooses which is the original.
4. Resolve ambiguous, suspicious, and missing RAWs: search further, choose manually, accept missing, or deselect the photo.
5. Generate previews with progress. Allow retry or deselection after a failure.
6. Show a summary, choose the output location, and write the ZIP. The destination is part of the write plan, independent of scan and matching options.

Use arrows, Space, Enter, and Escape for navigation and selection.

## RAW and sidecar matching

Match RAW by case-insensitive exact basename. Renamed or suffixed files are out of scope and treated as missing. Search the chosen folder and descendants first. Ask before every expansion to a parent and its descendants, and never rescan visited directories. Do not follow symlinks or junctions. Do not use EXIF for matching; use filesystem metadata.

One candidate is auto-accepted only when modified times differ by at most 5 seconds; otherwise ask the user and show both paths, created/modified dates, and sizes. Multiple candidates always require a decision. Permit accepting all candidates from the same folder at once. A missing RAW requires explicit acceptance or photo deselection.

RAW extensions (case insensitive): `nef cr2 cr3 crw arw srf sr2 raf orf rw2 dng pef srw x3f 3fr fff iiq kdc dcr mrw nrw erf mef mos rwl raw gpr`.

Collect `.xmp`, `.pp3`, and `.dop` files beside the chosen original or matched RAW. Support both `DSC_1234.xmp` and `DSC_1234.JPG.xmp` naming.

## Preview generation

Create a 320 px longest-edge thumbnail and a 1280 px longest-edge working preview. Both are JPEG, orientation-corrected, sRGB, aspect-preserving, and never upscaled. For a multipage TIFF, use the first page and flag that choice in the TUI and metadata. Originals remain byte-for-byte unchanged. Keep processing concurrency bounded.

## ZIP layout and writing

```text
manifest.json
photos/<photo-id>/metadata.json
photos/<photo-id>/original/<original-filename>
photos/<photo-id>/previews/thumbnail.jpg
photos/<photo-id>/previews/working.jpg
attachments/<attachment-id>/<original-filename>
```

All entries use STORE (uncompressed) so the browser can slice them. Stream output to disk and support ZIP64. Write to a temporary file, then rename without overwriting an existing output. Clean temporary output on failure or cancellation. Deduplicate shared attachments by content SHA-256 and link them to every photo that uses them. Every relationship is explicit in the manifest. Record SHA-256 for every original and every other content entry.

Detect source files that change between scan and ZIP writing and fail with a clear error. A changed size or filesystem modified time should trigger content revalidation; hashes are authoritative.

## Manifest v1 and per-photo metadata

`manifest.json` has `format: "catapult-photo-package"`, integer `version: 1`, `createdAt`, and a unique `entries` list for every ZIP entry except the manifest itself. `photos` records each unique photo id, metadata path, original path, thumbnail and working paths, original SHA-256, and attachment ids. `attachments` records each unique attachment id, entry path, filename, SHA-256, byte size, and the photo ids that reference it. Optional `extensions` objects are reserved for forward-compatible tool results. All entry paths are slash-separated relative ZIP paths.

Per-photo `metadata.json` records schema version, id, full source paths including drive/folders, discovery/collection times for each file, created/modified dates, sizes, entry paths, hashes, relationships, processing steps/settings/results/warnings, multipage choice, accepted-missing RAW state, format and tool versions. Each deduplicated attachment has a `sources` array; each source object carries its own path, `discoveredAt`, `modifiedAt`, and optional `createdAt`. Do not include EXIF. Keep tool output extensible. Runtime parsing is provided by `parseManifest` and `parsePhotoMetadata`; reject unsafe paths, inconsistent cross references, undeclared references, orphan declarations, duplicate ids/entries, and unsupported versions.

## Browser importer contract

Read ZIP entries on demand. Use thumbnails in grids and working previews for larger views; load originals only for EXIF extraction and publishing. Keep RAW and sidecars in the ZIP for future Internet Archive support. Remember the ZIP file handle in IndexedDB on Chrome/Edge, try to reopen after reload, and request a permission click when needed. Firefox/Safari require reselection. Verify original content by SHA-256 against the manifest. Do not cache previews in IndexedDB; text edits and EXIF persist.

Import is one-shot: do not merge edits between ZIPs. A duplicate photo from another ZIP causes a warning. Reject unsafe paths and unsupported versions. Originals over 100 MB produce a web UI warning but do not block import. Chunked upload (GitHub issue #2) is out of scope. Refactoring the existing base64 import (issue #1) is out of scope.

## Package and code ownership contracts

- `packages/package-format/src/index.ts` owns browser-safe schemas, types, path constants, path safety, and parse/cross-reference validation.
- `packages/cli/src/types.ts` owns scanner, matcher, expansion, preview, ZIP writer, progress, and summary contracts. Implementations belong under reserved `scan/`, `preview/`, `zip/`, and `tui/` directories.
- `@zip.js/zip.js` is the browser ZIP reader and the CLI's maintained streaming ZIP64 writer; emit entries with STORE mode. It is BSD-3-Clause licensed. `sharp` is Apache-2.0 licensed and ships Windows prebuilt binaries; its libvips dependency has separate LGPL terms.
- Module ownership: `packages/cli/src/scan/` and `packages/cli/test/scan/` own scanning/matching; `packages/cli/src/preview/`, `packages/cli/src/zip/`, and `packages/cli/test/` own image processing and writing; `packages/cli/src/tui/` and `packages/cli/src/cli.ts` own the Ink interface and command entry; the package root `packages/cli/src/` owns the browser importer.
- Node-only code belongs in `packages/cli`; do not import it from the Vite app. Vite builds the browser app only.
- Use `AbortSignal` on pipeline operations and dependency-injected contracts so stages can be tested independently. Preview temporary files are owned by an explicit preview session; the caller must call `dispose()` after ZIP writing completes or is cancelled. Preview paths remain valid until disposal.
- Matcher sessions own both the visited-directory set and the highest directory searched; each parent expansion advances that search root and reports newly visited directories. Initial RAW search receives only selected photos with chosen originals, the complete scan result, and package options, so disabled RAW collection is represented as disabled state. Manual file picks are inspected into file candidates before applying a pure decision.
- Preview retries run within the existing preview session and update that session's result for the photo; the session has one disposal operation. TIFF page count and multipage status come from preview results, not scan records.
- The package plan carries the selected output path. Selected originals, RAW candidates, and sidecars are writer inputs; the writer hashes and deduplicates attachments while preparing the archive rather than receiving a pre-deduplicated attachment list.

Portable archive paths reject Windows device names, trailing dots/spaces, control characters and reserved punctuation, and compare for uniqueness after Unicode NFC normalisation and case folding. `sanitiseEntryFilename` is the documented helper for retaining legal Linux source names in portable entries; metadata keeps the original filename. Every nested v1 object is strict, with tool extensions under `extensions` only. IDs use ASCII letters, digits, underscore, and hyphen. A path may be referenced only once. Manifest photo records include original filename, MIME/format, byte size and SHA-256, plus hashes and sizes for both previews; attachment records include role. Hashes are lowercase and generator name/version are required.

RAW metadata distinguishes `collected`, `accepted-missing`, and `collection-disabled`, and records its match method. `discoveredAt` is the collection/discovery time; EXIF capture time is excluded. Preview records include dimensions and byte sizes. TIFF page metadata is present only for TIFF input. Shared attachment metadata preserves each source path with that source's own timestamps. Use `crossValidate(manifest, metadata)` for per-photo agreement.
