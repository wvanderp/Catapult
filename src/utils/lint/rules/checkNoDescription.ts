/**
 * Lint rule: check that the wikitext contains a non-empty description.
 *
 * Reports an error when:
 * - The `|description=` field is completely absent.
 * - The field is present but blank (only whitespace).
 * - The field contains the unresolved `<<<missing>>>` placeholder.
 */

import type { LintIssue, LintRule } from '../types';

/** Sentinel string inserted by the template engine for unresolved variables. */
const MISSING_PLACEHOLDER = '<<<missing>>>';

/**
 * Checks that the wikitext contains a non-empty description.
 *
 * @param wikitext - Rendered wikitext for the image.
 * @param imageId  - ID of the image being checked.
 * @returns An error `LintIssue` if the description is missing/empty, otherwise `null`.
 */
export const checkNoDescription: LintRule = (wikitext, imageId): LintIssue | null => {
  // Capture everything to end-of-line after |description=
  // Using [^\n]* instead of [^|{}]* so the {{en|1=...}} wrapper is included.
  const match = /\|\s*description\s*=([^\n]*)/i.exec(wikitext);

  if (!match) {
    return {
      severity: 'error',
      code: 'no-description',
      message: 'No description found. Add a description so viewers know what appears in the image.',
      imageId,
    };
  }

  const value = match[1]?.trim() ?? '';

  if (value === '' || value.includes(MISSING_PLACEHOLDER)) {
    return {
      severity: 'error',
      code: 'no-description',
      message: 'The description is empty. Fill it in so viewers know what appears in the image.',
      imageId,
    };
  }

  return null;
};
