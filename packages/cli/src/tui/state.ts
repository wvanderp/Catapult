import type { FileCandidate, MatchSession, PackageOptions, PreviewResult, ScanResult, ScannedPhoto } from "../types.js";

/** TUI photo selection can be undecided before RAW matching starts. */
export type TuiPhoto = Omit<ScannedPhoto, "chosenOriginal"> & { chosenOriginal: FileCandidate | null; originalDecision?: boolean };

/** Ordered screens in the companion packaging flow. */
export type Step = "folder" | "options" | "photos" | "raw" | "preview" | "summary" | "output" | "writing" | "done" | "error";
/** State of the current ZIP size estimate. */
export type EstimateState = { status: "pending" } | { status: "ready"; bytes: number } | { status: "failed"; message: string };
/** Complete immutable UI state; async resources are held by the controller. */
export interface TuiState {
  step: Step;
  folder: string;
  options: PackageOptions | null;
  scan: ScanResult | null;
  photos: TuiPhoto[];
  matches: MatchSession | null;
  previews: PreviewResult[];
  outputPath: string;
  estimate: EstimateState;
  progress: string;
  error: string;
  errorReturnStep: Step;
  cursor: number;
  filter: string;
  confirm: "cancel" | "parent" | "missing-all" | null;
}
/** Events accepted by the pure reducer. */
export type TuiAction =
  | { type: "folder"; folder: string }
  | { type: "stage"; step: Step }
  | { type: "scan-done"; scan: ScanResult }
  | { type: "matches-done"; matches: MatchSession; step?: Step; cursor?: number }
  | { type: "photos"; photos: TuiPhoto[] }
  | { type: "invalidate" }
  | { type: "previews-done"; previews: PreviewResult[] }
  | { type: "preview-deselect"; photoId: string }
  | { type: "progress"; progress: string }
  | { type: "output"; outputPath: string }
  | { type: "estimate"; estimate: EstimateState }
  | { type: "error"; error: string }
  | { type: "cursor"; cursor: number }
  | { type: "filter"; filter: string }
  | { type: "confirm"; confirm: TuiState["confirm"] };

/**
 * Create a clean state, optionally seeded by a positional source folder.
 *
 * @param folder Optional source folder supplied at launch.
 * @returns A clean initial state for the TUI reducer.
 */
export function initialState(folder = ""): TuiState {
  return { step: "folder", folder, options: null, scan: null, photos: [], matches: null, previews: [], outputPath: "", estimate: { status: "pending" }, progress: "", error: "", errorReturnStep: "folder", cursor: 0, filter: "", confirm: null };
}

/**
 * Apply one state transition and invalidate downstream results when inputs change.
 *
 * @param state Current immutable TUI state.
 * @param action Event describing one user or pipeline transition.
 * @returns The next immutable TUI state.
 */
export function reduceTuiState(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case "folder": { return { ...initialState(action.folder), step: state.step === "folder" ? "folder" : "options" };
    }
    case "stage": { return { ...state, step: action.step, error: "", progress: action.step === "done" ? state.progress : "", confirm: null };
    }
    case "scan-done": { return { ...state, scan: action.scan, photos: [], matches: null, previews: [], step: "options", progress: "" };
    }
    case "matches-done": { return { ...state, matches: action.matches, photos: action.matches.photos, previews: [], step: action.step ?? "raw", cursor: action.cursor ?? 0 };
    }
    case "photos": { return { ...state, photos: action.photos, matches: null, previews: [], cursor: 0 };
    }
    case "invalidate": { return { ...state, matches: null, previews: [], estimate: { status: "pending" } };
    }
    case "previews-done": { return { ...state, previews: action.previews };
    }
    case "preview-deselect": {
      const photos = state.photos.map((photo) => photo.id === action.photoId ? { ...photo, selected: false } : photo);
      const matches = state.matches ? { ...state.matches, photos: state.matches.photos.map((photo) => photo.id === action.photoId ? { ...photo, selected: false } : photo) } : null;
      return { ...state, photos, matches, previews: state.previews.filter((result) => result.photoId !== action.photoId) };
    }
    case "progress": { return { ...state, progress: action.progress };
    }
    case "output": { return { ...state, outputPath: action.outputPath, step: "output", error: "", progress: "" };
    }
    case "estimate": { return { ...state, estimate: action.estimate };
    }
    case "error": { return { ...state, step: "error", error: action.error, errorReturnStep: state.step };
    }
    case "cursor": {
      const count = state.step === "photos"
        ? state.photos.filter((photo) => (photo.chosenOriginal?.filename ?? photo.suggestedOriginal?.filename ?? "").toLowerCase().includes(state.filter.toLowerCase())).length
        : (state.step === "raw" ? state.matches?.photos.filter((photo) => photo.selected).length ?? 0 : state.previews.length);
      return { ...state, cursor: Math.max(0, Math.min(Math.max(0, count - 1), action.cursor)) };
    }
    case "filter": { return { ...state, filter: action.filter, cursor: 0 };
    }
    case "confirm": { return { ...state, confirm: action.confirm };
    }
  }
}

