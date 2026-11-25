import React from "react";
import { Text } from "ink";

/**
 * Editable single-line text with a visible insertion cursor.
 *
 * @param root0 Component properties.
 * @param root0.value Current text value.
 * @param root0.placeholder Text shown while the value is empty.
 * @param root0.width Maximum displayed width.
 * @param root0.cursor Insertion position in the value.
 * @returns A clipped text value with a cursor marker.
 */
export function TextInput({ value, placeholder = "", width = 72, cursor = value.length }: { value: string; placeholder?: string; width?: number; cursor?: number }): React.JSX.Element {
  if (value.length === 0) return <Text color="green">{placeholder}▏</Text>;
  const characters = [...value];
  const activeCursor = Math.max(0, Math.min(cursor, characters.length));
  const contentWidth = Math.max(1, width - 1);
  const start = Math.max(0, Math.min(activeCursor - contentWidth, characters.length - contentWidth));
  const visible = characters.slice(start, start + contentWidth);
  const insertionIndex = activeCursor - start;
  visible.splice(insertionIndex, 0, "▏");
  return <Text color="green">{visible.slice(0, width).join("")}</Text>;
}
