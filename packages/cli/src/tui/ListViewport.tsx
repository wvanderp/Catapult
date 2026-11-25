import React from "react";
import { Text } from "ink";

/**
 * Render a bounded list window that keeps the active row visible.
 *
 * @param root0 Component properties.
 * @param root0.items Items in the complete logical list.
 * @param root0.cursor Index of the active item.
 * @param root0.height Maximum number of visible rows.
 * @param root0.renderRow Renderer for one item and its active state.
 * @returns The visible rows for the current viewport.
 */
export function ListViewport<T>({ items, cursor, height, renderRow }: { items: T[]; cursor: number; height: number; renderRow: (item: T, index: number, active: boolean) => React.ReactNode }): React.JSX.Element {
  const safeCursor = Math.max(0, Math.min(cursor, items.length - 1));
  const start = Math.max(0, Math.min(safeCursor - height + 1, items.length - height));
  return <>{items.slice(start, start + height).map((item, offset) => <Text key={offset}>{renderRow(item, start + offset, start + offset === safeCursor)}</Text>)}</>;
}
