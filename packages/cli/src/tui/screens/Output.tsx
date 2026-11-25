import React from "react";
import { Text } from "ink";
import { TextInput } from "../TextInput.js";
/**
 *
 * @param root0
 * @param root0.value
 * @param root0.cursor
 * @param root0.progress
 * @param root0.columns
 */
/**
 * Render the Output screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.value Supplied value value.
 * @param root0.cursor Supplied cursor value.
 * @param root0.progress Supplied progress value.
 * @param root0.columns Supplied columns value.
 * @returns The rendered screen fragment.
 */
export function Output({ value, cursor, progress, columns }: { value: string; cursor: number; progress: string; columns: number }): React.JSX.Element { return <><Text>Output path (must be outside source; existing files are never overwritten:</Text><TextInput value={value.slice(0, columns)} cursor={cursor} />{progress ? <Text color="yellow">{progress}</Text> : null}<Text>Enter to write.</Text></>; }
