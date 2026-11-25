import React from "react";
import { Text } from "ink";
import { TextInput } from "../TextInput.js";
/**
 *
 * @param root0
 * @param root0.value
 * @param root0.cursor
 * @param root0.columns
 */
/**
 * Render the ManualPath screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.value Supplied value value.
 * @param root0.cursor Supplied cursor value.
 * @param root0.columns Supplied columns value.
 * @returns The rendered screen fragment.
 */
export function ManualPath({ value, cursor, columns }: { value: string; cursor: number; columns: number }): React.JSX.Element { return <><Text>Manual RAW file path:</Text><TextInput value={value.slice(0, columns)} cursor={cursor} placeholder="Type a candidate path, then Enter" /></>; }
