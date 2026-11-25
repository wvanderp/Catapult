import React from "react";
import { Text } from "ink";
/**
 *
 * @param root0
 * @param root0.progress
 * @param root0.columns
 */
/**
 * Render the Done screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.progress Supplied progress value.
 * @param root0.columns Supplied columns value.
 * @returns The rendered screen fragment.
 */
export function Done({ progress, columns }: { progress: string; columns: number }): React.JSX.Element { return <><Text color="green">{progress.slice(0, columns)}</Text><Text>Enter to exit.</Text></>; }
