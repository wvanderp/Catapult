/**
 * Async lint rule: check that every category referenced in the wikitext
 * actually exists on Wikimedia Commons.
 *
 * All images are batched into a single API request so only one network round-
 * trip is made regardless of how many images or categories there are.
 * If the API is unreachable the rule returns no issues to avoid flooding the
 * user with false positives.
 */

import type { AsyncLintRule, LintIssue } from '../types';
import { extractCategories } from '../extractCategories';
import { checkCategoryExists } from './checkCategoryExists';
import { checkCategoriesExist } from '../../wikimediaApi';

/**
 * Verifies that every `[[Category:…]]` link used across all images points to
 * a real category on Wikimedia Commons.
 *
 * Internally:
 * 1. Collects unique category names from all rendered wikitexts.
 * 2. Makes **one** batched API call for the entire set.
 * 3. Maps the results back to per-image `LintIssue` errors.
 *
 * @param renderedTexts - All images' rendered wikitexts.
 * @returns A promise resolving to error issues for every missing category.
 */
export const checkCategoriesRule: AsyncLintRule = async (renderedTexts): Promise<LintIssue[]> => {
  // ── 1. Collect unique categories across all images ──────────────────────────
  const allCategories = new Set<string>();
  for (const { wikitext } of renderedTexts) {
    for (const category of extractCategories(wikitext)) {
      allCategories.add(category);
    }
  }

  if (allCategories.size === 0) return [];

  // ── 2. Single batched API call ──────────────────────────────────────────────
  let existence: Record<string, boolean>;
  try {
    existence = await checkCategoriesExist([...allCategories]);
  } catch {
    // Network or API failure — return no issues rather than flooding the user
    // with false positives from a temporary outage.
    return [];
  }

  // ── 3. Build per-image issues from the existence map ───────────────────────
  const issues: LintIssue[] = [];
  for (const { id, wikitext } of renderedTexts) {
    for (const category of extractCategories(wikitext)) {
      const exists = existence[category] ?? true; // unknown → assume exists (safe default)
      const issue = checkCategoryExists(category, exists, id);
      if (issue !== null) {
        issues.push(issue);
      }
    }
  }
  return issues;
};
