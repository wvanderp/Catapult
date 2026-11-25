import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { PackageWriteError, type PipelineServices, type ProgressEvent, type ScanResult, type PackageSummary, type PreviewResult } from "../../src/types.js";
import { fitTerminalText, TuiApp, safeText } from "../../src/tui/app.js";
import { FakeMatcher, FakePreviewGenerator, FakeScanner, FakeZipWriter } from "../fakes.js";

const date = new Date("2026-01-01T00:00:00.000Z");
const file = { path: "/source/A.jpg", filename: "A.jpg", extension: ".jpg", snapshot: { size: 123, mtimeMs: date.valueOf() }, createdAt: null, modifiedAt: date, discoveredAt: date };
const scan: ScanResult = { sourceDirectory: "/source", visitedDirectories: ["/source"], photos: [{ id: "p1", jpegCandidates: [file], tiffCandidates: [], selected: true, suggestedOriginal: file }], warnings: [] };
const preview: PreviewResult = { ok: true, photoId: "p1", artifacts: [{ kind: "thumbnail", path: "/tmp/t.jpg", width: 1, height: 1, sha256: "a".repeat(64), size: 1, format: "jpeg" }, { kind: "working", path: "/tmp/w.jpg", width: 1, height: 1, sha256: "b".repeat(64), size: 1, format: "jpeg" }], pageCount: 1, multiPage: false, steps: [], warnings: [] };
const summary: PackageSummary = { estimatedBytes: 2, sourceBytes: 1, photoCount: 1, attachmentCount: 0, warnings: [], outputPath: "/out.zip", manifest: {} as PackageSummary["manifest"], metadataByPhotoId: {} };

/**
 * Wait until Ink has rendered an observable result instead of assuming a timer duration.
 *
 * @param app Rendered Ink app.
 * @param needle Visible text to await.
 * @param timeout Maximum wait in milliseconds.
 */
async function waitForFrame(app: ReturnType<typeof render>, needle: string, timeout = 60_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(app.lastFrame() ?? "").includes(needle) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(app.lastFrame() ?? "").toContain(needle);
}

/**
 * Wait until an observable condition becomes true.
 *
 * @param condition Observable condition to await.
 * @param timeout Maximum wait in milliseconds.
 */
async function waitForCondition(condition: () => boolean, timeout = 60_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(condition()).toBe(true);
}

/**
 * Make injected fakes for interactive flow tests.
 *
 * @returns Complete in-memory pipeline services.
 */
function fakeServices(): PipelineServices {
  return { scanner: new FakeScanner(scan), matcher: new FakeMatcher(), preview: new FakePreviewGenerator(preview), zip: new FakeZipWriter(summary) };
}

describe("Ink companion TUI", () => {
  it("keeps the summary usable when ZIP estimation throws", async () => {
    const services = fakeServices();
    services.zip = { estimate: () => { throw new Error("estimate failed"); }, write: async () => summary };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r"); await press("\r"); await press("\r"); await press("a"); await press("\r");
    await waitForFrame(app, "Estimate unavailable: estimate failed");
    expect(app.lastFrame()).toContain("Estimate unavailable: estimate failed");
    expect(app.lastFrame()).toContain("Enter to choose output path.");
    app.unmount();
  });

  it("ignores a late estimate after Back and recomputes with changed options", async () => {
    const services = fakeServices();
    let resolveFirst: ((value: { estimatedBytes: number; sourceBytes: number; photoCount: number; attachmentCount: number; warnings: string[] }) => void) | undefined;
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
    const estimate = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockImplementation(() => ({ estimatedBytes: 7, sourceBytes: 1, photoCount: 1, attachmentCount: 0, warnings: [] }));
    services.zip = { estimate, write: async () => summary } as unknown as PipelineServices["zip"];
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    const back = async (): Promise<void> => { app.stdin.write("\u{1B}"); await new Promise((resolve) => setTimeout(resolve, 120)); };
    await press("\r"); await press("\r"); await press("\r"); await press("a"); await press("\r");
    await waitForFrame(app, "SUMMARY");
    await waitForCondition(() => estimate.mock.calls.length === 1);
    await back(); await waitForFrame(app, "PREVIEW");
    await back(); await waitForFrame(app, "RAW");
    await back(); await waitForFrame(app, "PHOTOS");
    await back(); await waitForFrame(app, "OPTIONS");
    await press("1"); await press("\r"); await waitForFrame(app, "PHOTOS");
    await press("\r"); await waitForFrame(app, "SUMMARY");
    await waitForCondition(() => estimate.mock.calls.length === 2);
    await waitForFrame(app, "Estimated output: 7 B");
    expect(estimate).toHaveBeenCalledTimes(2);
    expect(estimate.mock.calls[1]![0].options.includeRaw).toBe(false);
    resolveFirst?.({ estimatedBytes: 999, sourceBytes: 1, photoCount: 1, attachmentCount: 0, warnings: [] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(app.lastFrame()).toContain("Estimated output: 7 B");
    app.unmount();
  });

  it("clips sanitized text by terminal display columns", () => {
    expect(fitTerminalText("ab界cd", 4)).toBe("ab界");
    expect(fitTerminalText("ab\u{202E}cd", 8)).toBe("ab\\u{202");
  });

  it("filters photos, clamps the cursor, and toggles only visible selections", async () => {
    const many: ScanResult = { ...scan, photos: Array.from({ length: 3 }, (_, index) => {
      const candidate = { ...file, path: `/source/${index === 0 ? "jonly" : `photo${index}`}`, filename: index === 0 ? "jonly" : `photo${index}` };
      return { id: `p${index}`, jpegCandidates: [candidate], tiffCandidates: [], selected: true, suggestedOriginal: candidate };
    }) };
    const services = fakeServices();
    services.scanner = { scan: async () => many };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r");
    await waitForFrame(app, "OPTIONS");
    await press("\r");
    await waitForFrame(app, "PHOTOS");
    expect(app.lastFrame()).toContain("3/3 selected");
    await press("/"); await press("j");
    expect(app.lastFrame()).toContain("jonly");
    expect(app.lastFrame()).not.toContain("photo1");
    await press("\r"); await press(" ");
    expect(app.lastFrame()).toContain("2/3 selected");
    await press("/");
    await press("t");
    expect(app.lastFrame()).not.toContain("jonly");
    // eslint-disable-next-line unicorn/prefer-unicode-code-point-escapes
    await press("\u001B");
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(app.lastFrame()).toContain("2/3 selected");
    app.unmount();
  });

  it.each(["scan", "match", "preview"] as const)("waits for %s work to settle before confirmed cancellation disposes", async (stage) => {
    const services = fakeServices();
    let resolveWork: (() => void) | undefined;
    let signal: AbortSignal | undefined;
    const dispose = vi.fn();
    // Promise.withResolvers is not in this package's ES2023 library target.
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
    const pending = (): Promise<void> => new Promise((resolve) => { resolveWork = resolve; });
    switch (stage) {
    case "scan": {
      services.scanner = { scan: async (_folder, receivedSignal) => { signal = receivedSignal; await pending(); return scan; } };
      break;
    }
    case "match": {
      const matcher = new FakeMatcher();
      services.matcher = { ...matcher, initialSearch: async (photos, scanResult, options, receivedSignal) => { signal = receivedSignal; await pending(); return matcher.initialSearch(photos, scanResult, options, receivedSignal); }, inspectFile: matcher.inspectFile.bind(matcher), expandParents: matcher.expandParents.bind(matcher), applyDecision: matcher.applyDecision.bind(matcher), collectSidecars: matcher.collectSidecars.bind(matcher) };
      break;
    }
    case "preview": {
      services.preview = { workingDirectory: "/tmp/fake", generateSession: async (_photos, _options, receivedSignal) => { signal = receivedSignal; await pending(); return { results: [preview], retry: async () => preview, dispose }; } };
      break;
    }
    }
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r");
    if (stage !== "scan") { await press("\r"); await press("\r"); }
    if (stage !== "scan") { await press("a"); await press("\r"); }
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.stdin.write("\u{3}");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.lastFrame()).toContain("Cancel and discard");
    await press("y");
    expect(signal?.aborted).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    resolveWork?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispose).toHaveBeenCalledTimes(stage === "preview" ? 1 : 0);
    app.unmount();
  });

  it("aborts active work on plain unmount and disposes its late session once settled", async () => {
    const services = fakeServices();
    let resolveSession: ((value: Awaited<ReturnType<NonNullable<PipelineServices["preview"]>["generateSession"]>>) => void) | undefined;
    let signal: AbortSignal | undefined;
    const dispose = vi.fn();
    // Promise.withResolvers is not in this package's ES2023 library target.
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
    services.preview = { workingDirectory: "/tmp/fake", generateSession: (_photos, _options, receivedSignal) => { signal = receivedSignal; return new Promise((resolve) => { resolveSession = resolve; }); } };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r"); await press("\r"); await press("\r"); await press("a"); await press("\r");
    app.unmount();
    expect(signal?.aborted).toBe(true);
    resolveSession?.({ results: [preview], retry: async () => preview, dispose });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("backs from completed previews to RAW, disposes once, and creates a fresh session", async () => {
    const services = fakeServices();
    const disposals = [vi.fn(), vi.fn()];
    let sessions = 0;
    services.preview = { workingDirectory: "/tmp/fake", generateSession: async () => { const index = sessions++; return { results: [preview], retry: async () => preview, dispose: disposals[index]! }; } };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r"); await press("\r"); await press("\r"); await press("a"); await press("\r");
    expect(app.lastFrame()).toContain("SUMMARY");
    // Ink needs a lone ESC byte and a delay to distinguish it from a sequence.
    // eslint-disable-next-line unicorn/prefer-unicode-code-point-escapes
    app.stdin.write("\u001B"); await new Promise((resolve) => setTimeout(resolve, 120));
    expect(app.lastFrame()).toContain("PREVIEW");
    // eslint-disable-next-line unicorn/prefer-unicode-code-point-escapes
    app.stdin.write("\u001B"); await new Promise((resolve) => setTimeout(resolve, 120));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.lastFrame()).toContain("RAW");
    expect(disposals[0]).toHaveBeenCalledOnce();
    await press("a"); await press("\r");
    expect(sessions).toBe(2);
    expect(app.lastFrame()).toContain("SUMMARY");
    app.unmount();
  });

  it.each(["scan", "match"] as const)("ignores late %s results and progress after Back", async (stage) => {
    const services = fakeServices();
    let resolveWork: (() => void) | undefined;
    let reportProgress: ((event: ProgressEvent) => void) | undefined;
    // Promise.withResolvers is not in this package's ES2023 library target.
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
    const pending = (): Promise<void> => new Promise((resolve) => { resolveWork = resolve; });
    if (stage === "scan") services.scanner = { scan: async (_folder, _signal, onProgress) => { reportProgress = onProgress; await pending(); return scan; } };
    else if (stage === "match") {
      const matcher = new FakeMatcher();
      services.matcher = { ...matcher, initialSearch: async (photos, scanResult, options, signal, onProgress) => { reportProgress = onProgress; await pending(); return matcher.initialSearch(photos, scanResult, options, signal); }, inspectFile: matcher.inspectFile.bind(matcher), expandParents: matcher.expandParents.bind(matcher), applyDecision: matcher.applyDecision.bind(matcher), collectSidecars: matcher.collectSidecars.bind(matcher) };
    }
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 0)); };
    await press("\r");
    if (stage === "match") { await press("\r"); await press("\r"); await press("a"); await press("\r"); }
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Ink requires a lone ESC byte and a delay to distinguish it from a sequence.
    // eslint-disable-next-line unicorn/prefer-unicode-code-point-escapes
    app.stdin.write("\u001B"); await new Promise((resolve) => setTimeout(resolve, 120));
    const beforeLateEvents = app.lastFrame();
    expect(beforeLateEvents).not.toContain("Cancel and discard");
    expect(beforeLateEvents).toContain(stage === "scan" ? "FOLDER" : "OPTIONS");
    expect(reportProgress).toBeDefined();
    reportProgress?.({ stage: stage === "scan" ? "scan" : "match", completed: 1, total: 2, message: "late progress" });
    resolveWork?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.lastFrame()).toBe(beforeLateEvents);
    app.unmount();
  });

  it("keeps previews after a disk write failure and disposes once after a successful retry", async () => {
    const services = fakeServices();
    const dispose = vi.fn();
    const originalPreview = services.preview;
    services.preview = {
      workingDirectory: originalPreview.workingDirectory,
      generateSession: async (...arguments_) => {
        const session = await originalPreview.generateSession(...arguments_);
        return { ...session, dispose: async () => { dispose(); await session.dispose(); } };
      },
    };
    let writes = 0;
    services.zip = {
      estimate: (plan) => new FakeZipWriter(summary).estimate(plan),
      write: async (plan) => {
        writes += 1;
        if (writes === 1) throw new Error("disk-failure");
        return { ...summary, outputPath: plan.outputPath };
      },
    };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r"); await press("\r"); await press("\r"); await press("a"); await press("\r");
    await press("\r"); await press("\r");
    expect(app.lastFrame()).toContain("disk-failure");
    expect(app.lastFrame()).toContain("Output path");
    expect(dispose).not.toHaveBeenCalled();
    for (let index = 0; index < "/source.catapult.zip".length; index += 1) await press("\u{7F}");
    for (const character of "/retry.zip") await press(character);
    expect(app.lastFrame()).toContain("/retry.zip");
    await press("\r");
    expect(app.lastFrame()).toContain("Created /retry.zip");
    expect(dispose).toHaveBeenCalledOnce();
    app.unmount();
  });

  it("returns to the output editor when the destination already exists", async () => {
    const services = fakeServices();
    services.zip = {
      estimate: (plan) => new FakeZipWriter(summary).estimate(plan),
      write: async () => { throw new PackageWriteError("output-exists", "The output file already exists."); },
    };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 0)); };
    await press("\r"); await press("\r"); await press("\r"); await press("a"); await press("\r");
    await press("\r"); await press("\r");
    expect(app.lastFrame()).toContain("OUTPUT");
    expect(app.lastFrame()).toContain("The output file already exists.");
    app.unmount();
  });

  it("defaults beside the source, edits at the cursor, and rejects output inside the source", async () => {
    const app = render(<TuiApp services={fakeServices()} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 0)); };
    await press("\r"); await press("\r"); await press("\r"); await press("a"); await press("\r"); await press("\r");
    expect(app.lastFrame()).toContain("/source.catapult.zip");
    await press("\u{1B}[D"); await press("X");
    expect(app.lastFrame()).toContain("/source.catapult.ziX");
    expect(app.lastFrame()).toContain("p");
    for (let index = 0; index < "/source.catapult.ziXp".length; index += 1) await press("\u{7F}");
    for (const character of "/source/inside.zip") await press(character);
    await press("\r");
    expect(app.lastFrame()).toContain("Choose an output path outside the source folder.");
    expect(app.lastFrame()).toContain("OUTPUT");
    app.unmount();
  });

  it("uses the home directory when the source itself is a filesystem root", async () => {
    const rootScan = { ...scan, sourceDirectory: "/", visitedDirectories: ["/"] };
    const scanner = { scan: async () => rootScan };
    const rootServices = { ...fakeServices(), scanner } as PipelineServices;
    const rootApp = render(<TuiApp services={rootServices} initialFolder="/" onExit={() => {}} />);
    const pressRoot = async (input: string): Promise<void> => { rootApp.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 0)); };
    await pressRoot("\r"); await pressRoot("\r"); await pressRoot("\r"); await pressRoot("a"); await pressRoot("\r"); await pressRoot("\r");
    expect(rootApp.lastFrame()).toContain(`${process.env.HOME}/photos.catapult.zip`);
    rootApp.unmount();
  });

  it("aborts a confirmed write and disposes only after the write settles", async () => {
    const services = fakeServices();
    const previewGenerator = services.preview;
    const dispose = vi.fn();
    services.preview = {
      workingDirectory: previewGenerator.workingDirectory,
      generateSession: async (...arguments_) => {
        const session = await previewGenerator.generateSession(...arguments_);
        return { ...session, dispose: async () => { dispose(); await session.dispose(); } };
      },
    };
    let resolveWrite: ((value: PackageSummary) => void) | undefined;
    let writeSignal: AbortSignal | undefined;
    services.zip = {
      estimate: (plan) => new FakeZipWriter(summary).estimate(plan),
      write: (_plan, signal) => {
        writeSignal = signal;
        // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
        return new Promise<PackageSummary>((resolve) => { resolveWrite = resolve; });
      },
    };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 0)); };
    await press("\r"); await press("\r"); await press("\r"); await press("a"); await press("\r");
    await press("\r"); await press("\r");
    await new Promise((resolve) => setTimeout(resolve, 10));
    // Ink needs a lone ESC byte so it can distinguish the key from escape sequences.
    // eslint-disable-next-line unicorn/prefer-unicode-code-point-escapes
    app.stdin.write("\u001B");
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(app.lastFrame()).toContain("Cancel and discard");
    app.stdin.write("y");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writeSignal?.aborted).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    resolveWrite?.(summary);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispose).toHaveBeenCalledOnce();
    app.unmount();
  });

  it("disposes a preview session returned after cancellation", async () => {
    const services = fakeServices();
    let resolveSession: ((value: Awaited<ReturnType<NonNullable<PipelineServices["preview"]>["generateSession"]>>) => void) | undefined;
    let signal: AbortSignal | undefined;
    const dispose = vi.fn();
    services.preview = {
      workingDirectory: "/tmp/fake",
      generateSession: (_photos, _options, receivedSignal) => {
        signal = receivedSignal;
        // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
        return new Promise((resolve) => { resolveSession = resolve; });
      },
    };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 0)); };
    await press("\r"); await press("\r"); await press("\r"); await press("a"); await press("\r");
    await press("\r");
    app.stdin.write("\u{3}"); await new Promise((resolve) => setTimeout(resolve, 0)); app.stdin.write("y");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signal?.aborted).toBe(true);
    resolveSession?.({ results: [preview], retry: async () => preview, dispose });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispose).toHaveBeenCalledOnce();
    app.unmount();
  });

  it("drives folder entry through options and the scrollable photo selector", async () => {
    const app = render(<TuiApp services={fakeServices()} initialFolder="/source" onExit={() => {}} />);
    expect(app.lastFrame()).toContain("FOLDER");
    app.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.lastFrame()).toContain("OPTIONS");
    app.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.lastFrame()).toContain("PHOTOS");
    expect(app.lastFrame()).toContain("A.jpg");
    app.unmount();
  });

  it("cycles JPEG and TIFF originals and requires an explicit choice when several exist", async () => {
    const alternatives = [
      { ...file, path: "/source/A.jpeg", filename: "A.jpeg", extension: ".jpeg" },
      { ...file, path: "/source/A.tif", filename: "A.tif", extension: ".tif" },
    ];
    const candidateScan: ScanResult = { ...scan, photos: [{ ...scan.photos[0]!, jpegCandidates: [file, alternatives[0]!], tiffCandidates: [alternatives[1]!], suggestedOriginal: file }] };
    const services = fakeServices();
    services.scanner = { scan: async () => candidateScan };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 0)); };
    await press("\r"); await press("\r"); await press("\r");
    expect(app.lastFrame()).toContain("(choose original)");
    await press("\r");
    expect(app.lastFrame()).toContain("Choose the original file");
    expect(app.lastFrame()).toContain("PHOTOS");
    await press("j");
    expect(app.lastFrame()).toContain("A.jpg");
    await press("j");
    expect(app.lastFrame()).toContain("A.jpeg");
    await press("t");
    expect(app.lastFrame()).toContain("A.tif");
    await press("j");
    expect(app.lastFrame()).toContain("A.jpg");
    await press("\r");
    expect(app.lastFrame()).toContain("RAW");
    app.unmount();
  });

  it("moves among RAW candidates and shows paths, metadata, and modification-time differences", async () => {
    const services = fakeServices();
    const matcher = new FakeMatcher();
    let acceptedPath = "";
    services.matcher = {
      initialSearch: async (...arguments_) => {
        const session = await matcher.initialSearch(...arguments_);
        const photo = session.photos[0]!;
        const originalCandidate = photo.rawMatch.candidates[0]!;
        const later = { ...originalCandidate, path: "/source/alternate.nef", filename: "alternate.nef", snapshot: { size: 456, mtimeMs: date.valueOf() }, modifiedAt: new Date(date.valueOf() + 7_200_000) };
        return { ...session, photos: [{ ...photo, rawMatch: { ...photo.rawMatch, candidates: [originalCandidate, later] } }] };
      },
      inspectFile: matcher.inspectFile.bind(matcher),
      expandParents: matcher.expandParents.bind(matcher),
      applyDecision: (session, decision) => { if (decision.decision === "accept") acceptedPath = decision.path; return matcher.applyDecision(session, decision); },
      collectSidecars: matcher.collectSidecars.bind(matcher),
    };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r"); await press("\r"); await press("\r");
    expect(app.lastFrame()).toContain("Original: /source/A.jpg");
    expect(app.lastFrame()).toContain("/source/A.nef");
    expect(app.lastFrame()).toContain("size: 123 B");
    expect(app.lastFrame()).toContain("RAW modified:");
    await press("\u{1B}[C");
    expect(app.lastFrame()).toContain("RAW modified:");
    expect(app.lastFrame()).toContain("Δ +2h 0m");
    await press("a");
    expect(acceptedPath).toBe("/source/alternate.nef");
    app.unmount();
  });

  it("advances RAW decisions to the next unresolved photo", async () => {
    const secondFile = { ...file, path: "/source/B.jpg", filename: "B.jpg" };
    const twoPhotos: ScanResult = { ...scan, photos: [scan.photos[0]!, { id: "p2", jpegCandidates: [secondFile], tiffCandidates: [], selected: true, suggestedOriginal: secondFile }] };
    const services = fakeServices();
    services.scanner = { scan: async () => twoPhotos };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r"); await press("\r"); await press("\r");
    expect(app.lastFrame()).toContain("› A.jpg");
    await press("a");
    expect(app.lastFrame()).toContain("› B.jpg");
    app.unmount();
  });

  it("confirms bulk acceptance for missing RAWs only", async () => {
    const secondFile = { ...file, path: "/source/B.jpg", filename: "B.jpg" };
    const twoPhotos: ScanResult = { ...scan, photos: [scan.photos[0]!, { id: "p2", jpegCandidates: [secondFile], tiffCandidates: [], selected: true, suggestedOriginal: secondFile }] };
    const services = fakeServices();
    const matcher = new FakeMatcher();
    services.scanner = { scan: async () => twoPhotos };
    services.matcher = {
      initialSearch: async (...arguments_) => {
        const result = await matcher.initialSearch(...arguments_);
        return { ...result, photos: result.photos.map((photo, index) => ({ ...photo, rawMatch: { ...photo.rawMatch, state: index === 0 ? "missing" as const : "suspicious" as const, candidates: [], chosen: null, decision: null } })) };
      },
      inspectFile: matcher.inspectFile.bind(matcher), expandParents: matcher.expandParents.bind(matcher), applyDecision: matcher.applyDecision.bind(matcher), collectSidecars: matcher.collectSidecars.bind(matcher),
    };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r"); await press("\r"); await press("\r");
    await press("X");
    expect(app.lastFrame()).toContain("Accept 1 missing RAWs as missing?");
    await press("y");
    expect(app.lastFrame()).toContain("RAW choices: 1/2 resolved");
    expect(app.lastFrame()).toContain("› B.jpg");
    app.unmount();
  });

  it("skips RAW when collection is disabled, including Back navigation", async () => {
    const app = render(<TuiApp services={fakeServices()} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r"); await press("1"); await press("\r"); await press("\r");
    expect(app.lastFrame()).toContain("SUMMARY");
    // Ink needs a lone ESC byte and a delay to distinguish it from a sequence.
    // eslint-disable-next-line unicorn/prefer-unicode-code-point-escapes
    app.stdin.write("\u001B"); await new Promise((resolve) => setTimeout(resolve, 120));
    expect(app.lastFrame()).toContain("PREVIEW");
    // eslint-disable-next-line unicorn/prefer-unicode-code-point-escapes
    app.stdin.write("\u001B"); await new Promise((resolve) => setTimeout(resolve, 120));
    expect(app.lastFrame()).toContain("PHOTOS");
    app.unmount();
  });

  it("exposes accept-all, manual selection with inline errors, and parent expansion confirmation", async () => {
    const services = fakeServices();
    const matcher = new FakeMatcher();
    const decisions: string[] = [];
    let inspectCount = 0;
    const expanded = vi.fn();
    services.matcher = {
      initialSearch: matcher.initialSearch.bind(matcher),
      inspectFile: async (path, signal) => { inspectCount += 1; if (inspectCount === 1) throw new Error("manual path is invalid"); return matcher.inspectFile(path, signal); },
      expandParents: async (session, photoIds, signal, progress) => { expanded(photoIds); return matcher.expandParents(session, photoIds, signal, progress); },
      applyDecision: (session, decision) => { decisions.push(decision.decision); return matcher.applyDecision(session, decision); },
      collectSidecars: matcher.collectSidecars.bind(matcher),
    };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r"); await press("\r"); await press("\r");
    await press("A");
    expect(decisions).toContain("accept-all-in-folder");
    // Return to an unresolved match for the manual and parent-search controls.
    const secondServices = fakeServices();
    app.unmount();
    const manualMatcher = new FakeMatcher();
    secondServices.matcher = {
      initialSearch: manualMatcher.initialSearch.bind(manualMatcher),
      inspectFile: async (path, signal) => { if (path === "bad") throw new Error("manual path is invalid"); return manualMatcher.inspectFile(path, signal); },
      expandParents: async (session, photoIds, signal, progress) => { expanded(photoIds); return manualMatcher.expandParents(session, photoIds, signal, progress); },
      applyDecision: (session, decision) => { decisions.push(decision.decision); return manualMatcher.applyDecision(session, decision); },
      collectSidecars: manualMatcher.collectSidecars.bind(manualMatcher),
    };
    const manualApp = render(<TuiApp services={secondServices} initialFolder="/source" onExit={() => {}} />);
    const manualPress = async (input: string): Promise<void> => { manualApp.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await manualPress("\r"); await manualPress("\r"); await manualPress("\r");
    await manualPress("m"); await manualPress("bad"); await manualPress("\r");
    expect(manualApp.lastFrame()).toContain("manual path is invalid");
    expect(manualApp.lastFrame()).toContain("Manual RAW file path");
    await manualPress("\u{7F}"); await manualPress("\u{7F}"); await manualPress("\u{7F}");
    for (const character of "/source/manual.nef") await manualPress(character);
    await manualPress("\r");
    expect(decisions).toContain("manual-pick");
    manualApp.unmount();

    const expandApp = render(<TuiApp services={secondServices} initialFolder="/source" onExit={() => {}} />);
    const expandPress = async (input: string): Promise<void> => { expandApp.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await expandPress("\r"); await expandPress("\r"); await expandPress("\r");
    await expandPress("p");
    expect(expandApp.lastFrame()).toContain("Search parent folder /");
    await expandPress("y");
    expect(expanded).toHaveBeenCalledWith(["p1"]);
    expandApp.unmount();
  });

  it("keeps missing RAW unresolved until accepted, and exposes deselect and root-hidden parent controls", async () => {
    const baseMatcher = new FakeMatcher();
    const services = fakeServices();
    const decisions: string[] = [];
    services.matcher = {
      initialSearch: async (...arguments_) => {
        const session = await baseMatcher.initialSearch(...arguments_);
        return { ...session, photos: session.photos.map((photo) => ({ ...photo, rawMatch: { state: "missing" as const, candidates: [], chosen: null, decision: null, matchedBy: null } })) };
      },
      inspectFile: baseMatcher.inspectFile.bind(baseMatcher), expandParents: baseMatcher.expandParents.bind(baseMatcher),
      applyDecision: (session, decision) => { decisions.push(decision.decision); return baseMatcher.applyDecision(session, decision); },
      collectSidecars: baseMatcher.collectSidecars.bind(baseMatcher),
    };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await press("\r"); await press("\r"); await press("\r");
    await press("\r");
    expect(app.lastFrame()).toContain("Resolve each RAW match before continuing.");
    await press("x");
    expect(decisions).toContain("accept-missing");
    await press("\r");
    expect(app.lastFrame()).toContain("SUMMARY");
    app.unmount();

    const rootMatcher = new FakeMatcher();
    const rootServices = fakeServices();
    rootServices.matcher = {
      initialSearch: async (...arguments_) => {
        const session = await rootMatcher.initialSearch(...arguments_);
        return { ...session, reachedFilesystemRoot: true, photos: session.photos.map((photo) => ({ ...photo, rawMatch: { ...photo.rawMatch, state: "suspicious" as const } })) };
      },
      inspectFile: rootMatcher.inspectFile.bind(rootMatcher), expandParents: rootMatcher.expandParents.bind(rootMatcher),
      applyDecision: (session, decision) => { decisions.push(decision.decision); return rootMatcher.applyDecision(session, decision); },
      collectSidecars: rootMatcher.collectSidecars.bind(rootMatcher),
    };
    const rootApp = render(<TuiApp services={rootServices} initialFolder="/source" onExit={() => {}} />);
    const pressRoot = async (input: string): Promise<void> => { rootApp.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await pressRoot("\r"); await pressRoot("\r"); await pressRoot("\r");
    expect(rootApp.lastFrame()).not.toContain("Search parent folder");
    await pressRoot("x");
    expect(decisions).toContain("accept-missing");
    await pressRoot("d");
    await waitForCondition(() => decisions.includes("deselect"));
    rootApp.unmount();
  });

  it("aborts a delayed scan when Escape is confirmed and ignores its late result", async () => {
    let resolveScan: ((value: ScanResult) => void) | undefined;
    let observedSignal: AbortSignal | undefined;
    const services = fakeServices();
    services.scanner = { scan: (_folder, signal) => {
      observedSignal = signal;
      // Promise.withResolvers is not in this package's ES2023 library target.
      // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
      return new Promise<ScanResult>((resolve) => { resolveScan = resolve; });
    } };
    const exit = vi.fn();
    const app = render(<TuiApp services={services} initialFolder="/slow" onExit={exit} />);
    app.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.stdin.write("\u{3}");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.lastFrame()).toContain("Cancel and discard");
    app.stdin.write("y");
    expect(observedSignal?.aborted).toBe(true);
    resolveScan?.(scan);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(exit).toHaveBeenCalledWith(0);
    expect(app.lastFrame()).not.toContain("OPTIONS");
    app.unmount();
  });

  it("drives a selected photo through RAW resolution, preview, summary and ZIP completion", async () => {
    const services = fakeServices();
    const dispose = vi.fn();
    const generator = services.preview;
    services.preview = {
      workingDirectory: generator.workingDirectory,
      generateSession: async (...arguments_) => {
        const session = await generator.generateSession(...arguments_);
        return { ...session, dispose: async () => { dispose(); await session.dispose(); } };
      },
    };
    const exit = vi.fn();
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={exit} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 0)); };
    await press("\r");
    await press("\r");
    await press("\r");
    expect(app.lastFrame()).toContain("RAW");
    await press("a");
    await press("\r");
    expect(app.lastFrame()).toContain("SUMMARY");
    await press("\r");
    expect(app.lastFrame()).toContain("OUTPUT");
    await press("\r");
    await press("\r");
    expect(app.lastFrame()).toContain("Created /out.zip");
    expect(dispose).toHaveBeenCalledOnce();
    await press("\r");
    expect(exit).toHaveBeenCalledWith(0);
    app.unmount();
  });

  it("keeps failed previews inline across a failed retry, retries successfully, and protects the last photo", async () => {
    const services = fakeServices();
    const failure: PreviewResult = { ok: false, photoId: "p1", failure: { photoId: "p1", sourcePath: file.path, stage: "decode", message: "first failure", retryable: true }, steps: [], warnings: [] };
    let retries = 0;
    services.preview = { workingDirectory: "/tmp/fake", generateSession: async (_photos, _options, _signal, onPhoto) => {
      onPhoto(failure);
      const results: PreviewResult[] = [failure];
      return { results, retry: async () => { retries += 1; if (retries === 1) throw new Error("retry failed inline"); results[0] = preview; return preview; }, dispose: async () => {} };
    } };
    const app = render(<TuiApp services={services} initialFolder="/source" onExit={() => {}} />);
    const press = async (input: string): Promise<void> => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 0)); };
    await press("\r"); await press("\r"); await press("\r"); await press("a"); await press("\r");
    expect(app.lastFrame()).toContain("PREVIEW");
    expect(app.lastFrame()).toContain("first failure");
    await press("r");
    await waitForFrame(app, "retry failed inline");
    expect(app.lastFrame()).toContain("retry failed inline");
    expect(app.lastFrame()).toContain("PREVIEW");
    await press("r");
    await waitForFrame(app, "SUMMARY");
    expect(app.lastFrame()).toContain("SUMMARY");
    app.unmount();

    const failing = fakeServices();
    failing.preview = { workingDirectory: "/tmp/fake", generateSession: async (_photos, _options, _signal, onPhoto) => {
      onPhoto(failure);
      return { results: [failure], retry: async () => failure, dispose: async () => {} };
    } };
    const second = render(<TuiApp services={failing} initialFolder="/source" onExit={() => {}} />);
    const pressSecond = async (input: string): Promise<void> => { second.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, 10)); };
    await pressSecond("\r"); await pressSecond("\r"); await pressSecond("\r"); await pressSecond("a"); await pressSecond("\r");
    await pressSecond("d");
    expect(second.lastFrame()).toContain("Keep at least one photo selected.");
    expect(second.lastFrame()).toContain("p1: first failure");
    second.unmount();
  });

  it("escapes control characters before displaying untrusted filenames", () => {
    expect(safeText("photo\u{1B}[31m.jpg")).toBe("photo\\x1b[31m.jpg");
  });
});
