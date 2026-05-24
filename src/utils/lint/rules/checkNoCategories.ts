/**
 * Lint rule: check that the wikitext includes at least one category.
 *
 * Reports a warning when no `[[Category:...]]` link is found. Categories help
 * other people discover the file on Wikimedia Commons.
 */

import type { LintIssue, LintRule } from '../types';
import { extractCategories } from '../extractCategories';

/**
 * Checks that the wikitext includes at least one category.
 *
 * @param wikitext - Rendered wikitext for the image.
 * @param imageId  - ID of the image being checked.
 * @returns A warning `LintIssue` if no categories are present, otherwise `null`.
 */
export const checkNoCategories: LintRule = (wikitext, imageId): LintIssue | null => {
  const categories = extractCategories(wikitext);

  if (categories.length === 0) {
    return {
      severity: 'warning',
      code: 'no-categories',
      message: 'No categories added. Categories help others discover this file on Wikimedia Commons.',
      imageId,
    };
  }

  return null;
};
