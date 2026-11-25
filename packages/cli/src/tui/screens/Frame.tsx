import React from "react";
import { Box, Text } from "ink";
import { fitTerminalText } from "../app.js";

/**
 * Render the Frame screen fragment from supplied state and dimensions.
 *
 * @param root0 Component props.
 * @param root0.title Supplied title value.
 * @param root0.children Supplied children value.
 * @param root0.columns Supplied columns value.
 * @param root0.rows Supplied row count.
 * @returns The rendered screen fragment.
 */
export function Frame({ title, children, columns, rows }: { title: string; children: React.ReactNode; columns: number; rows: number }): React.JSX.Element {
  return <Box flexDirection="column" width={columns} height={rows} overflow="hidden"><Text bold color="cyan">{fitTerminalText(title, columns)}</Text>{sanitizeChildren(children, columns)}<Text dimColor>↑↓ move  Space select  Enter continue  Esc back/cancel</Text></Box>;
}

/**
 * Sanitize every text node at the screen boundary, including nested screen fragments.
 *
 * @param children Child nodes to sanitize.
 * @param columns Maximum display-cell width.
 * @returns Sanitized child nodes.
 */
function sanitizeChildren(children: React.ReactNode, columns: number): React.ReactNode {
  return React.Children.map(children, (child) => {
    return typeof child === "string"
      ? fitTerminalText(child, columns)
      : (React.isValidElement<{ children?: React.ReactNode }>(child)
        ? React.cloneElement(child, undefined, sanitizeChildren(child.props.children, columns))
        : child);
  });
}
