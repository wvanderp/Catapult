/**
 * Standalone Wikimedia Commons REST API utilities.
 *
 * Pure async functions with no React dependencies — safe to call from hooks,
 * utility modules, and tests alike.
 */

const API_URL = 'https://commons.wikimedia.org/w/api.php';

/**
 * Checks whether a list of category names exist on Wikimedia Commons.
 *
 * Uses the public MediaWiki query API (no authentication required).
 * Categories are batched into a single request using pipe-separated titles.
 * A category is considered non-existent when the API returns a `missing`
 * property on the corresponding page entry.
 *
 * @param categories - Array of category names (without the `Category:` prefix).
 * @returns A map of category name → `true` (exists) / `false` (does not exist).
 * @throws {Error} If the HTTP request fails (non-2xx status).
 */
export async function checkCategoriesExist(
  categories: string[],
): Promise<Record<string, boolean>> {
  if (categories.length === 0) return {};

  // Build pipe-separated title list with Category: prefix
  const titles = categories.map((c) => `Category:${c}`).join('|');

  const parameters = new URLSearchParams({
    action: 'query',
    titles,
    format: 'json',
    origin: '*',
  });

  const response = await fetch(`${API_URL}?${parameters.toString()}`);

  if (!response.ok) {
    throw new Error(`Category check failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    query?: {
      pages?: Record<string, { title: string; missing?: boolean }>;
    };
  };

  const pages = data?.query?.pages ?? {};
  const result: Record<string, boolean> = {};

  for (const page of Object.values(pages)) {
    // Strip "Category:" prefix to get back the plain name
    const name = page.title.replace(/^Category:/i, '');
    result[name] = !('missing' in page);
  }

  // Any category that didn't appear in the response is treated as non-existent
  for (const category of categories) {
    if (!(category in result)) {
      result[category] = false;
    }
  }

  return result;
}
