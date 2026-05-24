/**
 * Public API for the lint subsystem.
 *
 * Re-exports all types, helpers, and rules from their individual modules, and
 * defines the rule registries consumed by `useLintResults`:
 *
 * - `SYNC_LINT_RULES`  — rules that run synchronously on each render.
 * - `ASYNC_LINT_RULES` — rules that perform async work (e.g. API calls) and
 *                        receive all images at once for efficient batching.
 *
 * To add a new synchronous rule:
 * 1. Create `rules/checkYourRule.ts` (and a matching `.test.ts`).
 * 2. Export it from this file.
 * 3. Append it to `SYNC_LINT_RULES`.
 *
 * To add a new async rule:
 * 1. Create `rules/checkYourAsyncRule.ts` (and a matching `.test.ts`).
 * 2. Export it from this file.
 * 3. Append it to `ASYNC_LINT_RULES`.
 */

export type { LintSeverity, LintIssue, LintRule, RenderedText, AsyncLintRule } from './types';

export { extractCategories } from './extractCategories';
export { checkNoDescription } from './rules/checkNoDescription';
export { checkNoCategories } from './rules/checkNoCategories';
export { checkCategoryExists } from './rules/checkCategoryExists';
export { checkCategoriesRule } from './rules/checkCategoriesRule';

import type { LintRule, AsyncLintRule } from './types';
import { checkNoDescription } from './rules/checkNoDescription';
import { checkNoCategories } from './rules/checkNoCategories';
import { checkCategoriesRule } from './rules/checkCategoriesRule';

/**
 * All synchronous lint rules that apply to every image.
 *
 * Rules are executed in order by `useLintResults`. Each rule receives a single
 * image's wikitext and returns one issue or `null`.
 */
export const SYNC_LINT_RULES: LintRule[] = [checkNoDescription, checkNoCategories];

/**
 * All asynchronous lint rules that apply to the full set of images.
 *
 * Rules are debounced and run together by `useLintResults`. Each rule receives
 * all images' rendered texts and may make external API calls.
 */
export const ASYNC_LINT_RULES: AsyncLintRule[] = [checkCategoriesRule];
