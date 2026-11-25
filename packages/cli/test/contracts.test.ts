import { createHash } from "node:crypto";
import { PassThrough, Writable } from "node:stream";
import { expect, expectTypeOf, it } from "vitest";
import {
  ZipReader,
  ZipWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
} from "@zip.js/zip.js";
import type { FileEntry } from "@zip.js/zip.js";
import type {
  PackagePlan,
  PackageSummary,
  PreviewResult,
} from "../src/types.js";
import {
  FakeMatcher,
  FakePreviewGenerator,
  FakeScanner,
  FakeZipWriter,
} from "./fakes.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const candidate = {
  path: "/photos/a.jpg",
  filename: "a.jpg",
  extension: ".jpg",
  snapshot: { size: 4, mtimeMs: now.valueOf() },
  createdAt: null,
  modifiedAt: now,
  discoveredAt: now,
};
const scan = {
  sourceDirectory: "/photos",
  visitedDirectories: ["/photos"],
  photos: [
    {
      id: "p1",
      jpegCandidates: [candidate],
      tiffCandidates: [],
      selected: true,
      suggestedOriginal: candidate,
    },
  ],
  warnings: [],
};
const preview: PreviewResult = {
  ok: true,
  photoId: "p1",
  artifacts: [
    {
      kind: "thumbnail",
      path: "/tmp/thumb.jpg",
      width: 1,
      height: 1,
      sha256: "a".repeat(64),
      size: 2,
      format: "jpeg",
    },
    {
      kind: "working",
      path: "/tmp/work.jpg",
      width: 1,
      height: 1,
      sha256: "b".repeat(64),
      size: 3,
      format: "jpeg",
    },
  ],
  pageCount: 1,
  multiPage: false,
  steps: [],
  warnings: [],
};

/**
 * Construct a typed plan through the scan, match, and preview fakes.
 *
 * @returns A complete package plan with fake-generated previews.
 */
async function createPlan(): Promise<PackagePlan> {
  const scanner = new FakeScanner(scan);
  const matcher = new FakeMatcher();
  const scanResult = await scanner.scan(
    "/photos",
    new AbortController().signal,
  );
  const session = await matcher.initialSearch(
    scanResult.photos.map((photo) => ({ ...photo, chosenOriginal: candidate })),
    scanResult,
    { sourceDirectory: "/photos", includeRaw: true, includeSidecars: true, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 1 },
    new AbortController().signal,
  );
  const photo = session.photos[0]!;
  const options = {
    sourceDirectory: "/photos",
    includeRaw: true,
    includeSidecars: true,
    thumbnailMaxEdge: 320,
    workingMaxEdge: 1280,
    concurrency: 1,
  } as const;
  const generator = new FakePreviewGenerator(preview);
  const previewSession = await generator.generateSession(
    [photo],
    options,
    new AbortController().signal,
    () => {},
  );
  const result = previewSession.results[0];
  expectTypeOf(result).toEqualTypeOf<PreviewResult>();
  if (!result?.ok) throw new Error("Fake preview did not succeed");
  return {
    photos: [
      {
        photo,
        chosenOriginal: photo.chosenOriginal!,
        preview: result,
        raw: [],
        sidecars: [],
      },
    ],
    outputPath: "/out.zip",
    options,
    versions: {
      generatorName: "catapult",
      generatorVersion: "1.0.0",
      sharpVersion: "0.0.0",
      zipVersion: "2.25.0",
    },
  } satisfies PackagePlan;
}

it("keeps a full scan-to-preview package plan typechecked", async () => {
  const plan = await createPlan();
  expect(plan.photos).toHaveLength(1);
  expect(plan.photos[0]?.chosenOriginal.filename).toBe("a.jpg");
  const summary = {
    estimatedBytes: 5,
    sourceBytes: 4,
    photoCount: 1,
    attachmentCount: 0,
    warnings: [],
    outputPath: "/out.zip",
    manifest: {} as PackageSummary["manifest"],
    metadataByPhotoId: {},
  } satisfies PackageSummary;
  const zip = new FakeZipWriter(summary);
  expect(zip.estimate(plan).photoCount).toBe(1);
  expect(await zip.write(plan, new AbortController().signal)).toBe(summary);
});

it("applies every matcher decision", async () => {
  const matcher = new FakeMatcher();
  const session = await matcher.initialSearch(
    scan.photos.map((photo) => ({ ...photo, chosenOriginal: candidate })),
    scan,
    { sourceDirectory: "/photos", includeRaw: true, includeSidecars: true, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency: 1 },
    new AbortController().signal,
  );
  const decisions = ["accept", "accept-all-in-folder", "manual-pick", "accept-missing", "deselect"] as const;
  for (const decision of decisions) {
    const common = { photoId: "p1" };
    let input;
    switch (decision) {
      case "accept": { input = { ...common, decision, path: "/photos/a.nef" }; break; }
      case "accept-all-in-folder": { input = { ...common, decision, directory: "/photos" }; break; }
      case "manual-pick": { input = { ...common, decision, candidate: await matcher.inspectFile("/photos/a.nef", new AbortController().signal) }; break; }
      default: { input = { ...common, decision }; }
    }
    const next = matcher.applyDecision(session, input);
    expect(next.photos[0]?.selected).toBe(decision !== "deselect");
    if (decision === "accept-missing")
      expect(next.photos[0]?.rawMatch.state).toBe("missing");
    else if (
      ["accept", "accept-all-in-folder", "manual-pick"].includes(decision)
    )
      expect(next.photos[0]?.rawMatch.state).toBe("accepted");
    if (decision === "manual-pick")
      expect(next.photos[0]?.rawMatch.chosen?.path).toBe("/photos/a.nef");
  }
});

it("reads the streamed STORE ZIP64 archive and proves entry bytes", async () => {
  const chunks: Buffer[] = [];
  let outputBytes = 0;
  let sourceChunksPulled = 0;
  let sourceSawOutput = false;
  const destination = new PassThrough();
  destination.on("data", (chunk: Buffer) => {
    chunks.push(Buffer.from(chunk));
    outputBytes += chunk.byteLength;
  });
  const writer = new ZipWriter(
    Writable.toWeb(destination) as WritableStream<Uint8Array>,
    { zip64: true },
  );
  const content = new TextEncoder().encode("stream proof content");
  const sourceChunks = [
    content.slice(0, 7),
    content.slice(7, 14),
    content.slice(14),
  ];
  const source = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sourceChunksPulled > 0 && outputBytes > 0) sourceSawOutput = true;
      const next = sourceChunks[sourceChunksPulled];
      if (next) {
        controller.enqueue(next);
        sourceChunksPulled++;
      } else {
        controller.close();
      }
    },
  });
  await writer.add("payload.bin", source, {
    compressionMethod: 0,
    zip64: true,
  });
  await writer.close();
  const archive = Buffer.concat(chunks);
  const endSignature = Buffer.from([80, 75, 6, 6]);
  expect(archive.includes(endSignature)).toBe(true);
  expect(sourceChunksPulled).toBeGreaterThan(1);
  expect(sourceSawOutput).toBe(true);

  const reader = new ZipReader(new Uint8ArrayReader(archive));
  const entries = await reader.getEntries();
  const entry = entries.find(
    (item) => item.filename === "payload.bin" && "getData" in item,
  );
  expect(entry).toBeDefined();
  expect(entry?.compressionMethod).toBe(0);
  const unzipped = await (entry as FileEntry).getData(new Uint8ArrayWriter());
  expect(createHash("sha256").update(unzipped).digest("hex")).toBe(
    createHash("sha256").update(content).digest("hex"),
  );
  await reader.close();
});
