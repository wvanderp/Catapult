import type {
  AttachmentCandidate, ExpansionResult, MatchDecisionInput, MatchSession,
  Matcher, PackageEstimate, PackagePlan, PackageSummary, PackageOptions,
  PhotoGroup, PhotoWithOriginal, PreviewGenerator, PreviewResult,
  PreviewSession, ProgressEvent, ResolvedPhotoMatches, Scanner, ScanResult, ZipWriter,
} from "../src/types.js";

/** Deterministic scanner fake backed by supplied scan results. */
export class FakeScanner implements Scanner {
  private readonly result: ScanResult;
  public constructor(result: ScanResult) { this.result = result; }
  public async scan(sourceDirectory: string, signal: AbortSignal, onProgress?: (event: ProgressEvent) => void): Promise<ScanResult> {
    void sourceDirectory; void signal; void onProgress;
    return this.result;
  }
}

/** Matcher fake with pure decisions and session-owned expansion state. */
export class FakeMatcher implements Matcher {
  public async initialSearch(photos: PhotoWithOriginal[], scan: ScanResult, options: PackageOptions, signal: AbortSignal, onProgress?: (event: ProgressEvent) => void): Promise<MatchSession> {
    void signal; void onProgress;
    return {
      photos: photos.map((photo) => {
        const original = photo.chosenOriginal;
        const raw = { ...original, filename: original.filename.replace(/\.[^.]+$/u, ".nef"), path: original.path.replace(/\.[^.]+$/u, ".nef"), role: "raw" as const };
        return { ...photo, sidecarMatches: [], rawMatch: {
          state: options.includeRaw ? "ambiguous" : "disabled",
          candidates: options.includeRaw ? [raw] : [], chosen: null, decision: null,
          matchedBy: options.includeRaw ? null : "disabled",
        } };
      }),
      visitedDirectories: new Set([scan.sourceDirectory]), searchRoot: scan.sourceDirectory,
      reachedFilesystemRoot: false, warnings: [],
    };
  }
  public async inspectFile(path: string, signal: AbortSignal) {
    void signal;
    const filename = path.split("/").at(-1) ?? path;
    return { path, filename, extension: filename.includes(".") ? `.${filename.split(".").at(-1)}` : "", snapshot: { size: 0, mtimeMs: 0 }, createdAt: null, modifiedAt: new Date(0), discoveredAt: new Date(0) };
  }
  public async expandParents(session: MatchSession, photoIds: string[], signal: AbortSignal, onProgress?: (event: ProgressEvent) => void): Promise<ExpansionResult> {
    void photoIds; void signal; void onProgress;
    return { session, newlyVisitedDirectories: [], searchRoot: session.searchRoot, reachedFilesystemRoot: session.reachedFilesystemRoot };
  }
  public applyDecision(session: MatchSession, input: MatchDecisionInput): MatchSession {
    const photos = session.photos.map((photo): PhotoGroup => {
      if (photo.id !== input.photoId) return photo;
      if (input.decision === "deselect") return { ...photo, selected: false };
      if (input.decision === "manual-pick") return { ...photo, rawMatch: { ...photo.rawMatch, state: "accepted", chosen: { ...input.candidate, role: "raw" }, decision: input.decision, matchedBy: "user" } };
      if (input.decision === "accept-missing") return { ...photo, rawMatch: { ...photo.rawMatch, state: "missing", chosen: null, decision: input.decision, matchedBy: "missing" } };
      const chosen = input.decision === "accept"
        ? photo.rawMatch.candidates.find((file) => file.path === input.path) ?? null
        : photo.rawMatch.candidates[0] ?? null;
      return { ...photo, rawMatch: { ...photo.rawMatch, state: "accepted", chosen, decision: input.decision, matchedBy: "exact-basename-mtime" } };
    });
    return { ...session, photos };
  }
  public async collectSidecars(photo: ResolvedPhotoMatches, signal: AbortSignal): Promise<AttachmentCandidate[]> { void photo; void signal; return []; }
}

/** Preview fake whose retry updates its existing result collection. */
export class FakePreviewGenerator implements PreviewGenerator {
  private readonly result: PreviewResult;
  public readonly workingDirectory = "/tmp/catapult-fake-previews";
  public constructor(result: PreviewResult) { this.result = result; }
  private createSession(results: PreviewResult[]): PreviewSession {
    return {
      results,
      retry: async (photoId, signal) => {
        void signal;
        const result = { ...this.result, photoId } as PreviewResult;
        const index = results.findIndex((item) => item.photoId === photoId);
        if (index !== -1) results[index] = result;
        return result;
      },
      dispose: async () => {},
    };
  }
  public async generateSession(photos: PhotoGroup[], options: PackageOptions, signal: AbortSignal, onPhoto: (result: PreviewResult) => void): Promise<PreviewSession> {
    void options; void signal;
    const results = photos.map((photo) => { const result = { ...this.result, photoId: photo.id } as PreviewResult; onPhoto(result); return result; });
    return this.createSession(results);
  }
}

/** ZIP fake with a configurable summary. */
export class FakeZipWriter implements ZipWriter {
  private readonly summary: PackageSummary;
  public constructor(summary: PackageSummary) { this.summary = summary; }
  public estimate(plan: PackagePlan): PackageEstimate { void plan; return { estimatedBytes: this.summary.estimatedBytes, sourceBytes: this.summary.sourceBytes, photoCount: this.summary.photoCount, attachmentCount: this.summary.attachmentCount, warnings: [...this.summary.warnings] }; }
  public async write(plan: PackagePlan, signal: AbortSignal): Promise<PackageSummary> { void plan; void signal; return this.summary; }
}
