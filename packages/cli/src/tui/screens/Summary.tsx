import React from "react";
import { Text } from "ink";
import type { MatchSession, PreviewResult, ScanResult } from "../../types.js";
import type { TuiPhoto } from "../state.js";
import type { EstimateState } from "../state.js";

/**
 * Format byte counts as compact binary units.
 *
 * @param bytes Number of bytes.
 * @returns Human-readable size.
 */
function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let size = bytes;
    let unit = -1;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
    return `${size.toFixed(1)} ${units[unit]}`;
}

/**
 * Render the Summary screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.previews Preview results.
 * @param root0.matches Selected match results.
 * @param root0.matchWarnings Match session warnings.
 * @param root0.scan Scan results and warnings.
 * @param root0.photos Selected source photos.
 * @param root0.estimate State of the ZIP size estimate.
 * @param root0.columns Terminal columns.
 * @param root0.rows Available terminal rows.
 * @returns The rendered screen fragment.
 */
export function Summary({ previews, matches, matchWarnings, scan, photos, estimate, columns, rows }: { previews: PreviewResult[]; matches: MatchSession["photos"]; matchWarnings: string[]; scan: ScanResult | null; photos: TuiPhoto[]; estimate: EstimateState; columns: number; rows: number }): React.JSX.Element {
  const fit = (value: string): string => value.slice(0, columns);
  const sourceBytes = matches.reduce((total, photo) => total + (photo.chosenOriginal?.snapshot.size ?? 0) + (photo.rawMatch.chosen?.snapshot.size ?? 0) + photo.sidecarMatches.reduce((sidecarTotal, sidecar) => sidecarTotal + sidecar.snapshot.size, 0), 0);
  const warnings = [...new Set([...(scan?.warnings ?? []), ...matchWarnings])].slice(0, Math.min(3, rows));
  const oversizedCount = photos.filter((photo) => photo.selected && (photo.chosenOriginal?.snapshot.size ?? 0) > 100 * 1024 * 1024).length;
  let estimatedOutput = "calculating…";
  if (estimate.status === "ready") estimatedOutput = formatBytes(estimate.bytes);
  else if (estimate.status === "failed") estimatedOutput = "unavailable";
  return <><Text>{fit(`Ready: ${previews.filter((result) => result.ok).length} photos | RAW: ${matches.filter((photo) => photo.rawMatch.chosen).length} | sidecars: ${matches.reduce((total, photo) => total + photo.sidecarMatches.length, 0)} | accepted missing: ${matches.filter((photo) => photo.rawMatch.state === "missing" && photo.rawMatch.decision === "accept-missing").length}`)}</Text><Text>{fit(`Estimated output: ${estimatedOutput} | source files: ${formatBytes(sourceBytes)}`)}</Text>{estimate.status === "failed" ? <Text color="yellow">{fit(`Estimate unavailable: ${estimate.message}`)}</Text> : null}<Text>{fit("Full source paths are included in the ZIP.")}</Text>{previews.some((result) => result.ok && result.multiPage) ? <Text>{fit("Multipage TIFFs use their first page.")}</Text> : null}{oversizedCount > 0 ? <Text>{fit(`Warning: ${oversizedCount} original(s) exceed 100 MB.`)}</Text> : null}{warnings.map((warning, index) => <Text key={`warning-${index}`} color="yellow">{fit(`Warning: ${warning}`)}</Text>)}<Text>{fit("Enter to choose output path.")}</Text></>;
}
