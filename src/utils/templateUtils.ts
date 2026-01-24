/**
 * Extracts all template variable keys from a template string.
 * Looks for keys enclosed in <<<key>>> delimiters.
 * Excludes if/endif control flow keywords from extraction.
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
      const trimmed = match[1].trim();
      // Skip control flow keywords: if {variable} and endif
      if (trimmed.startsWith("if {") || trimmed === "endif") {
        // Extract the variable name from if statements for key tracking
        const ifMatch = /^if\s*\{(.+)\}$/.exec(trimmed);
        if (ifMatch && ifMatch[1]) {
          keys.add(ifMatch[1].trim());
        }
        continue;
      }
      keys.add(trimmed);
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
 * Check if a value is considered "truthy" for conditional inclusion.
 * A value is truthy if it is defined, not null, and not an empty string.
 *
 * @param value - The value to check
 * @returns True if the value is truthy, false otherwise
 */
function isTruthyValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string" && value.trim() === "") {
    return false;
  }
  return true;
}

/**
 * Process conditional statements in a template.
 * Supports nested <<<if {variable}>>>...<<<endif>>> blocks.
 *
 * The conditional block is included only if the variable is defined and not empty.
 * Variables are resolved using the same dot notation as regular template variables.
 *
 * @param template - The template string containing conditional blocks
 * @param context - The context object for variable resolution
 * @returns The template with conditional blocks processed
 *
 * @example
 * ```ts
 * const template = '<<<if {author}>>>Author: <<<author>>><<<endif>>>';
 * const result = processConditionals(template, { author: 'John' });
 * // Returns: 'Author: <<<author>>>'
 *
 * const result2 = processConditionals(template, { author: '' });
 * // Returns: ''
 * ```
 */
export function processConditionals(
  template: string,
  context: TemplateContext,
): string {
  const IF_START = "<<<if {";
  const IF_END = "}>>>";
  const ENDIF = "<<<endif>>>";

  /**
   * Parse and process a template string, handling nested conditionals recursively.
   *
   * @param input - The string to process
   * @returns Processed string with conditionals evaluated
   */
  function parse(input: string): string {
    let result = "";
    let pos = 0;

    while (pos < input.length) {
      // Look for the next <<<if {
      const ifStart = input.indexOf(IF_START, pos);

      if (ifStart === -1) {
        // No more conditionals, append rest of string
        result += input.slice(pos);
        break;
      }

      // Append everything before the if
      result += input.slice(pos, ifStart);

      // Find the end of the if opening tag: }>>>
      const variableStart = ifStart + IF_START.length;
      const variableEnd = input.indexOf(IF_END, variableStart);

      if (variableEnd === -1) {
        // Malformed - no closing }>>> found, treat as literal
        result += input.slice(ifStart);
        break;
      }

      const variableName = input.slice(variableStart, variableEnd).trim();
      const contentStart = variableEnd + IF_END.length;

      // Find the matching <<<endif>>> by counting nested ifs
      let depth = 1;
      let searchPos = contentStart;
      let endifPos = -1;

      while (depth > 0 && searchPos < input.length) {
        const nextIf = input.indexOf(IF_START, searchPos);
        const nextEndif = input.indexOf(ENDIF, searchPos);

        if (nextEndif === -1) {
          // No matching endif found - malformed template
          break;
        }

        // Check which comes first
        if (nextIf !== -1 && nextIf < nextEndif) {
          // Found nested if - increase depth
          depth++;
          searchPos = nextIf + IF_START.length;
        } else {
          // Found endif
          depth--;
          if (depth === 0) {
            endifPos = nextEndif;
          }
          searchPos = nextEndif + ENDIF.length;
        }
      }

      if (endifPos === -1) {
        // No matching endif found - treat the if start as literal
        result += input.slice(ifStart, contentStart);
        pos = contentStart;
        continue;
      }

      // Extract the content between if and endif
      const content = input.slice(contentStart, endifPos);

      // Check if the variable is truthy
      const value = getNestedValue(
        context as Record<string, unknown>,
        variableName,
      );
      const isTruthy = isTruthyValue(value);

      if (isTruthy) {
        // Recursively process the content for nested conditionals
        result += parse(content);
      }
      // If not truthy, content is excluded (nothing added to result)

      // Move position past the endif
      pos = endifPos + ENDIF.length;
    }

    return result;
  }

  return parse(template);
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
 * Processes conditional blocks (<<<if {variable}>>>...<<<endif>>>) before variable substitution.
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
 *
 * // With conditionals:
 * const template = '<<<if {author}>>>Author: <<<author>>><<<endif>>>';
 * applyTemplate(template, { author: 'John' }); // Returns: 'Author: John'
 * applyTemplate(template, { author: '' }); // Returns: ''
 * ```
 */
export function applyTemplate(
  template: string,
  context: TemplateContext,
  maxIterations: number = 10,
): string {
  const regex = /<<<(.*?)>>>/g;
  const MISSING_PLACEHOLDER = "<<<missing>>>";

  // Process conditionals first
  let result = processConditionals(template, context);

  let previousResult = "";
  let iteration = 0;

  // Keep resolving until no more substitutions can be made or max iterations reached
  while (result !== previousResult && iteration < maxIterations) {
    previousResult = result;
    iteration++;

    result = result.replaceAll(regex, (fullMatch, key) => {
      const trimmedKey = (key as string).trim();

      // Skip any remaining conditional syntax (shouldn't happen, but safety check)
      if (trimmedKey.startsWith("if {") || trimmedKey === "endif") {
        return fullMatch;
      }

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
  result = result.replaceAll(regex, (fullMatch, key) => {
    const trimmedKey = (key as string).trim();
    // Don't replace malformed conditional syntax
    if (trimmedKey.startsWith("if {") || trimmedKey === "endif") {
      return fullMatch;
    }
    return MISSING_PLACEHOLDER;
  });

  return result;
}
