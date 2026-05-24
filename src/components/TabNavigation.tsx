import { Link, useLocation } from '@tanstack/react-router';
import { useImageSetStore } from '../store/imageSetStore';
import { useLintResults } from '../hooks/useLintResults';

type TabPath = '/upload' | '/variables' | '/fillout' | '/check' | '/review';

interface Tab {
  path: TabPath;
  label: string;
  step: number;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  {
    path: '/upload',
    label: 'Upload',
    step: 1,
    icon: (
      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    path: '/variables',
    label: 'Variables',
    step: 2,
    icon: (
      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    path: '/fillout',
    label: 'Fill Out',
    step: 3,
    icon: (
      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  {
    path: '/check',
    label: 'Check',
    step: 4,
    icon: (
      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    path: '/review',
    label: 'Review',
    step: 5,
    icon: (
      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

/**
 * TabNavigation displays the step-by-step navigation tabs for the upload workflow.
 * Shows badges for image count, reviewed count, and quality-check issue count.
 * Highlights the current active tab with visual indicators.
 * 
 * @returns The tab navigation component
 */
export function TabNavigation() {
  const location = useLocation();
  const images = useImageSetStore((state) => state.imageSet.images);
  const { issues } = useLintResults();

  const imageCount = Object.keys(images).length;
  const reviewedCount = Object.values(images).filter((img) => img.reviewed).length;

  const lintErrorCount = issues.filter((issue) => issue.severity === 'error').length;
  const lintWarningCount = issues.filter((issue) => issue.severity === 'warning').length;

  /**
   * Get the badge content for a tab if applicable.
   * 
   * @param path - The path of the tab to get badge for
   * @returns Badge text or undefined if no badge should be shown
   */
  function getBadge(path: TabPath): string | undefined {
    if (path === '/upload' && imageCount > 0) {
      return `${imageCount}`;
    }
    if (path === '/check' && imageCount > 0 && (lintErrorCount > 0 || lintWarningCount > 0)) {
      return lintErrorCount > 0 ? `${lintErrorCount}` : `${lintWarningCount}`;
    }
    if (path === '/review' && imageCount > 0) {
      return `${reviewedCount}/${imageCount}`;
    }
    return undefined;
  }

  /**
   * Get whether the badge for a tab should use the error colour (red).
   * Warnings use the default (amber-ish) badge styling.
   *
   * @param path - The path of the tab to check
   * @returns True if the badge should be shown in red
   */
  function isBadgeError(path: TabPath): boolean {
    return path === '/check' && lintErrorCount > 0;
  }

  /**
   * Get the current step index for progress calculation.
   * 
   * @returns The current step index (0 if not found)
   */
  function getCurrentStepIndex(): number {
    const index = tabs.findIndex(tab => tab.path === location.pathname);
    return Math.max(index, 0);
  }

  const currentStepIndex = getCurrentStepIndex();

  return (
    <nav className="border-b border-zinc-800/60 bg-zinc-950/50 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-center gap-1">
          {tabs.map((tab, index) => {
            const isActive = location.pathname === tab.path;
            const isPast = index < currentStepIndex;
            const badge = getBadge(tab.path);

            /**
             * Get the indicator style based on step state.
             * 
             * @returns CSS class string for the indicator element
             */
            function getIndicatorStyle(): string {
              if (isActive) {
                return 'bg-teal-600 text-white';
              }
              if (isPast) {
                return 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30';
              }
              return 'bg-zinc-800/80 text-zinc-500 ring-1 ring-zinc-700/50 group-hover:ring-zinc-600/50';
            }

            /**
             * Get the text style based on step state.
             * 
             * @returns CSS class string for the text element
             */
            function getTextStyle(): string {
              if (isActive) return 'text-white';
              if (isPast) return 'text-zinc-400 hover:text-zinc-200';
              return 'text-zinc-500 hover:text-zinc-300';
            }

            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`
                  group relative flex items-center gap-2.5 px-5 py-4 text-sm font-medium transition-all duration-200
                  ${getTextStyle()}
                `}
              >
                {/* Step indicator */}
                <span className={`
                  flex size-7 items-center justify-center rounded-lg text-xs font-bold transition-all duration-200
                  ${getIndicatorStyle()}
                `}>
                  {isPast ? (
                    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    tab.step
                  )}
                </span>

                {/* Label */}
                <span className="font-semibold">{tab.label}</span>

                {/* Badge */}
                {badge && (
                  <span className={`
                    rounded-full px-2 py-0.5 text-xs font-bold transition-all
                    ${isBadgeError(tab.path)
                      ? 'bg-red-500/20 text-red-400'
                      : (isActive ? 'bg-white/15 text-white' : 'bg-zinc-800 text-zinc-400')
                    }
                  `}>
                    {badge}
                  </span>
                )}

                {/* Active indicator */}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-teal-500" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

