import { describe, expect, it } from "vitest";
import type { ScanResult } from "../../src/types.js";
import { initialState, reduceTuiState } from "../../src/tui/state.js";

const scan: ScanResult = { sourceDirectory: "/source", visitedDirectories: ["/source"], photos: [], warnings: ["warning"] };

describe("TUI reducer", () => {
  it("starts at folder entry with an optional positional folder", () => {
    expect(initialState("C:\\My Photos").folder).toBe("C:\\My Photos");
    expect(initialState().step).toBe("folder");
  });

  it("invalidates every downstream result when the folder changes", () => {
    const state = { ...initialState(), step: "summary" as const, scan, photos: [], previews: [], outputPath: "/old.zip" };
    const next = reduceTuiState(state, { type: "folder", folder: "/new" });
    expect(next).toMatchObject({ folder: "/new", scan: null, previews: [], outputPath: "", step: "options" });
  });

  it("resets selection cursor on filtering and clamps negative cursor positions", () => {
    expect(reduceTuiState({ ...initialState(), cursor: 8 }, { type: "filter", filter: "bird" })).toMatchObject({ cursor: 0, filter: "bird" });
    expect(reduceTuiState(initialState(), { type: "cursor", cursor: -4 }).cursor).toBe(0);
  });

  it("keeps scan warnings and clears later matching and preview state on a new scan", () => {
    const state = { ...initialState(), matches: {} as never, previews: [] };
    expect(reduceTuiState(state, { type: "scan-done", scan })).toMatchObject({ scan, step: "options", matches: null, previews: [] });
  });

  it("invalidates matches and previews when originals or selection change", () => {
    const state = { ...initialState(), matches: {} as never, previews: [{} as never], photos: [] };
    expect(reduceTuiState(state, { type: "photos", photos: [] })).toMatchObject({ matches: null, previews: [], photos: [] });
  });

  it("invalidates matches, previews, and estimates when packaging options change", () => {
    const state = { ...initialState(), matches: {} as never, previews: [{} as never], estimate: { status: "ready", bytes: 123 } as const };
    expect(reduceTuiState(state, { type: "invalidate" })).toMatchObject({ matches: null, previews: [], estimate: { status: "pending" } });
  });

  it("stores progress and confirmation state without mutating the previous value", () => {
    const original = initialState();
    const next = reduceTuiState(original, { type: "confirm", confirm: "cancel" });
    expect(original.confirm).toBeNull();
    expect(next.confirm).toBe("cancel");
  });
});
