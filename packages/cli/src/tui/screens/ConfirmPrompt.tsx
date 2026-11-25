import React from "react";
import { Text } from "ink";
/**
 *
 * @param root0
 * @param root0.prompt
 * @param root0.columns
 */
/**
 * Render the ConfirmPrompt screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.prompt Supplied prompt value.
 * @param root0.columns Supplied columns value.
 * @returns The rendered screen fragment.
 */
export function ConfirmPrompt({ prompt, columns }: { prompt: string; columns: number }): React.JSX.Element { return <Text color="yellow">{prompt.slice(0, columns)}</Text>; }
