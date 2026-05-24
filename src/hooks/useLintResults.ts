import { useState, useEffect, useMemo, useRef } from 'react';
import { useImageSetStore } from '../store/imageSetStore';
import { applyTemplate } from '../utils/templateUtils';
import { createUtilityContext } from '../utils/utilityContext';
import {
  SYNC_LINT_RULES,
  ASYNC_LINT_RULES,
  type LintIssue,
  type RenderedText,
} from '../utils/lint';

/**
 * Return value of the `useLintResults` hook.
 */
export interface LintResults {
  /** All lint issues found across all images. */
  issues: LintIssue[];
  /** True while async lint rules are in flight. */
  isCheckingCategories: boolean;
}

/**
 * Computes lint issues for all images in the current image set.
 *
 * Synchronous rules run immediately on every render. Async rules (e.g. the
 * category-existence check) are debounced (300 ms) and run as a batch whenever
 * the rendered wikitext changes.
 *
 * All rule logic — including category extraction, API calls, and batching — is
 * encapsulated inside each rule. This hook is only responsible for:
 *   1. Rendering wikitext for every image.
 *   2. Invoking the rule registries.
 *   3. Managing loading state and combining results.
 *
 * @returns `{ issues, isCheckingCategories }` — the current lint findings and
 *          a flag indicating whether async rules are still in flight.
 */
export function useLintResults(): LintResults {
  const images = useImageSetStore((state) => state.imageSet.images);
  const imageOrder = useImageSetStore((state) => state.imageSet.imageOrder);
  const template = useImageSetStore((state) => state.imageSet.template);
  const globalVariables = useImageSetStore((state) => state.imageSet.globalVariables);

  // Resolved order with backwards-compat fallback
  const imageIds = useMemo(() => {
    const keys = Object.keys(images);
    return imageOrder.length > 0 ? imageOrder.filter((id) => id in images) : keys;
  }, [images, imageOrder]);

  // ── Step 1: render wikitext for every image ─────────────────────────────────

  const renderedTexts = useMemo<RenderedText[]>(() => {
    return imageIds.map((id, index) => {
      const image = images[id];
      const context = {
        ...image.keys,
        exif: image.exifData ?? {},
        global: globalVariables,
        utility: createUtilityContext(image, index),
      };
      return {
        id,
        wikitext: applyTemplate(template, context),
      };
    });
  }, [imageIds, images, template, globalVariables]);

  // ── Step 2: run sync rules ──────────────────────────────────────────────────

  const syncIssues = useMemo<LintIssue[]>(() => {
    return renderedTexts.flatMap(({ id, wikitext }) =>
      SYNC_LINT_RULES.flatMap((rule) => {
        const issue = rule(wikitext, id);
        return issue === null ? [] : [issue];
      }),
    );
  }, [renderedTexts]);

  // ── Step 3: run async rules (debounced) ─────────────────────────────────────

  const [asyncIssues, setAsyncIssues] = useState<LintIssue[]>([]);
  const [isRunningAsync, setIsRunningAsync] = useState(false);
  const debounceTimerReference = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimerReference.current !== null) {
      clearTimeout(debounceTimerReference.current);
    }

    // All setState calls are deferred into the timer callback so the effect
    // body itself stays side-effect-free (avoids cascading render violations).
    debounceTimerReference.current = setTimeout(() => {
      if (renderedTexts.length === 0) {
        setAsyncIssues([]);
        setIsRunningAsync(false);
        return;
      }

      setIsRunningAsync(true);

      void Promise.all(ASYNC_LINT_RULES.map((rule) => rule(renderedTexts)))
        .then((results) => {
          setAsyncIssues(results.flat());
        })
        .catch(() => {
          setAsyncIssues([]);
        })
        .finally(() => {
          setIsRunningAsync(false);
        });
    }, 300);

    return () => {
      if (debounceTimerReference.current !== null) {
        clearTimeout(debounceTimerReference.current);
      }
    };
  }, [renderedTexts]);

  // ── Combine all issues ──────────────────────────────────────────────────────

  const issues = useMemo<LintIssue[]>(
    () => [...syncIssues, ...asyncIssues],
    [syncIssues, asyncIssues],
  );

  return { issues, isCheckingCategories: isRunningAsync };
}

