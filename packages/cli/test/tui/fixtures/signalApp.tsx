/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from "ink";
import { appendFileSync, writeFileSync } from "node:fs";
import { TuiApp } from "../../../src/tui/app.js";
import { TuiController } from "../../../src/tui/controller.js";
import type { PipelineServices, ScanResult } from "../../../src/types.js";

const marker = process.env.CATAPULT_DISPOSE_MARKER!;
const date = new Date(0);
const file = { path: "/source/a.jpg", filename: "a.jpg", extension: ".jpg", snapshot: { size: 1, mtimeMs: 0 }, createdAt: null, modifiedAt: date, discoveredAt: date };
const scan: ScanResult = { sourceDirectory: "/source", visitedDirectories: ["/source"], photos: [{ id: "p1", jpegCandidates: [file], tiffCandidates: [], selected: true, suggestedOriginal: file }], warnings: [] };
const services = {
  scanner: { scan: async () => scan },
  matcher: {
    initialSearch: async (photos: any[]) => ({ photos: photos.map((photo) => ({ ...photo, sidecarMatches: [], rawMatch: { state: "ambiguous", candidates: [{ ...file, path: "/source/a.nef", filename: "a.nef", role: "raw" }], chosen: null, decision: null, matchedBy: null } })), visitedDirectories: new Set(["/source"]), searchRoot: "/source", reachedFilesystemRoot: false, warnings: [] }),
    applyDecision: (session: any, decision: any) => ({ ...session, photos: session.photos.map((photo: any) => ({ ...photo, rawMatch: { ...photo.rawMatch, state: "accepted", chosen: photo.rawMatch.candidates[0], decision: decision.decision } })) }),
    collectSidecars: async () => [], inspectFile: async () => file, expandParents: async (session: any) => ({ session, newlyVisitedDirectories: [], searchRoot: "/source", reachedFilesystemRoot: false }),
  },
  preview: { workingDirectory: "/tmp", generateSession: async (_photos: any[], _options: any, _signal: any, onPhoto: any) => { const result = { ok: false, photoId: "p1", failure: { photoId: "p1", sourcePath: file.path, stage: "decode", message: "fixture failure", retryable: true }, warnings: [] }; onPhoto(result); if (process.env.CATAPULT_DELAY_SESSION === "1") await new Promise((resolve) => setTimeout(resolve, 2000)); if (process.env.CATAPULT_DELAY_SESSION === "1") appendFileSync(marker, "session-created\n"); return { results: [result], retry: async () => result, dispose: async () => { if (process.env.CATAPULT_DELAY_SESSION === "1") { appendFileSync(marker, "disposed\n"); return; } const count = Number(await import("node:fs").then(({ readFileSync }) => { try { return readFileSync(marker, "utf8"); } catch { return "0"; } })); writeFileSync(marker, String(count + 1)); } }; } },
  zip: { estimate: () => ({ estimatedBytes: 1, sourceBytes: 1, photoCount: 1, attachmentCount: 1, warnings: [] }), write: async () => { throw new Error("unused"); } },
} as unknown as PipelineServices;
const lifecycle = new TuiController();
const app = render(<TuiApp services={services} initialFolder="/source" lifecycle={lifecycle} onExit={() => app.unmount()} />, { exitOnCtrlC: false });
let closing = false;
const close = (signal: NodeJS.Signals): void => { if (closing) return; closing = true; void lifecycle.dispose().then(() => { app.unmount(); process.exitCode = signal === "SIGINT" ? 130 : 143; }); };
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => close(signal));
await app.waitUntilExit();
if (!closing) await lifecycle.dispose();
