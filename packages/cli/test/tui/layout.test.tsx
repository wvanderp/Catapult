/* eslint-disable no-control-regex, unicorn/prefer-unicode-code-point-escapes */
import type React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { Frame } from "../../src/tui/screens/Frame.js";
import { Folder } from "../../src/tui/screens/Folder.js";
import { Options } from "../../src/tui/screens/Options.js";
import { Photos } from "../../src/tui/screens/Photos.js";
import { Raw } from "../../src/tui/screens/Raw.js";
import { Preview } from "../../src/tui/screens/Preview.js";
import { Summary } from "../../src/tui/screens/Summary.js";
import { Output } from "../../src/tui/screens/Output.js";
import { Writing } from "../../src/tui/screens/Writing.js";
import { Done } from "../../src/tui/screens/Done.js";
import { ErrorScreen } from "../../src/tui/screens/ErrorScreen.js";
import { ConfirmPrompt } from "../../src/tui/screens/ConfirmPrompt.js";
import { ManualPath } from "../../src/tui/screens/ManualPath.js";
import stringWidth from "string-width";
import type { MatchSession } from "../../src/types.js";
import type { TuiPhoto } from "../../src/tui/state.js";

const photo: TuiPhoto = { id: "p1", jpegCandidates: [], tiffCandidates: [], selected: true, suggestedOriginal: null, chosenOriginal: null };
const emptyMatches = [] as unknown as MatchSession["photos"];

describe("presentational TUI screens", () => {
  it("bounds hostile text from every screen component", () => {
    const bad = `name\u001B[31m\n\u202E漢字🙂${"p".repeat(330)}`;
    const screens: React.ReactNode[] = [
      <Frame title={bad} columns={80} rows={24}><Text>{bad}</Text></Frame>,
      <Folder value={bad} cursor={bad.length} progress={bad} columns={80} />,
      <Options includeRaw includeSidecars photoCount={200} progress={bad} />,
      <Photos selected={200} total={200} filter={bad} items={[]} cursor={0} progress={bad} columns={80} rows={24} />,
      <Raw matches={emptyMatches} cursor={0} active={undefined} candidateIndex={0} progress={bad} columns={80} rows={24} />,
      <Preview previews={[]} cursor={0} progress={bad} frame={0} columns={80} rows={24} />,
      <Summary previews={[]} matches={emptyMatches} matchWarnings={Array.from({ length: 30 }, () => bad)} scan={null} photos={[]} estimate={{ status: "pending" }} columns={80} rows={24} />,
      <Output value={bad} cursor={bad.length} progress={bad} columns={80} />,
      <Writing progress={bad} frame={0} columns={80} />,
      <Done progress={bad} columns={80} />,
      <ErrorScreen error={bad} columns={80} />,
      <ConfirmPrompt prompt={bad} columns={80} />,
      <ManualPath value={bad} cursor={bad.length} columns={80} />,
    ];
    for (const screen of screens) {
      const app = render(<Frame title="Test" columns={80} rows={24}>{screen}</Frame>);
      const output = (app.lastFrame() ?? "").replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
      expect(output.split("\n").length).toBeLessThanOrEqual(24);
      expect(output.split("\n").every((line) => stringWidth(line) <= 80)).toBe(true);
      expect(output.replaceAll("\n", "")).not.toMatch(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u);
      app.unmount();
    }
  });
  it("keeps hostile list content within the terminal frame and preserves the active row", () => {
    const bad = `ESC\u001B[31m\n\u202E漢字🙂${"x".repeat(340)}`;
    const items = Array.from({ length: 200 }, (_, index) => ({ ...photo, id: `p${index}`, chosenOriginal: { path: bad, filename: `${index}-${bad}`, extension: ".jpg", snapshot: { size: 1, mtimeMs: 0 }, createdAt: null, modifiedAt: new Date(0), discoveredAt: new Date(0) } }));
    for (const cursor of [0, 99, 199]) {
      const app = render(<Frame title={bad} columns={80} rows={24}><Photos selected={200} total={200} filter={bad} items={items} cursor={cursor} progress={bad} columns={80} rows={24} /></Frame>);
      const output = app.lastFrame() ?? "";
      const lines = output.split("\n");
      expect(lines.length).toBeLessThanOrEqual(24);
      expect(lines.every((line) => stringWidth(line) <= 80)).toBe(true);
      const plain = output.replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
      expect(plain.replaceAll("\n", "")).not.toMatch(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u);
      expect(plain).toContain(`› [x] ${cursor}-`);
      app.unmount();
    }
  });
  it("keeps the first, middle, and last RAW and preview cursor rows visible", () => {
    const date = new Date(0);
    const groups = Array.from({ length: 200 }, (_, index) => {
      const candidate = { path: `/source/${index}-漢字🙂${"x".repeat(300)}.jpg`, filename: `${index}-漢字🙂${"x".repeat(300)}.jpg`, extension: ".jpg", snapshot: { size: 1, mtimeMs: 0 }, createdAt: null, modifiedAt: date, discoveredAt: date };
      return { ...photo, id: `p${index}`, chosenOriginal: candidate, rawMatch: { state: "ambiguous" as const, candidates: [{ ...candidate, role: "raw" as const }], chosen: null, decision: null, matchedBy: null }, sidecarMatches: [] };
    }) as unknown as MatchSession["photos"];
    const previews = Array.from({ length: 200 }, (_, index) => ({ ok: false as const, photoId: `p${index}`, failure: { photoId: `p${index}`, sourcePath: "/source/a.jpg", stage: "decode" as const, message: "failed", retryable: true }, warnings: [] }));
    for (const cursor of [0, 99, 199]) {
      const raw = render(<Frame title="RAW" columns={80} rows={24}><Raw matches={groups} cursor={cursor} active={groups[cursor]} candidateIndex={0} progress="" columns={80} rows={24} /></Frame>);
      expect(raw.lastFrame()).toMatch(new RegExp(`›\\s*\\n?${cursor}-`));
      raw.unmount();
      const preview = render(<Frame title="Preview" columns={80} rows={24}><Preview previews={previews} cursor={cursor} progress="" frame={0} columns={80} rows={24} /></Frame>);
      expect(preview.lastFrame()).toContain(`› p${cursor}:`);
      preview.unmount();
    }
  });
  it("shows complete long RAW paths, file dates, sizes, time difference, controls, and a candidate window at 80x24", () => {
    const created = new Date("2020-01-02T03:04:05.000Z");
    const originalModified = new Date("2021-02-03T04:05:06.000Z");
    const rawModified = new Date("2021-02-03T04:10:06.000Z");
    const originalPath = `/original/${"猫".repeat(145)}.jpg`;
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      path: `/raw/${index}-${"猫".repeat(145)}.nef`, filename: `candidate-${index}.nef`, extension: ".nef", snapshot: { size: 1000 + index, mtimeMs: rawModified.valueOf() }, createdAt: created, modifiedAt: rawModified, discoveredAt: created, role: "raw" as const,
    }));
    const original = { path: originalPath, filename: "original.jpg", extension: ".jpg", snapshot: { size: 42, mtimeMs: originalModified.valueOf() }, createdAt: created, modifiedAt: originalModified, discoveredAt: created };
    const group = { ...photo, id: "long", chosenOriginal: original, rawMatch: { state: "ambiguous" as const, candidates, chosen: null, decision: null, matchedBy: null }, sidecarMatches: [] } as unknown as MatchSession["photos"][number];
    const app = render(<Frame title="RAW" columns={80} rows={24}><Raw matches={[group]} warnings={["Some RAW matches need review."]} cursor={0} active={group} candidateIndex={0} progress="" columns={80} rows={24} /></Frame>);
    const output = (app.lastFrame() ?? "").replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
    const joined = output.replaceAll("\n", "");
    expect(joined).toContain(originalPath);
    expect(joined).toContain(candidates[0]!.path);
    expect(output).toContain("Original created: 2020-01-02T03:04:05.000Z");
    expect(output).toContain("Original modified: 2021-02-03T04:05:06.000Z");
    expect(output).toContain("RAW created: 2020-01-02T03:04:05.000Z");
    expect(output).toContain("RAW modified: 2021-02-03T04:10:06.000Z");
    expect(output).toContain("size: 42 B");
    expect(output).toContain("size: 1000 B");
    expect(output).toContain("Δ +5m");
    expect(output).toContain("Warning: Some RAW matches need review.");
    for (const hint of ["↑↓ photo", "←→ candidate", "a accept", "A accept folder", "m manual", "p parent", "x missing", "d deselect", "Enter continue"]) expect(output).toContain(hint);
    expect(output).toContain("Candidates (1/10)");
    expect(output).toContain("candidate-0.nef");
    expect(output).not.toContain("candidate-9.nef");
    expect(output.split("\n").length).toBeLessThanOrEqual(24);
    app.unmount();

    const lastCandidate = render(<Frame title="RAW" columns={80} rows={24}><Raw matches={[group]} cursor={0} active={group} candidateIndex={9} progress="" columns={80} rows={24} /></Frame>);
    const lastCandidateOutput = (lastCandidate.lastFrame() ?? "").replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
    expect(lastCandidateOutput.replaceAll("\n", "")).toContain(originalPath);
    expect(lastCandidateOutput.replaceAll("\n", "")).toContain(candidates[9]!.path);
    expect(lastCandidateOutput).toContain("candidate-9.nef");
    for (const hint of ["↑↓ photo", "←→ candidate", "a accept", "Enter continue"]) expect(lastCandidateOutput).toContain(hint);
    expect(lastCandidateOutput.split("\n").length).toBeLessThanOrEqual(24);
    lastCandidate.unmount();
  });
  it("sanitizes hostile error and progress text inside the bounded frame", () => {
    const bad = `failure\u001B[31m\n\u202E漢字🙂${"z".repeat(300)}`;
    for (const screen of [<ErrorScreen error={bad} columns={80} />, <Writing progress={bad} frame={0} columns={80} />]) {
      const app = render(<Frame title="Hostile text" columns={80} rows={24}>{screen}</Frame>);
      const output = (app.lastFrame() ?? "").replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "");
      expect(output.split("\n").length).toBeLessThanOrEqual(24);
      expect(output.split("\n").every((line) => stringWidth(line) <= 80)).toBe(true);
      expect(output.replaceAll("\n", "")).not.toMatch(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u);
      app.unmount();
    }
  });

  it("renders Frame with plain props", () => { const app = render(<Frame title="Catapult" columns={80} rows={24}><Text>Screen content</Text></Frame>); expect(app.lastFrame()).toContain("Catapult"); });
  it("renders Folder with plain props", () => { const app = render(<Folder value="/photos" cursor={2} progress="" columns={80} />); expect(app.lastFrame()).toContain("Source folder path"); });
  it("renders Options with plain props", () => { const app = render(<Options includeRaw includeSidecars={false} photoCount={3} progress="" />); expect(app.lastFrame()).toContain("3 photo groups"); });
  it("renders Photos with plain props", () => { const app = render(<Photos selected={1} total={1} filter="" items={[photo]} cursor={0} progress="" columns={80} rows={24} />); expect(app.lastFrame()).toContain("1/1 selected"); });
  it("renders Raw with plain props", () => { const app = render(<Raw matches={emptyMatches} cursor={0} active={undefined} candidateIndex={0} progress="" columns={80} rows={24} />); expect(app.lastFrame()).toContain("RAW choices"); });
  it("keeps Photos and Preview controls visible after long dynamic text", () => {
    const photos = render(<Frame title="Photos" columns={80} rows={24}><Photos selected={1} total={1} filter={"f".repeat(300)} items={[]} cursor={0} progress="" columns={80} rows={24} /></Frame>);
    expect(photos.lastFrame()).toContain("↑↓ move   Space select   J JPEG   T TIFF");
    photos.unmount();
    const failure = { ok: false as const, photoId: "p1", failure: { photoId: "p1", sourcePath: "/source/a.jpg", stage: "decode" as const, message: "failure".repeat(100), retryable: true }, warnings: [] };
    const preview = render(<Frame title="Preview" columns={80} rows={24}><Preview previews={[failure]} cursor={0} progress={"progress".repeat(100)} frame={0} columns={80} rows={24} /></Frame>);
    expect(preview.lastFrame()).toContain("r retry   d deselect");
    preview.unmount();
  });
  it("renders Preview with plain props", () => { const app = render(<Preview previews={[]} cursor={0} progress="" frame={0} columns={80} rows={24} />); expect(app.lastFrame()).toContain("Generating previews"); });
  it("renders Summary with plain props", () => { const app = render(<Summary previews={[]} matches={emptyMatches} matchWarnings={[]} scan={null} photos={[]} estimate={{ status: "pending" }} columns={80} rows={24} />); expect(app.lastFrame()).toContain("Ready: 0 photos"); });
  it("renders Output with plain props", () => { const app = render(<Output value="/out.zip" cursor={0} progress="" columns={80} />); expect(app.lastFrame()).toContain("Output path"); });
  it("renders Writing with plain props", () => { const app = render(<Writing progress="" frame={0} columns={80} />); expect(app.lastFrame()).toContain("Writing package"); });
  it("renders Done with plain props", () => { const app = render(<Done progress="Created /out.zip" columns={80} />); expect(app.lastFrame()).toContain("Enter to exit"); });
  it("renders ErrorScreen with plain props", () => { const app = render(<ErrorScreen error="failure" columns={80} />); expect(app.lastFrame()).toContain("Error: failure"); });
  it("renders ConfirmPrompt with plain props", () => { const app = render(<ConfirmPrompt prompt="Continue?" columns={80} />); expect(app.lastFrame()).toContain("Continue?"); });
  it("renders ManualPath with plain props", () => { const app = render(<ManualPath value="/raw.nef" cursor={3} columns={80} />); expect(app.lastFrame()).toContain("Manual RAW file path"); });
});
