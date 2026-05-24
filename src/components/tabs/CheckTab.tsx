import { Link } from '@tanstack/react-router';
import { useImageSetStore } from '../../store/imageSetStore';
import { useImageUrl } from '../../hooks/useImageData';
import { useLintResults } from '../../hooks/useLintResults';
import type { LintIssue, LintSeverity } from '../../utils/lintUtils';

// ─── Issue card ───────────────────────────────────────────────────────────────

interface IssueCardProperties {
  issue: LintIssue;
}

/**
 * Renders a single lint issue as a compact card.
 * Error issues are shown in red, warnings in amber.
 *
 * @param props - The props object
 * @param props.issue - The lint issue to display.
 * @returns A styled issue card element.
 */
function IssueCard({ issue }: IssueCardProperties) {
  const isError = issue.severity === 'error';

  return (
    <div
      className={`flex items-start gap-3 rounded-xl px-4 py-3 ${
        isError
          ? 'bg-red-500/8 ring-1 ring-red-500/20'
          : 'bg-amber-500/8 ring-1 ring-amber-500/20'
      }`}
    >
      {isError ? (
        <svg
          className="mt-0.5 size-4 shrink-0 text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ) : (
        <svg
          className="mt-0.5 size-4 shrink-0 text-amber-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      )}
      <p className={`text-sm ${isError ? 'text-red-300' : 'text-amber-300'}`}>
        {issue.message}
      </p>
    </div>
  );
}

// ─── Per-image row ────────────────────────────────────────────────────────────

interface ImageCheckRowProperties {
  imageId: string;
  imageName: string;
  issues: LintIssue[];
}

/**
 * Displays a single image's quality-check results: thumbnail, filename, and
 * any lint issues. Shows a green "All clear" indicator when no issues exist.
 *
 * @param props - The props object
 * @param props.imageId   - The image ID (for thumbnail loading).
 * @param props.imageName - The original filename.
 * @param props.issues    - Lint issues belonging to this image.
 * @returns A card showing the image and its issues (or all-clear state).
 */
function ImageCheckRow({
  imageId,
  imageName,
  issues,
}: ImageCheckRowProperties) {
  const { imageUrl, isLoading } = useImageUrl(imageId);

  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const hasWarnings = issues.some((issue) => issue.severity === 'warning');
  const allClear = issues.length === 0;

  /**
   * Derive the left border colour based on the worst severity.
   *
   * @returns Tailwind border-color class.
   */
  function getBorderColor(): string {
    if (hasErrors) return 'border-red-500/50';
    if (hasWarnings) return 'border-amber-500/50';
    return 'border-emerald-500/40';
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-zinc-900/60 backdrop-blur-md transition-colors duration-200 ${getBorderColor()}`}
    >
      <div className="flex items-start gap-5 p-5">
        {/* Thumbnail */}
        <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-zinc-800">
          {isLoading ? (
            <div className="flex size-full items-center justify-center">
              <div className="size-4 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-500" />
            </div>
          ) : (
            <img src={imageUrl} alt={imageName} className="size-full object-cover" />
          )}
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
              File
            </span>
            <span className="truncate text-sm text-zinc-400">{imageName}</span>
          </div>

          {allClear ? (
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
              <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Looks good
            </div>
          ) : (
            <div className="space-y-2">
              {issues.map((issue, index) => (
                <IssueCard key={index} issue={issue} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

interface SummaryStripProperties {
  errorCount: number;
  warningCount: number;
  isCheckingCategories: boolean;
}

/**
 * Top-of-page banner summarising the overall quality-check result.
 * Shows a spinner while the async category check is running, a green
 * "All checks passed" banner when clean, or a breakdown of errors/warnings.
 *
 * @param props - The props object
 * @param props.errorCount           - Total number of errors.
 * @param props.warningCount         - Total number of warnings.
 * @param props.isCheckingCategories - Whether the category API call is in flight.
 * @returns A summary banner element.
 */
function SummaryStrip({
  errorCount,
  warningCount,
  isCheckingCategories,
}: SummaryStripProperties) {
  if (isCheckingCategories) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 px-6 py-4 backdrop-blur-md">
        <div className="size-4 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-500" />
        <span className="text-sm font-medium text-zinc-400">
          Checking categories on Wikimedia Commons…
        </span>
      </div>
    );
  }

  if (errorCount === 0 && warningCount === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-6 py-4 backdrop-blur-md">
        <svg className="size-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-semibold text-emerald-400">All checks passed — your files look great!</span>
      </div>
    );
  }

  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`);
  if (warningCount > 0) parts.push(`${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-6 py-4 backdrop-blur-md">
      <svg className="size-5 shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <span className="font-semibold text-amber-400">{parts.join(' and ')} found</span>
      <span className="text-sm text-zinc-400">
        — fix these before uploading to Wikimedia Commons
      </span>
    </div>
  );
}

// ─── Severity badge ───────────────────────────────────────────────────────────

interface SeverityBadgeProperties {
  severity: LintSeverity;
  count: number;
}

/**
 * Small coloured pill showing the count of errors or warnings.
 *
 * @param props - The props object
 * @param props.severity - `'error'` or `'warning'`.
 * @param props.count    - The number to display.
 * @returns A badge element, or `null` if count is zero.
 */
function SeverityBadge({ severity, count }: SeverityBadgeProperties) {
  if (count === 0) return null;

  const isError = severity === 'error';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isError
          ? 'bg-red-500/15 text-red-400'
          : 'bg-amber-500/15 text-amber-400'
      }`}
    >
      {count}
    </span>
  );
}

// ─── CheckTab ─────────────────────────────────────────────────────────────────

/**
 * CheckTab provides a quality-check review screen for all images before upload.
 *
 * Features:
 * - Runs independent lint rules on each image's rendered wikitext.
 * - Checks category existence against the Wikimedia Commons API (async, debounced).
 * - Shows a summary strip (all-clear / error count / warning count).
 * - Lists per-image issues with severity-coded cards.
 * - Uploading is never blocked — this tab is informational only.
 * - Shows a spinner while the category API check is in flight.
 *
 * @returns The quality-check tab component.
 */
export function CheckTab() {
  const images = useImageSetStore((state) => state.imageSet.images);
  const imageOrder = useImageSetStore((state) => state.imageSet.imageOrder);

  const { issues, isCheckingCategories } = useLintResults();

  const imageKeys = Object.keys(images);
  const imageIds =
    imageOrder.length > 0
      ? imageOrder.filter((id) => id in images)
      : imageKeys;

  if (imageIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-6 flex size-20 items-center justify-center rounded-2xl bg-zinc-800/60 ring-1 ring-zinc-700/50">
          <svg
            className="size-10 text-zinc-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-bold text-white">No images to check</h2>
        <p className="mb-8 text-zinc-500">Add images first, then come back to review their quality.</p>
        <Link
          to="/upload"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white transition-all duration-200 hover:bg-teal-500"
        >
          Go to Upload
        </Link>
      </div>
    );
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      {/* Page header */}
      <div className="text-center">
        <h2 className="mb-3 text-3xl font-bold tracking-tight text-white">
          Quality Check
        </h2>
        <p className="text-zinc-400">
          Review potential issues before uploading to Wikimedia Commons
        </p>
      </div>

      {/* Summary strip */}
      <SummaryStrip
        errorCount={errorCount}
        warningCount={warningCount}
        isCheckingCategories={isCheckingCategories}
      />

      {/* Per-image section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Images ({imageIds.length})
          </h3>
          {(errorCount > 0 || warningCount > 0) && (
            <div className="flex items-center gap-2">
              <SeverityBadge severity="error" count={errorCount} />
              <SeverityBadge severity="warning" count={warningCount} />
            </div>
          )}
        </div>

        {imageIds.map((id) => {
          const image = images[id];
          const imageIssues = issues.filter((issue) => issue.imageId === id);
          return (
            <ImageCheckRow
              key={id}
              imageId={id}
              imageName={image.name}
              issues={imageIssues}
            />
          );
        })}
      </div>

      {/* Continue CTA */}
      <div className="flex justify-end pt-2">
        <Link
          to="/review"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white transition-all duration-200 hover:bg-teal-500"
        >
          Continue to Review
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
