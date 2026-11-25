import type {
  PackageManifest,
  PhotoMetadata,
  RawMatchMethod,
} from "@catapult/package-format";

/** Supported original image formats. */
export type ImageFormat = "jpeg" | "tiff";
/** Package attachment roles. */
export type AttachmentRole = "raw" | "sidecar";
/** Current state of a RAW match. */
export type MatchState =
  "accepted" | "ambiguous" | "suspicious" | "missing" | "disabled";
/** User decisions available during RAW resolution. */
export type MatchDecision =
  | "accept"
  | "accept-all-in-folder"
  | "manual-pick"
  | "accept-missing"
  | "deselect";
/** Filesystem identity and change-detection data captured during scan. */
export interface FileSnapshot {
  size: number;
  mtimeMs: number;
  dev?: number;
  ino?: number;
}
/** File discovered during scan, with its complete path and change-detection snapshot. */
export interface FileCandidate {
  path: string;
  filename: string;
  extension: string;
  snapshot: FileSnapshot;
  createdAt: Date | null;
  modifiedAt: Date;
  discoveredAt: Date;
}
/** Complete scanner output. */
export interface ScanResult {
  sourceDirectory: string;
  visitedDirectories: string[];
  photos: ScannedPhoto[];
  warnings: string[];
}
/** Candidate grouping produced by the scanner. */
export interface ScannedPhoto {
  id: string;
  jpegCandidates: FileCandidate[];
  tiffCandidates: FileCandidate[];
  selected: boolean;
  suggestedOriginal: FileCandidate | null;
}
/** Scanned photo with its chosen original, passed to RAW matching. */
export type PhotoWithOriginal = ScannedPhoto & { chosenOriginal: FileCandidate };
/** Photo grouping plus original and match choices maintained as separate state. */
export interface PhotoGroup extends ScannedPhoto {
  chosenOriginal: FileCandidate;
  rawMatch: AttachmentMatch;
  sidecarMatches: AttachmentCandidate[];
}
/** Candidate file that may be included as a package attachment. */
export interface AttachmentCandidate extends FileCandidate {
  role: AttachmentRole;
  sha256?: string;
  entryPath?: string;
}
/** RAW candidate set and current resolution. */
export interface AttachmentMatch {
  state: MatchState;
  candidates: AttachmentCandidate[];
  chosen: AttachmentCandidate | null;
  decision: MatchDecision | null;
  matchedBy: RawMatchMethod | null;
  reason?: string;
}
/** User decision applied to a photo match. */
export type MatchDecisionInput =
  | { photoId: string; decision: "accept"; path: string }
  | { photoId: string; decision: "accept-all-in-folder"; directory: string }
  | { photoId: string; decision: "manual-pick"; candidate: FileCandidate }
  | { photoId: string; decision: "accept-missing" | "deselect" };
/** Matcher state, including directories already searched. */
export interface MatchSession {
  photos: PhotoGroup[];
  visitedDirectories: Set<string>;
  searchRoot: string;
  reachedFilesystemRoot: boolean;
  warnings: string[];
}
/** Parent-search result, including the complete visited set for the next expansion. */
export interface ExpansionResult {
  session: MatchSession;
  newlyVisitedDirectories: string[];
  searchRoot: string;
  reachedFilesystemRoot: boolean;
}
/** Validated run options shared by pipeline stages. */
export interface PackageOptions {
  sourceDirectory: string;
  includeRaw: boolean;
  includeSidecars: boolean;
  thumbnailMaxEdge: 320;
  workingMaxEdge: 1280;
  concurrency: number;
}
/** One temporary preview image and its content metadata. */
export interface PreviewArtifact {
  kind: "thumbnail" | "working";
  path: string;
  width: number;
  height: number;
  sha256: string;
  size: number;
  format: "jpeg";
}
/** Structured preview-generation failure. */
export interface PreviewFailure {
  photoId: string;
  sourcePath: string;
  stage: "decode" | "thumbnail" | "working";
  message: string;
  retryable: boolean;
}
/** Success or failure returned for one photo preview. */
export type PreviewResult =
  | {
      ok: true;
      photoId: string;
      artifacts: [PreviewArtifact, PreviewArtifact];
      pageCount: number;
      multiPage: boolean;
      steps: Array<{
        tool: string;
        version: string;
        step: string;
        settings: Record<string, unknown>;
        result: Record<string, unknown>;
        warnings: string[];
      }>;
      warnings: string[];
    }
  | {
      ok: false;
      photoId: string;
      failure: PreviewFailure;
      pageCount?: number;
      multiPage?: boolean;
      steps?: PreviewResultSuccess["steps"];
      warnings: string[];
    };
type PreviewResultSuccess = Extract<PreviewResult, { ok: true }>;
/** Typed error raised when preview generation or a retry is cancelled. */
export class PreviewCancellationError extends Error {
  public readonly code = "cancelled";
  public constructor() {
    super("Preview generation was cancelled");
    this.name = "PreviewCancellationError";
  }
}
/** Progress notifications emitted by long-running package stages. */
export type ProgressEvent =
  | {
      stage: "scan" | "match" | "preview" | "hash" | "zip";
      completed: number;
      total: number;
      message: string;
      photoId?: string;
    }
  | { stage: "warning"; message: string; photoId?: string }
  | { stage: "cancelled"; message: string };
/** Selected original and generated previews for one photo. */
export interface SelectedPhotoPlan {
  photo: PhotoGroup;
  chosenOriginal: FileCandidate;
  preview: PreviewResultSuccess;
  raw: AttachmentCandidate[];
  sidecars: AttachmentCandidate[];
}
/** Deduplicated attachment and all photos that reference it. */
export interface ResolvedAttachment {
  candidate: AttachmentCandidate;
  photoIds: string[];
  role: AttachmentRole;
}
/** Fully resolved input to the package writer. */
export interface PackagePlan {
  photos: SelectedPhotoPlan[];
  outputPath: string;
  options: PackageOptions;
  versions: {
    generatorName: string;
    generatorVersion: string;
    sharpVersion: string;
    zipVersion: string;
  };
}
/** Estimated package output size and counts. */
export interface PackageEstimate {
  estimatedBytes: number;
  sourceBytes: number;
  photoCount: number;
  attachmentCount: number;
  warnings: string[];
}
/** Completed package write summary. */
export interface PackageSummary extends PackageEstimate {
  outputPath: string;
  manifest: PackageManifest;
  metadataByPhotoId: Record<string, PhotoMetadata>;
}
/** Stable error categories raised while writing a package. */
export type PackageWriteErrorCode =
  "output-exists" | "source-changed" | "cancelled" | "disk-failure";
/** Typed failure raised by package planning or writing. */
export class PackageWriteError extends Error {
  public readonly code: PackageWriteErrorCode;
  public constructor(
    code: PackageWriteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PackageWriteError";
    this.code = code;
  }
}
/** Source-directory scanner contract. */
export interface Scanner {
  scan(sourceDirectory: string, signal: AbortSignal, onProgress?: (event: ProgressEvent) => void): Promise<ScanResult>;
}
/** RAW and sidecar matcher contract. */
export interface Matcher {
  initialSearch(
    photos: PhotoWithOriginal[],
    scan: ScanResult,
    options: PackageOptions,
    signal: AbortSignal,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<MatchSession>;
  inspectFile(path: string, signal: AbortSignal): Promise<FileCandidate>;
  /** Expand parent directories absent from the session's visited set. */
  expandParents(
    session: MatchSession,
    photoIds: string[],
    signal: AbortSignal,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<ExpansionResult>;
  applyDecision(session: MatchSession, input: MatchDecisionInput): MatchSession;
  /** Collect adjacent files from the post-resolution original and chosen RAW matches. */
  collectSidecars(
    photo: ResolvedPhotoMatches,
    signal: AbortSignal,
  ): Promise<AttachmentCandidate[]>;
}
/** Files selected after the user resolves the original and RAW match. */
export interface ResolvedPhotoMatches {
  chosenOriginal: FileCandidate;
  rawMatches: AttachmentCandidate[];
}
/** A preview session owns temporary artifacts until explicitly disposed. */
export interface PreviewSession {
  readonly results: PreviewResult[];
  retry(photoId: string, signal: AbortSignal): Promise<PreviewResult>;
  /** Remove all temporary artifacts owned by this session. */
  dispose(): Promise<void>;
}
/** Preview generator and disposable-session contract. */
export interface PreviewGenerator {
  readonly workingDirectory: string;
  /** Generate artifacts with ownership represented by a disposable session. */
  generateSession(
    photos: PhotoGroup[],
    options: PackageOptions,
    signal: AbortSignal,
    onPhoto: (result: PreviewResult) => void,
  ): Promise<PreviewSession>;
}
/** ZIP estimate and streaming write contract. */
export interface ZipWriter {
  estimate(plan: PackagePlan): PackageEstimate;
  write(
    plan: PackagePlan,
    signal: AbortSignal,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<PackageSummary>;
}
/** Services consumed by the TUI; contract-compatible in-memory fakes live in test/fakes.ts. */
export interface PipelineServices {
  scanner: Scanner;
  matcher: Matcher;
  preview: PreviewGenerator;
  zip: ZipWriter;
}
