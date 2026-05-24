/**
 * Lint rule: check that a specific category exists on Wikimedia Commons.
 *
 * This rule is synchronous and pure — the caller (`useLintResults`) is
 * responsible for fetching the existence result from the API and passing it
 * as the `exists` parameter.
 */

import type { LintIssue } from '../types';

/**
 * Checks whether a specific category exists on Wikimedia Commons.
 *
 * @param category - The category name (without the `Category:` prefix).
 * @param exists   - Whether the category exists on Commons (pre-fetched by the caller).
 * @param imageId  - ID of the image being checked.
 * @returns An error `LintIssue` if the category does not exist, otherwise `null`.
 */
export function checkCategoryExists(
  category: string,
  exists: boolean,
  imageId: string,
): LintIssue | null {
  if (!exists) {
    return {
      severity: 'error',
      code: 'category-not-found',
      message: `The category "${category}" does not exist on Wikimedia Commons. Check the spelling or create the category first.`,
      imageId,
    };
  }

  return null;
}
