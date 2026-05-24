/**
 * @deprecated Import directly from `./lint` instead.
 *
 * This module is a re-export barrel kept for backward compatibility.
 * All logic has been moved to `src/utils/lint/`.
 */

export type { LintSeverity, LintIssue, LintRule } from './lint';
export {
  extractCategories,
  checkNoDescription,
  checkNoCategories,
  checkCategoryExists,
  SYNC_LINT_RULES,
} from './lint';
