import React from "react";
import { Text } from "ink";
import { ListViewport } from "../ListViewport.js";
import type { PreviewResult } from "../../types.js";
/**
 *
 * @param root0
 * @param root0.previews
 * @param root0.cursor
 * @param root0.progress
 * @param root0.frame
 * @param root0.columns
 * @param root0.rows
 */
/**
 * Render the Preview screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.previews Supplied previews value.
 * @param root0.cursor Supplied cursor value.
 * @param root0.progress Supplied progress value.
 * @param root0.frame Supplied frame value.
 * @param root0.columns Supplied columns value.
 * @param root0.rows Supplied rows value.
 * @returns The rendered screen fragment.
 */
export function Preview({ previews, cursor, progress, frame, columns, rows }: { previews: PreviewResult[]; cursor: number; progress: string; frame: number; columns: number; rows: number }): React.JSX.Element { return <><Text>{(progress || `Generating previews (${["|", "/", "—", "\\"][frame % 4]})`).slice(0, columns)}</Text><ListViewport items={previews} cursor={cursor} height={Math.max(1, Math.min(8, rows - 5))} renderRow={(result, _index, active) => <Text color={result.ok ? "green" : "red"}>{`${active ? "› " : "  "}${result.photoId}: ${result.ok ? "ready" : result.failure.message}`.slice(0, columns)}</Text>} /><Text>r retry   d deselect</Text></>; }
