import React from "react";
import { Text } from "ink";
import { ListViewport } from "../ListViewport.js";
import type { TuiPhoto } from "../state.js";
import { fitTerminalText } from "../app.js";
/**
 *
 * @param root0
 * @param root0.selected
 * @param root0.total
 * @param root0.filter
 * @param root0.items
 * @param root0.cursor
 * @param root0.progress
 * @param root0.columns
 * @param root0.rows
 */
/**
 * Render the Photos screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.selected Supplied selected value.
 * @param root0.total Supplied total value.
 * @param root0.filter Supplied filter value.
 * @param root0.items Supplied items value.
 * @param root0.cursor Supplied cursor value.
 * @param root0.progress Supplied progress value.
 * @param root0.columns Supplied columns value.
 * @param root0.rows Supplied rows value.
 * @returns The rendered screen fragment.
 */
export function Photos({ selected, total, filter, items, cursor, progress, columns, rows }: { selected: number; total: number; filter: string; items: TuiPhoto[]; cursor: number; progress: string; columns: number; rows: number }): React.JSX.Element { return <><Text>{fitTerminalText(`Photos: ${selected}/${total} selected  •  filter: ${filter || "(none)"}`, columns)}</Text><Text>↑↓ move   Space select   J JPEG   T TIFF</Text><ListViewport items={items} cursor={cursor} height={Math.max(1, Math.min(8, rows - 5))} renderRow={(photo, _index, active) => <Text color={active ? "cyan" : undefined}>{fitTerminalText(`${active ? "›" : " "} [${photo.selected ? "x" : " "}] ${photo.chosenOriginal?.filename ?? photo.suggestedOriginal?.filename ?? "Choose JPEG/TIFF"}  ${photo.chosenOriginal?.modifiedAt.toLocaleDateString() ?? "date unknown"}  ${photo.chosenOriginal?.snapshot.size ?? 0} B${photo.jpegCandidates.length + photo.tiffCandidates.length > 1 ? "  (choose original)" : ""}`, columns)}</Text>} />{progress ? <Text color="yellow">{fitTerminalText(progress, columns)}</Text> : null}</>; }
