import React from "react";
import { Text } from "ink";
/**
 *
 * @param root0
 * @param root0.includeRaw
 * @param root0.includeSidecars
 * @param root0.photoCount
 * @param root0.progress
 */
/**
 * Render the Options screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.includeRaw Supplied includeRaw value.
 * @param root0.includeSidecars Supplied includeSidecars value.
 * @param root0.photoCount Supplied photoCount value.
 * @param root0.progress Supplied progress value.
 * @returns The rendered screen fragment.
 */
export function Options({ includeRaw, includeSidecars, photoCount, progress }: { includeRaw: boolean; includeSidecars: boolean; photoCount: number; progress: string }): React.JSX.Element { return <><Text>1  RAW collection: {includeRaw ? "on" : "off"}    2  Sidecars: {includeSidecars ? "on" : "off"}</Text><Text>{photoCount} photo groups found. Enter to continue.</Text>{progress ? <Text color="yellow">{progress}</Text> : null}</>; }
