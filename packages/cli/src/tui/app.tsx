import React, { useEffect, useReducer, useRef, useState } from "react";
import { useInput } from "ink";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { PackageWriteError, type AttachmentMatch, type PackageOptions, type PipelineServices, type PhotoGroup, type PreviewResult, type SelectedPhotoPlan, type PackagePlan } from "../types.js";
import { initialState, reduceTuiState, type Step, type TuiPhoto } from "./state.js";
import { TuiController } from "./controller.js";
import { Frame } from "./screens/Frame.js";
import { Folder } from "./screens/Folder.js";
import { Options } from "./screens/Options.js";
import { Photos } from "./screens/Photos.js";
import { Raw } from "./screens/Raw.js";
import { Preview } from "./screens/Preview.js";
import { Summary } from "./screens/Summary.js";
import { Output } from "./screens/Output.js";
import { Writing } from "./screens/Writing.js";
import { Done } from "./screens/Done.js";
import { ErrorScreen } from "./screens/ErrorScreen.js";
import { ConfirmPrompt } from "./screens/ConfirmPrompt.js";
import { ManualPath } from "./screens/ManualPath.js";

const require = createRequire(import.meta.url);
const sharpVersion = (require("sharp") as { versions: { sharp: string } }).versions.sharp;
const zipVersion = readPackageVersion("@zip.js/zip.js");
const concurrency = Math.min(4, Math.max(1, os.availableParallelism()));

/**
 * Escape terminal control characters embedded in source filenames.
 *
 * @param value External terminal text to sanitize.
 * @returns A string with control and bidirectional formatting characters escaped.
 */
export function safeText(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    const unsafe = code <= 31 || (code >= 127 && code <= 159) || code === 0x061C || code === 0x200E || code === 0x200F || (code >= 0x202A && code <= 0x202E) || (code >= 0x2066 && code <= 0x2069);
    if (code <= 31 || (code >= 127 && code <= 159)) return `\\x${code.toString(16).padStart(2, "0")}`;
    return unsafe ? `\\u{${code.toString(16)}}` : character;
  }).join("");
}

/**
 * Clip sanitized terminal content to a fixed display-cell width.
 *
 * @param value Untrusted terminal text.
 * @param width Maximum display-cell count.
 * @returns Sanitized text clipped to the requested width.
 */
export function fitTerminalText(value: string, width: number): string {
  let used = 0;
  let result = "";
  for (const character of safeText(value)) {
    const code = character.codePointAt(0) ?? 0;
    const zeroWidth = /\p{Mark}/u.test(character) || code === 0x200D || (code >= 0xFE00 && code <= 0xFE0F);
    const wide = code >= 0x1100 && (code <= 0x115F || code === 0x2329 || code === 0x232A || (code >= 0x2E80 && code <= 0xA4CF) || (code >= 0xAC00 && code <= 0xD7A3) || (code >= 0xF900 && code <= 0xFAFF) || (code >= 0xFE10 && code <= 0xFE6F) || (code >= 0xFF00 && code <= 0xFF60) || (code >= 0x1F000 && code <= 0x1FAFF));
    const cells = zeroWidth ? 0 : (wide ? 2 : 1);
    if (used + cells > width) break;
    result += character;
    used += cells;
  }
  return result;
}

/**
 * Render a compact terminal interface and coordinate abortable pipeline stages.
 *
 * @param root0 Component properties.
 * @param root0.services Pipeline services used by each flow stage.
 * @param root0.initialFolder Optional source folder from the command line.
 * @param root0.onExit Callback invoked after a clean exit.
 * @param root0.lifecycle Async operation and preview lifecycle owner.
 * @returns The interactive terminal application.
 */
export function TuiApp({ services, initialFolder = "", onExit, lifecycle = new TuiController() }: { services: PipelineServices; initialFolder?: string; onExit: (code: number) => void; lifecycle?: TuiController }): React.JSX.Element {
  const [state, dispatch] = useReducer(reduceTuiState, initialFolder, initialState);
  const [options, setOptions] = useState({ includeRaw: true, includeSidecars: true });
  const [edit, setEdit] = useState(initialFolder);
  const [editCursor, setEditCursor] = useState(initialFolder.length);
  const [manualCursor, setManualCursor] = useState(0);
  const [outputCursor, setOutputCursor] = useState(0);
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState("");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [filterMode, setFilterMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const controller = useRef(lifecycle);
  const estimateGeneration = useRef(0);
  const [frame, setFrame] = useState(0);
  useEffect(() => { const timer = setInterval(() => setFrame((value) => value + 1), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => () => { void controller.current.dispose(); }, []);

  /**
   * Start a cancellable async stage and ignore results after navigation.
   *
   * @param work Cancellable operation for the active stage.
   * @param errorStep Stage to restore if the operation fails.
   */
  const run = async (work: (signal: AbortSignal) => Promise<void>, errorStep: Step = state.step): Promise<void> => {
    setBusy(true);
    try {
      await controller.current.run(async (signal) => work(signal));
    } catch (error) {
      const outputAlreadyExists = error instanceof PackageWriteError && error.code === "output-exists";
      const writeFailure = errorStep === "output" || errorStep === "writing";
      if (!outputAlreadyExists && !writeFailure && errorStep !== "preview") await controller.current.finishSession();
      if (error instanceof PackageWriteError && error.code === "output-exists") {
        dispatch({ type: "stage", step: "output" });
        dispatch({ type: "progress", progress: error.message });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        const origin = manualFor ? "raw" : errorStep;
        if (["folder", "photos", "raw", "preview", "output", "writing"].includes(origin)) {
          dispatch({ type: "stage", step: origin === "writing" ? "output" : origin });
          dispatch({ type: "progress", progress: message });
        } else {
          dispatch({ type: "error", error: message });
        }
      }
    } finally {
      setBusy(false);
    }
  };
  /**
   * Move to a preceding screen, abort current work and dispose temporary previews.
   *
   */
  const back = (): void => {
    void controller.current.cancel();
    if (state.step === "error") { dispatch({ type: "stage", step: state.errorReturnStep }); return; }
    const steps: Step[] = options.includeRaw ? ["folder", "options", "photos", "raw", "preview", "summary", "output"] : ["folder", "options", "photos", "preview", "summary", "output"];
    const index = steps.indexOf(state.step);
    if (state.step === "preview" || state.step === "writing") void controller.current.disposeSession();
    if (index > 0) dispatch({ type: "stage", step: steps[index - 1]! });
  };
  /**
   * Validate and scan the selected source folder.
   *
   * @param folder Source directory entered by the user.
   * @returns Nothing; scan work runs asynchronously.
   */
  const scan = (folder: string): void => void run(async (signal) => {
    const normalized = stripMatchingQuotes(folder);
    const absolute = isWindowsPath(normalized) ? path.win32.normalize(normalized) : path.resolve(normalized);
    if (!folder.trim()) throw new Error("Enter a source folder path.");
    dispatch({ type: "progress", progress: `Scanning ${absolute}…` });
    const result = await services.scanner.scan(absolute, signal, (event) => { if (!signal.aborted) dispatch({ type: "progress", progress: event.message }); });
    if (signal.aborted) return;
    dispatch({ type: "folder", folder: absolute }); dispatch({ type: "scan-done", scan: result });
  }, "folder");
  /**
   * Configure package options and enter photo selection.
   *
   */
  const beginPhotos = (): void => {
    if (!state.scan) return;
    if (state.scan.photos.length === 0) {
      dispatch({ type: "progress", progress: "No JPEG or TIFF photos were found in this folder." });
      return;
    }
    dispatch({ type: "photos", photos: state.scan.photos.map((photo) => {
      const candidates = [...photo.jpegCandidates, ...photo.tiffCandidates];
      const needsChoice = candidates.length > 1;
      return { ...photo, selected: true, chosenOriginal: needsChoice ? null : photo.suggestedOriginal ?? candidates[0] ?? null, originalDecision: !needsChoice };
    }) });
    dispatch({ type: "stage", step: "photos" });
  };
  /**
   * Resolve RAW choices for selected photos and proceed to preview generation.
   *
   * @returns Nothing; the matching operation starts asynchronously.
   */
  const resolveRaw = (): void => void run(async (signal) => {
    if (!state.scan) return;
    const packageOptions: PackageOptions = { sourceDirectory: state.scan.sourceDirectory, includeRaw: options.includeRaw, includeSidecars: options.includeSidecars, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency };
    const selectedPhotos = state.photos.filter((photo) => photo.selected);
    if (selectedPhotos.length === 0) throw new Error("Select at least one photo to continue.");
    if (selectedPhotos.some((photo) => !photo.chosenOriginal || (photo.jpegCandidates.length + photo.tiffCandidates.length > 1 && !photo.originalDecision))) throw new Error("Choose the original file for every selected photo with multiple candidates.");
    const originals = selectedPhotos.filter((photo): photo is TuiPhoto & { chosenOriginal: NonNullable<TuiPhoto["chosenOriginal"]> } => photo.chosenOriginal !== null);
    const matches = await services.matcher.initialSearch(originals, state.scan, packageOptions, signal, (event) => { if (!signal.aborted) dispatch({ type: "progress", progress: event.message }); });
    if (!signal.aborted) {
      if (options.includeRaw) {
        dispatch({ type: "matches-done", matches });
      } else {
        dispatch({ type: "matches-done", matches, step: "preview" });
        await generatePreviewWork(signal, matches);
      }
    }
  }, "photos");
  /**
   * Generate previews and preserve the disposable session for retries and ZIP writing.
   *
   * @param signal Active pipeline cancellation signal.
   * @param matchSession Current RAW matching results.
   * @returns Nothing.
   */
  const generatePreviewWork = async (signal: AbortSignal, matchSession: NonNullable<typeof state.matches>): Promise<void> => {
    if (!matchSession || !state.scan) return;
    const packageOptions: PackageOptions = { sourceDirectory: state.scan.sourceDirectory, includeRaw: options.includeRaw, includeSidecars: options.includeSidecars, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency };
    const ready = matchSession.photos.filter((photo) => photo.selected && (!options.includeRaw || photo.rawMatch.state === "accepted" || photo.rawMatch.state === "disabled" || (photo.rawMatch.state === "missing" && photo.rawMatch.decision === "accept-missing")));
    if (ready.length !== matchSession.photos.filter((photo) => photo.selected).length) throw new Error("Resolve every RAW match or accept it as missing before continuing.");
    let matchedPhotos = matchSession.photos;
    if (options.includeSidecars) {
      const photosWithSidecars = await Promise.all(ready.map(async (photo) => ({
        ...photo,
        sidecarMatches: await services.matcher.collectSidecars({ chosenOriginal: photo.chosenOriginal!, rawMatches: photo.rawMatch.chosen ? [photo.rawMatch.chosen] : [] }, signal),
      })));
      if (signal.aborted) return;
      matchedPhotos = matchSession.photos.map((photo) => photosWithSidecars.find((resolved) => resolved.id === photo.id) ?? photo);
      dispatch({ type: "matches-done", matches: { ...matchSession, photos: matchedPhotos }, step: "preview" });
    }
    dispatch({ type: "stage", step: "preview" });
    const photosToPreview = options.includeSidecars ? matchedPhotos.filter((photo) => photo.selected) : ready;
    const results: PreviewResult[] = [];
    const session = await services.preview.generateSession(photosToPreview, packageOptions, signal, (result) => { if (!signal.aborted) { results.push(result); dispatch({ type: "progress", progress: `Generated ${results.length} of ${photosToPreview.length} previews` }); } });
    if (!await controller.current.retainSession(session, signal)) return;
    const finalResults = session.results.length > 0 ? [...session.results] : results;
    dispatch({ type: "previews-done", previews: finalResults });
    if (finalResults.every((result) => result.ok)) dispatch({ type: "stage", step: "summary" });
  };
  const generatePreviews = (): void => {
    const matchSession = state.matches;
    if (!matchSession) return;
    void run((signal) => generatePreviewWork(signal, matchSession), "preview");
  };
  /**
   * Retry a failed preview in the active preview session.
   *
   * @param photoId Identifier for the failed photo.
   * @returns Nothing; the retry starts asynchronously.
   */
  const retry = (photoId: string): void => void run(async (signal) => {
    const result = await controller.current.previewSession?.retry(photoId, signal);
    if (!result || signal.aborted) return;
    const previews = controller.current.previewSession?.results ?? [result];
    dispatch({ type: "previews-done", previews });
    if (previews.length > 0 && previews.every((preview) => preview.ok)) dispatch({ type: "stage", step: "summary" });
  }, "preview");
  /**
   * Construct the ZIP plan from selected and resolved stage results.
   *
   * @returns A package plan when scan and match results are available.
   */
  const createPlan = (): PackagePlan | null => {
    if (!state.matches || !state.scan) return null;
    const selected: SelectedPhotoPlan[] = state.matches.photos.filter((photo) => photo.selected).flatMap((photo) => {
      const preview = state.previews.find((item) => item.photoId === photo.id);
      if (!preview?.ok || !photo.chosenOriginal) return [];
      const raw = photo.rawMatch.chosen ? [photo.rawMatch.chosen] : [];
      return [{ photo, chosenOriginal: photo.chosenOriginal, preview, raw, sidecars: photo.sidecarMatches }];
    });
    return { photos: selected, outputPath: state.outputPath, options: { sourceDirectory: state.scan.sourceDirectory, includeRaw: options.includeRaw, includeSidecars: options.includeSidecars, thumbnailMaxEdge: 320, workingMaxEdge: 1280, concurrency }, versions: { generatorName: "Catapult companion CLI", generatorVersion: require("../../package.json").version as string, sharpVersion, zipVersion } };
  };
  /**
   * Start streaming ZIP output and show completion or failure.
   *
   */
  const write = (): void => {
    const plan = createPlan(); if (!plan) return;
    if (isInsideDirectory(plan.outputPath, plan.options.sourceDirectory)) {
      dispatch({ type: "progress", progress: "Choose an output path outside the source folder." });
      return;
    }
    dispatch({ type: "stage", step: "writing" });
    void run(async (signal) => { const summary = await services.zip.write(plan, signal, (event) => { if (!signal.aborted) dispatch({ type: "progress", progress: event.message }); }); await controller.current.finishSession(); dispatch({ type: "progress", progress: `Created ${summary.outputPath}` }); dispatch({ type: "stage", step: "done" }); }, "writing");
  };

  // Recompute as soon as the summary is entered and whenever its selected package inputs change.
  useEffect(() => {
    if (state.step !== "summary") return;
    const generation = ++estimateGeneration.current;
    dispatch({ type: "estimate", estimate: { status: "pending" } });
    const plan = createPlan();
    if (!plan) return;
    // eslint-disable-next-line unicorn/prefer-promise-try
    void Promise.resolve().then(() => services.zip.estimate(plan)).then((estimate) => {
      if (generation === estimateGeneration.current) dispatch({ type: "estimate", estimate: { status: "ready", bytes: estimate.estimatedBytes } });
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (generation === estimateGeneration.current) dispatch({ type: "estimate", estimate: { status: "failed", message } });
    });
    return () => { if (generation === estimateGeneration.current) estimateGeneration.current += 1; };
  // createPlan uses only these inputs and options.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.zip, state.step, state.matches, state.previews, state.photos, options.includeRaw, options.includeSidecars]);

  const matches = state.matches?.photos.filter((photo) => photo.selected) ?? [];
  const visible = visiblePhotos(state.photos, state.filter);

  useInput((input, key) => {
    if (manualFor) {
      if (key.escape) { setManualFor(null); setManualPath(""); return; }
      if (key.return && state.matches) void run(async (signal) => {
        if (!manualPath.trim()) throw new Error("Enter a file path to inspect.");
        const candidate = await services.matcher.inspectFile(manualPath, signal);
        const matchesAfterPick = services.matcher.applyDecision(state.matches!, { photoId: manualFor, decision: "manual-pick", candidate });
        if (!signal.aborted) { dispatch({ type: "matches-done", matches: matchesAfterPick, cursor: state.cursor }); setManualFor(null); setManualPath(""); }
      }, "raw");
      else if (key.leftArrow) setManualCursor((value) => Math.max(0, value - 1));
      else if (key.rightArrow) setManualCursor((value) => Math.min(manualPath.length, value + 1));
      else if (key.backspace && manualCursor > 0) { setManualPath(manualPath.slice(0, manualCursor - 1) + manualPath.slice(manualCursor)); setManualCursor(manualCursor - 1); }
      else if (key.delete) setManualPath(manualPath.slice(0, manualCursor) + manualPath.slice(manualCursor + 1));
      else if (input && !key.ctrl && !key.meta) { setManualPath(manualPath.slice(0, manualCursor) + input + manualPath.slice(manualCursor)); setManualCursor(manualCursor + input.length); }
      return;
    }
    if (state.confirm) { if (input.toLowerCase() === "y" || key.return) { if (state.confirm === "cancel") { void controller.current.dispose().then(() => onExit(0)); } else if (state.confirm === "missing-all" && state.matches) { const unresolvedMissing = state.matches.photos.filter((photo) => photo.selected && photo.rawMatch.state === "missing" && photo.rawMatch.decision === null); let updated = state.matches; for (const photo of unresolvedMissing) updated = services.matcher.applyDecision(updated, { photoId: photo.id, decision: "accept-missing" }); const activePhoto = matches[state.cursor]; dispatch({ type: "matches-done", matches: updated, cursor: rawCursorAfterDecision(updated, activePhoto?.id, state.cursor) }); } else if (state.matches) void run(async (signal) => { const unresolvedIds = state.matches!.photos.filter((photo) => photo.selected && isUnresolved(photo)).map((photo) => photo.id); const expansion = await services.matcher.expandParents(state.matches!, unresolvedIds, signal, (event) => { if (!signal.aborted) dispatch({ type: "progress", progress: event.message }); }); if (!signal.aborted) dispatch({ type: "matches-done", matches: expansion.session, cursor: state.cursor }); }); dispatch({ type: "confirm", confirm: null }); } else if (input.toLowerCase() === "n" || key.escape) dispatch({ type: "confirm", confirm: null }); return; }
    if (key.ctrl && input === "c") { dispatch({ type: "confirm", confirm: "cancel" }); return; }
    if (busy) { if (key.escape) { if (state.step === "writing" || state.step === "preview") dispatch({ type: "confirm", confirm: "cancel" }); else back(); } return; }
    if (state.step === "folder") {
      if (key.return) scan(edit);
      else if (key.leftArrow) setEditCursor((value) => Math.max(0, value - 1));
      else if (key.rightArrow) setEditCursor((value) => Math.min(edit.length, value + 1));
      else if (key.backspace && editCursor > 0) { setEdit(edit.slice(0, editCursor - 1) + edit.slice(editCursor)); setEditCursor(editCursor - 1); }
      else if (key.delete) setEdit(edit.slice(0, editCursor) + edit.slice(editCursor + 1));
      else if (input && !key.ctrl && !key.meta) { setEdit(edit.slice(0, editCursor) + input + edit.slice(editCursor)); setEditCursor(editCursor + input.length); }
      return;
    }
    if (state.step === "output") {
      if (key.return) write();
      else if (key.leftArrow) setOutputCursor((value) => Math.max(0, value - 1));
      else if (key.rightArrow) setOutputCursor((value) => Math.min(state.outputPath.length, value + 1));
      else if (key.backspace && outputCursor > 0) { dispatch({ type: "output", outputPath: state.outputPath.slice(0, outputCursor - 1) + state.outputPath.slice(outputCursor) }); setOutputCursor(outputCursor - 1); }
      else if (key.delete) dispatch({ type: "output", outputPath: state.outputPath.slice(0, outputCursor) + state.outputPath.slice(outputCursor + 1) });
      else if (input && !key.ctrl && !key.meta) { dispatch({ type: "output", outputPath: state.outputPath.slice(0, outputCursor) + input + state.outputPath.slice(outputCursor) }); setOutputCursor(outputCursor + input.length); }
      return;
    }
    if (state.step === "photos" && filterMode) {
      if (key.return || key.escape) setFilterMode(false);
      else if (key.backspace || key.delete) dispatch({ type: "filter", filter: state.filter.slice(0, -1) });
      else if (input && !key.ctrl && !key.meta) dispatch({ type: "filter", filter: state.filter + input });
      return;
    }
    if (key.escape) { if (state.step === "preview" && state.previews.length > 0 && !busy) back(); else if (["scan", "match", "preview", "writing", "folder"].includes(state.step)) dispatch({ type: "confirm", confirm: "cancel" }); else back(); return; }
    if (key.upArrow || key.downArrow) {
      const rows = state.step === "photos" ? visible.length : matches.length;
      dispatch({ type: "cursor", cursor: Math.max(0, Math.min(rows - 1, state.cursor + (key.downArrow ? 1 : -1))) });
      setCandidateIndex(0);
      return;
    }
    if (state.step === "options") { if (input === "1") { setOptions((value) => ({ ...value, includeRaw: !value.includeRaw })); dispatch({ type: "invalidate" }); } else if (input === "2") { setOptions((value) => ({ ...value, includeSidecars: !value.includeSidecars })); dispatch({ type: "invalidate" }); } else if (key.return) beginPhotos(); return; }
    if (state.step === "photos") {
      const active = visible[state.cursor];
      if (input === " ") {
        if (active) dispatch({ type: "photos", photos: state.photos.map((photo) => photo.id === active.id ? { ...photo, selected: !photo.selected } : photo) });
      } else if ((key.ctrl && input.toLowerCase() === "a") || input === "\u{1}") {
        const visibleIds = new Set(visible.map((photo) => photo.id));
        const allVisibleSelected = visible.length > 0 && visible.every((photo) => photo.selected);
        dispatch({ type: "photos", photos: state.photos.map((photo) => visibleIds.has(photo.id) ? { ...photo, selected: !allVisibleSelected } : photo) });
      } else if ((input.toLowerCase() === "j" || input.toLowerCase() === "t") && active) {
        const candidates = input.toLowerCase() === "j" ? active.jpegCandidates : active.tiffCandidates;
        const currentIndex = candidates.findIndex((candidate) => candidate.path === active.chosenOriginal?.path);
        const chosenOriginal = candidates[(currentIndex + 1) % candidates.length];
        if (chosenOriginal) dispatch({ type: "photos", photos: state.photos.map((photo) => photo.id === active.id ? { ...photo, chosenOriginal, originalDecision: true } : photo) });
      } else if (key.return) resolveRaw();
      else if (input === "/") { setFilterMode(true); dispatch({ type: "filter", filter: "" }); }
      return;
    }
    if (state.step === "raw" && state.matches) { const photo = matches[state.cursor]; if (!photo) { if (key.return) generatePreviews(); return; }
      if (key.leftArrow || key.rightArrow) {
        const lastCandidate = Math.max(0, photo.rawMatch.candidates.length - 1);
        setCandidateIndex((value) => Math.max(0, Math.min(lastCandidate, value + (key.rightArrow ? 1 : -1))));
        return;
      }
      switch (input) {
 case "a": {
   const candidate = photo.rawMatch.candidates[candidateIndex];
        if (candidate) { const updated = services.matcher.applyDecision(state.matches, { photoId: photo.id, decision: "accept", path: candidate.path }); dispatch({ type: "matches-done", matches: updated, cursor: rawCursorAfterDecision(updated, photo.id, state.cursor) }); }
 break;
 }
 case "A": {
   const candidate = photo.rawMatch.candidates[0];
   if (candidate) { const updated = services.matcher.applyDecision(state.matches, { photoId: photo.id, decision: "accept-all-in-folder", directory: path.dirname(candidate.path) }); dispatch({ type: "matches-done", matches: updated, cursor: state.cursor }); }
 break;
 }
      case "m": {
 setManualFor(photo.id);
 break;
 }
 case "d": {
 applyRawDecision(photo, "deselect", services, state.matches, state.cursor, dispatch);
 break;
 }
 case "x": {
 applyRawDecision(photo, "accept-missing", services, state.matches, state.cursor, dispatch);
 break;
 }
 case "X": {
   const missingCount = state.matches.photos.filter((item) => item.selected && item.rawMatch.state === "missing" && item.rawMatch.decision === null).length;
   if (missingCount > 0) dispatch({ type: "confirm", confirm: "missing-all" });
 break;
 }
 case "p": {
   if (!state.matches.reachedFilesystemRoot && isUnresolved(photo)) dispatch({ type: "confirm", confirm: "parent" });
 break;
 }
      default: { if (key.return) {
        const unresolved = matches.findIndex((item) => item.rawMatch.state !== "disabled" && item.rawMatch.state !== "accepted" && !(item.rawMatch.state === "missing" && item.rawMatch.decision === "accept-missing"));
        if (unresolved === -1) {generatePreviews();}
        else { dispatch({ type: "cursor", cursor: unresolved }); dispatch({ type: "progress", progress: "Resolve each RAW match before continuing." }); }
      }
 }
 } return; }
    if (state.step === "preview") { const active = state.previews[state.cursor]; if (input === "r" && active && !active.ok) retry(active.photoId); else if (input === "d" && active && !active.ok) { if (state.photos.filter((photo) => photo.selected).length <= 1) dispatch({ type: "progress", progress: "Keep at least one photo selected." }); else dispatch({ type: "preview-deselect", photoId: active.photoId }); } else if (key.return && state.previews.every((item) => item.ok)) dispatch({ type: "stage", step: "summary" }); return; }
    if (state.step === "summary") { if (key.return) { const outputPath = defaultOutputPath(state.scan?.sourceDirectory ?? "photos"); setOutputCursor(outputPath.length); dispatch({ type: "output", outputPath }); } return; }
    if (state.step === "error" && key.return) back();
    if (state.step === "done" && key.return) onExit(0);
  });

  const selected = state.photos.filter((photo) => photo.selected);
  const activeRaw = matches[state.cursor];
  const columns = 80;
  const rows = 24;
  const title = `Catapult photo package  •  ${state.step.toUpperCase()}`;
  return <Frame title={fitTerminalText(title, columns)} columns={columns} rows={rows}>
    {state.confirm === "cancel" ? <ConfirmPrompt prompt="Cancel and discard this run? (y/n)" columns={columns} /> : null}
    {state.confirm === "parent" && state.matches && !state.matches.reachedFilesystemRoot && path.dirname(state.matches.searchRoot) !== state.matches.searchRoot ? <ConfirmPrompt prompt={`Search parent folder ${path.dirname(state.matches.searchRoot)} and descendants? (y/n)`} columns={columns} /> : null}
    {state.confirm === "missing-all" && state.matches ? <ConfirmPrompt prompt={`Accept ${state.matches.photos.filter((photo) => photo.selected && photo.rawMatch.state === "missing" && photo.rawMatch.decision === null).length} missing RAWs as missing? (y/n)`} columns={columns} /> : null}
    {manualFor ? <ManualPath value={manualPath} cursor={manualCursor} columns={columns} /> : null}
    {state.step === "folder" ? <Folder value={edit} cursor={editCursor} progress={state.progress} columns={columns} /> : null}
    {state.step === "options" ? <Options includeRaw={options.includeRaw} includeSidecars={options.includeSidecars} photoCount={state.scan?.photos.length ?? 0} progress={state.progress} /> : null}
    {state.step === "photos" ? <Photos selected={selected.length} total={state.photos.length} filter={state.filter} items={visible} cursor={state.cursor} progress={state.progress} columns={columns} rows={rows} /> : null}
    {state.step === "raw" ? <Raw matches={matches} warnings={state.matches?.warnings ?? []} cursor={state.cursor} active={activeRaw} candidateIndex={candidateIndex} progress={state.progress} columns={columns} rows={rows} /> : null}
    {state.step === "preview" ? <Preview previews={state.previews} cursor={state.cursor} progress={state.progress} frame={frame} columns={columns} rows={rows} /> : null}
    {state.step === "summary" ? <Summary previews={state.previews} matches={matches} matchWarnings={state.matches?.warnings ?? []} scan={state.scan} photos={state.photos} estimate={state.estimate} columns={columns} rows={rows} /> : null}
    {state.step === "output" ? <Output value={state.outputPath} cursor={outputCursor} progress={state.progress} columns={columns} /> : null}
    {state.step === "writing" ? <Writing progress={state.progress} frame={frame} columns={columns} /> : null}
    {state.step === "done" ? <Done progress={state.progress} columns={columns} /> : null}
    {state.step === "error" ? <ErrorScreen error={state.error} columns={columns} /> : null}
  </Frame>;
}

/**
 * Apply a RAW decision immutably through the matcher contract.
 *
 * @param photo Photo whose RAW decision changes.
 * @param decision User decision to apply.
 * @param services Matcher service used for the pure state update.
 * @param session Current matching session.
 * @param cursor Current RAW row cursor.
 * @param dispatch Reducer dispatch function.
 */
function applyRawDecision(photo: PhotoGroup, decision: "accept" | "accept-missing" | "deselect", services: PipelineServices, session: NonNullable<ReturnType<typeof initialState>["matches"]>, cursor: number, dispatch: React.Dispatch<Parameters<typeof reduceTuiState>[1]>): void {
  const match: AttachmentMatch = photo.rawMatch;
  const candidate = match.candidates[0];
  if (decision === "accept" && candidate) {
    const updated = services.matcher.applyDecision(session, { photoId: photo.id, decision, path: candidate.path });
    dispatch({ type: "matches-done", matches: updated, cursor: rawCursorAfterDecision(updated, photo.id, cursor) });
  } else if (decision !== "accept") {
    const updated = services.matcher.applyDecision(session, { photoId: photo.id, decision });
    dispatch({ type: "matches-done", matches: updated, cursor: rawCursorAfterDecision(updated, photo.id, cursor) });
  }
}

/**
 * Choose the next unresolved selected RAW row, keeping the current position when none remain.
 *
 * @param session Updated matching session.
 * @param currentPhotoId Photo just acted on, if it remains selected.
 * @param cursor Previous cursor position.
 * @returns Cursor within the selected photo list.
 */
function rawCursorAfterDecision(session: NonNullable<ReturnType<typeof initialState>["matches"]>, currentPhotoId: string | undefined, cursor: number): number {
  const selected = session.photos.filter((photo) => photo.selected);
  if (selected.length === 0) return 0;
  const anchor = selected.findIndex((photo) => photo.id === currentPhotoId);
  const start = anchor === -1 ? Math.min(cursor - 1, selected.length - 1) : anchor;
  for (let offset = 1; offset <= selected.length; offset += 1) {
    const index = (start + offset) % selected.length;
    if (isUnresolved(selected[index]!)) return index;
  }
  return Math.max(0, Math.min(start, selected.length - 1));
}

/**
 * Return photos whose filenames match the current case-insensitive filter.
 *
 * @param photos Complete photo list.
 * @param filter Case-insensitive filename substring.
 * @returns Photos matching the current filter.
 */
function visiblePhotos(photos: TuiPhoto[], filter: string): TuiPhoto[] {
  return photos.filter((photo) => (photo.chosenOriginal?.filename ?? photo.suggestedOriginal?.filename ?? "").toLowerCase().includes(filter.toLowerCase()));
}

/**
 * Return whether a selected photo still needs a RAW decision.
 *
 * @param photo Photo whose RAW state is being checked.
 * @returns Whether the photo still needs a RAW decision.
 */
function isUnresolved(photo: PhotoGroup): boolean {
  return photo.rawMatch.state !== "disabled" && photo.rawMatch.state !== "accepted" && !(photo.rawMatch.state === "missing" && photo.rawMatch.decision === "accept-missing");
}

/**
 * Remove matching quote pairs around a user-entered path.
 *
 * @param value User-entered path text.
 * @returns Path text without a matching quote pair.
 */
function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  const matching = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return matching ? trimmed.slice(1, -1) : trimmed;
}

/**
 * Detect drive-letter and UNC paths independently of the host operating system.
 *
 * @param value Path text to inspect.
 * @returns Whether the path uses Windows drive or UNC syntax.
 */
function isWindowsPath(value: string): boolean {
  return /^[a-z]:[\\/]/iu.test(value) || value.startsWith("\\\\") || value.startsWith("//");
}

/**
 * Read an installed package version using Node's module resolver.
 *
 * @param packageName Installed package name.
 * @returns Version read from the resolved package manifest.
 */
function readPackageVersion(packageName: string): string {
  let directory = path.dirname(require.resolve(packageName));
  while (directory !== path.dirname(directory)) {
    const manifestPath = path.join(directory, "package.json");
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: string; version?: string };
      if (manifest.name === packageName && manifest.version) return manifest.version;
    } catch {
      // Continue upward until the package manifest is found.
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Cannot determine installed version for ${packageName}.`);
}

/**
 * Choose a default archive destination beside the source, or in the home directory at a filesystem root.
 *
 * @param sourceDirectory Scanned source directory.
 * @returns A default ZIP path outside the source directory.
 */
function defaultOutputPath(sourceDirectory: string): string {
  const implementation = isWindowsPath(sourceDirectory) ? path.win32 : path;
  const normalizedSource = implementation.resolve(sourceDirectory);
  const sourceRoot = implementation.parse(normalizedSource).root;
  const destination = normalizedSource === sourceRoot ? os.homedir() : implementation.dirname(normalizedSource);
  const folderName = implementation.basename(normalizedSource) || "photos";
  return implementation.join(destination, `${folderName}.catapult.zip`);
}

/**
 * Check whether a destination is equal to or nested beneath a source folder.
 *
 * @param destination Proposed ZIP output path.
 * @param sourceDirectory Scanned source directory.
 * @returns Whether the output path is inside the source directory.
 */
function isInsideDirectory(destination: string, sourceDirectory: string): boolean {
  const implementation = isWindowsPath(sourceDirectory) || isWindowsPath(destination) ? path.win32 : path;
  const relativePath = implementation.relative(implementation.resolve(sourceDirectory), implementation.resolve(destination));
  return relativePath === "" || (!implementation.isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${implementation.sep}`));
}
