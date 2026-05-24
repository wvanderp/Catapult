/**
 * Shared types for the Wikimedia Commons wikitext lint system.
 *
 * All lint rules follow the `LintRule` interface: a pure function that
 * inspects rendered wikitext and returns a single `LintIssue` describing a
 * problem, or `null` if no issue was found.
 */

/** Severity level of a lint finding. */
export type LintSeverity = 'error' | 'warning';

/**
 * A single lint finding produced by a lint rule.
 */
export interface LintIssue {
  /** How serious the issue is. */
  severity: LintSeverity;
  /** Short machine-readable identifier for the rule that produced this issue. */
  code: string;
  /** Human-friendly explanation of the problem. */
  message: string;
  /** ID of the image this issue belongs to. */
  imageId: string;
}

/**
 * The uniform interface every synchronous lint rule must implement.
 *
 * @param wikitext - The fully-rendered wikitext for the image.
 * @param imageId  - The ID of the image being checked.
 * @returns A `LintIssue` if a problem was found, or `null` if the check passed.
 */
export type LintRule = (wikitext: string, imageId: string) => LintIssue | null;

/**
 * A rendered image ready to be inspected by lint rules.
 */
export interface RenderedText {
  /** The ID of the image. */
  id: string;
  /** The fully-rendered wikitext for the image. */
  wikitext: string;
}

/**
 * The interface for asynchronous lint rules that may batch work across images.
 *
 * Unlike `LintRule`, an async rule receives all images at once so it can make
 * a single batched external request (e.g. one API call for all categories)
 * instead of one request per image.
 *
 * @param renderedTexts - All images' rendered wikitexts.
 * @returns A promise resolving to all issues found (possibly an empty array).
 */
export type AsyncLintRule = (renderedTexts: RenderedText[]) => Promise<LintIssue[]>;
