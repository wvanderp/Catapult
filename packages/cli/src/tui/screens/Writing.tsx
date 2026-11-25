import React from "react";
import { Text } from "ink";
/**
 *
 * @param root0
 * @param root0.progress
 * @param root0.frame
 * @param root0.columns
 */
/**
 * Render the Writing screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.progress Supplied progress value.
 * @param root0.frame Supplied frame value.
 * @param root0.columns Supplied columns value.
 * @returns The rendered screen fragment.
 */
export function Writing({ progress, frame, columns }: { progress: string; frame: number; columns: number }): React.JSX.Element { return <Text>{(progress || `Writing package ${"·".repeat((frame % 3) + 1)}`).slice(0, columns)}</Text>; }
