/**
 * Extracts all template variable keys from a template string.
 * Looks for keys enclosed in <<<key>>> delimiters.
 *
 * @param template - Template string to extract keys from
 * @returns Array of unique key strings found in the template
 */
export function extractTemplateKeys(template: string): string[] {
  const regex = /<<<(.*?)>>>/g;
  const keys = new Set<string>();
  let match;
  while ((match = regex.exec(template)) !== null) {
    if (match[1]) {
      keys.add(match[1].trim());
    }
  }
  return [...keys];
}

/**
 * Get a nested value from an object using dot notation
 *
 * @param object - The object to get the value from
 * @param path - The dot-separated path to the value (e.g., "exif.DateTimeOriginal")
 * @returns The value at the path, or undefined if not found
 */
function getNestedValue(
  object: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = object;

  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Context object for template substitution.
 *
 * Structure:
 * - `exif`: EXIF data extracted from the image (accessed via <<<exif.fieldName>>>)
 * - `global`: Global variables that apply to all images (accessed via <<<global.fieldName>>>)
 * - `utility`: Utility information about the file (accessed via <<<utility.fieldName>>>)
 *   - `extension`: File extension without the dot (e.g., 'jpg', 'png')
 *   - `index`: Index of the file in the upload queue (1-based)
 *   - `date`: Formatted date from EXIF data (YYYY-MM-DD)
 *   - `dateTime`: Formatted datetime from EXIF data (YYYY-MM-DD HH:mm)
 * - Root-level keys: Per-image/local keys for substitution (accessed via <<<keyName>>>)
 *
 * Priority for non-prefixed keys: local (root) > global (implicit fallback)
 */
export interface TemplateContext {
  exif?: Record<string, unknown>;
  global?: Record<string, string>;
  utility?: {
    extension: string;
    index: number;
    date?: string;
    dateTime?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Apply a template with variable substitution, supporting nested paths.
 * Recursively resolves variables until no more substitutions can be made.
 *
 * @param template - The template string with <<<variable>>> placeholders
 * @param context - The context object containing nested objects and local keys
 * @param maxIterations - Maximum number of recursive iterations (default: 10)
 * @returns The template with all resolvable variables substituted
 *
 * @example
 * ```ts
 * const context = {
 *   exif: { DateTimeOriginal: '2024-01-15', Make: 'Canon' },
 *   global: { author: 'JohnDoe', license: 'CC-BY-SA' },
 *   utility: { extension: 'jpg', index: 0 },
 *   description: 'A beautiful sunset',  // local/per-image key
 * };
 * applyTemplate('<<<description>>> by <<<global.author>>> (<<<utility.extension>>>)', context);
 * ```
 */
export function applyTemplate(
  template: string,
  context: TemplateContext,
  maxIterations: number = 10,
): string {
  const regex = /<<<(.*?)>>>/g;
  const MISSING_PLACEHOLDER = "<<<missing>>>";

  console.log(context);

  let result = template;
  let previousResult = "";
  let iteration = 0;

  // Keep resolving until no more substitutions can be made or max iterations reached
  while (result !== previousResult && iteration < maxIterations) {
    previousResult = result;
    iteration++;

    result = result.replaceAll(regex, (fullMatch, key) => {
      const trimmedKey = (key as string).trim();

      // Use dynamic nested lookup for any dot-notation path
      const value = getNestedValue(
        context as Record<string, unknown>,
        trimmedKey,
      );
      if (value !== undefined && value !== null && value !== "") {
        return String(value).trim();
      }

      // On the last iteration, show missing placeholder
      // For intermediate iterations, keep the variable for potential resolution
      if (iteration === maxIterations) {
        return MISSING_PLACEHOLDER;
      }

      // Keep the variable unchanged for potential resolution in next iteration
      return fullMatch;
    });
  }

  // Final pass to mark any remaining unresolved variables as missing
  result = result.replaceAll(regex, () => MISSING_PLACEHOLDER);

  return result;
}
