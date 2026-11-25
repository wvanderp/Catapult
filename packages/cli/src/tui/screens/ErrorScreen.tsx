import React from "react";
import { Text } from "ink";
/**
 *
 * @param root0
 * @param root0.error
 * @param root0.columns
 */
/**
 * Render the ErrorScreen screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.error Supplied error value.
 * @param root0.columns Supplied columns value.
 * @returns The rendered screen fragment.
 */
export function ErrorScreen({ error, columns }: { error: string; columns: number }): React.JSX.Element { return <><Text color="red">{`Error: ${error}`.slice(0, columns)}</Text><Text>Enter to return and retry. Escape goes back.</Text></>; }
