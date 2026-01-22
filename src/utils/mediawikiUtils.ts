/**
 * Characters that are forbidden in MediaWiki titles.
 * These are replaced with safe alternatives.
 * See: https://www.mediawiki.org/wiki/Manual:Page_title
 */
const FORBIDDEN_CHARS: Record<string, string> = {
  "#": "-", // Fragment identifier
  "<": "-", // HTML
  ">": "-", // HTML
  "[": "(", // Wikilink syntax
  "]": ")", // Wikilink syntax
  "{": "(", // Template syntax
  "}": ")", // Template syntax
  "|": "-", // Pipe separator
  ":": "-", // Namespace separator (forbidden in file titles)
};

/**
 * Normalize a filename to match MediaWiki's title normalization rules.
 *
 * MediaWiki applies the following transformations to file titles:
 * 1. Replaces forbidden characters (: # < > [ ] { } |) with safe alternatives
 * 2. Replaces spaces with underscores
 * 3. Collapses multiple consecutive underscores into one
 * 4. Trims leading and trailing underscores
 * 5. Capitalizes the first character (Title::capitalize behavior for NS_FILE)
 *
 * This ensures the filename passes MediaWiki's checkBadFileName validation.
 * 
 * @param filename - The original filename to normalize
 * @returns The normalized filename that will pass MediaWiki validation
 * @example
 * normalizeMediaWikiFilename("my image.jpg") // "My_image.jpg"
 * normalizeMediaWikiFilename("photo 12:30:45.png") // "Photo_12-30-45.png"
 */
export function normalizeMediaWikiFilename(filename: string): string {
  if (!filename) {
    return filename;
  }

  let normalized = filename;

  // Replace forbidden characters with safe alternatives
  for (const [forbidden, replacement] of Object.entries(FORBIDDEN_CHARS)) {
    normalized = normalized.replaceAll(forbidden, replacement);
  }

  // Replace spaces with underscores
  normalized = normalized.replaceAll(" ", "_");

  // Collapse multiple consecutive underscores into one
  normalized = normalized.replaceAll(/_+/g, "_");

  // Trim leading and trailing underscores (but preserve the extension)
  // Split into name and extension first
  const lastDotIndex = normalized.lastIndexOf(".");
  if (lastDotIndex > 0) {
    const name = normalized.slice(0, lastDotIndex);
    const extension = normalized.slice(lastDotIndex);
    normalized = name.replaceAll(/^_+|_+$/g, "") + extension;
  } else {
    normalized = normalized.replaceAll(/^_+|_+$/g, "");
  }

  // Capitalize the first character (MediaWiki Title::capitalize behavior)
  if (normalized.length > 0) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return normalized;
}
