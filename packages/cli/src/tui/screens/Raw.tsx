import React from "react";
import { Text } from "ink";
import stringWidth from "string-width";
import { ListViewport } from "../ListViewport.js";
import type { MatchSession, PhotoGroup } from "../../types.js";

/**
 * Wrap a labelled value without dropping any part of its text.
 *
 * @param label Prefix shown on the first line.
 * @param value Value to wrap.
 * @param width Terminal width.
 * @returns All lines needed to display the value.
 */
function wrapValue(label: string, value: string, width: number): string[] {
  const safeWidth = Math.max(1, width);
  const characters = [...value];
  const lines: string[] = [];
  let line = label;
  let lineWidth = stringWidth(label);
  for (const character of characters) {
    const characterWidth = stringWidth(character);
    if (lineWidth + characterWidth > safeWidth) {
      lines.push(line);
      line = "";
      lineWidth = 0;
    }
    line += character;
    lineWidth += characterWidth;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Format a nullable file timestamp.
 *
 * @param value File timestamp, if available.
 * @returns ISO date-time or an unknown marker.
 */
function dateTime(value: Date | null): string { return value ? value.toISOString() : "unknown"; }

/**
 * Render RAW-match details, preserving complete active file paths.
 *
 * @param root0 Component props.
 * @param root0.matches Supplied matches value.
 * @param root0.warnings Match warnings to display.
 * @param root0.cursor Supplied cursor value.
 * @param root0.active Supplied active value.
 * @param root0.candidateIndex Supplied candidateIndex value.
 * @param root0.progress Supplied progress value.
 * @param root0.columns Supplied terminal width.
 * @param root0.rows Available terminal rows.
 * @returns The rendered screen fragment.
 */
export function Raw({ matches, warnings = [], cursor, active, candidateIndex, progress, columns, rows }: { matches: MatchSession["photos"]; warnings?: string[]; cursor: number; active: PhotoGroup | undefined; candidateIndex: number; progress: string; columns: number; rows: number }): React.JSX.Element {
  const ready = matches.filter((photo) => photo.rawMatch.state === "accepted" || photo.rawMatch.state === "disabled" || (photo.rawMatch.state === "missing" && photo.rawMatch.decision === "accept-missing")).length;
  const selectedCandidate = active?.rawMatch.candidates[candidateIndex] ?? active?.rawMatch.chosen ?? null;
  const original = active?.chosenOriginal;
  const originalPath = original ? wrapValue("Original: ", original.path, columns) : ["Original: unresolved"];
  const candidatePath = selectedCandidate ? wrapValue("Active RAW: ", selectedCandidate.path, columns) : ["Active RAW: none"];
  const photoHeight = Math.max(1, Math.min(2, rows - 10, rows - 2 - originalPath.length - candidatePath.length - 8 - (progress ? 1 : 0)));
  const detailLines = originalPath.length + candidatePath.length + (original ? 2 : 0) + (selectedCandidate ? 2 : 0) + (active ? 1 : 0);
  const reservedRows = 1 + photoHeight + detailLines + 4 + (progress ? 1 : 0);
  const candidateHeight = Math.max(1, Math.min(active?.rawMatch.candidates.length ?? 0, rows - 2 - reservedRows));

  return <>
    <Text>{`RAW choices: ${ready}/${matches.length} resolved`}</Text>
    {warnings.slice(0, 1).map((warning) => <Text key="raw-warning" color="yellow">{`Warning: ${warning}`.slice(0, columns)}</Text>)}
    <ListViewport items={matches} cursor={cursor} height={photoHeight} renderRow={(photo, _index, focused) => <Text color={focused ? "cyan" : undefined}>{`${focused ? "› " : "  "}${photo.chosenOriginal?.filename ?? "unresolved"}  ${photo.rawMatch.state}${photo.rawMatch.decision ? ` (${photo.rawMatch.decision})` : ""}`}</Text>} />
    {active ? <>
      {originalPath.map((line, index) => <Text key={`original-${index}`}>{line}</Text>)}
      {original ? <>
        <Text>{`Original created: ${dateTime(original.createdAt)} | size: ${original.snapshot.size} B`}</Text>
        <Text>{`Original modified: ${dateTime(original.modifiedAt)}`}</Text>
      </> : null}
      {candidatePath.map((line, index) => <Text key={`candidate-${index}`} color="cyan">{line}</Text>)}
      {selectedCandidate ? <>
        <Text>{`RAW created: ${dateTime(selectedCandidate.createdAt)} | size: ${selectedCandidate.snapshot.size} B`}</Text>
        <Text>{`RAW modified: ${dateTime(selectedCandidate.modifiedAt)} | Δ ${timeDifference(selectedCandidate.modifiedAt.valueOf() - (original?.modifiedAt.valueOf() ?? selectedCandidate.modifiedAt.valueOf()))}`}</Text>
      </> : null}
      {active.rawMatch.candidates.length > 0 ? <>
        <Text>{`Candidates (${candidateIndex + 1}/${active.rawMatch.candidates.length})`}</Text>
        <ListViewport items={active.rawMatch.candidates} cursor={candidateIndex} height={candidateHeight} renderRow={(candidate, index, focused) => <Text color={focused ? "cyan" : undefined}>{`${focused ? "›" : " "} ${index + 1}. ${candidate.filename}`}</Text>} />
      </> : <Text>No RAW candidates found.</Text>}
    </> : null}
    <Text>↑↓ photo   ←→ candidate</Text>
    <Text>a accept   A accept folder   m manual</Text>
    <Text>p parent   x missing   X all missing   d deselect</Text>
    <Text>Enter continue</Text>
    {progress ? <Text>{progress}</Text> : null}
  </>;
}

/**
 * Format a signed difference between two modification times.
 *
 * @param milliseconds Time difference in milliseconds.
 * @returns Compact signed time difference.
 */
function timeDifference(milliseconds: number): string {
  const seconds = Math.round(Math.abs(milliseconds) / 1000);
  const sign = milliseconds < 0 ? "−" : "+";
  if (seconds < 60) return `${sign}${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${sign}${minutes}m ${seconds % 60}s` : `${sign}${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
