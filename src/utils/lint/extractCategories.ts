/**
 * Utility for extracting Wikimedia Commons category names from wikitext.
 *
 * Finds all `[[Category:XYZ]]` links (case-insensitive "Category" prefix)
 * and returns the category names without the prefix, de-duplicated and trimmed.
 */

/**
 * Extract all category names from a wikitext string.
 *
 * Matches `[[Category:Name]]` and `[[Category:Name|SortKey]]` syntax.
 * The `Category:` prefix comparison is case-insensitive, matching MediaWiki
 * behaviour.
 *
 * @param wikitext - The rendered wikitext to search.
 * @returns Array of category names (without the `Category:` prefix), de-duplicated.
 */
export function extractCategories(wikitext: string): string[] {
  const regex = /\[\[Category:([^\]|]+)(?:\|[^\]]*)?\]\]/gi;
  const categories = new Set<string>();
  let match;
  while ((match = regex.exec(wikitext)) !== null) {
    const name = match[1]?.trim();
    if (name) {
      categories.add(name);
    }
  }
  return [...categories];
}
