import { Link, useLocation } from '@tanstack/react-router';
import { useImageSetStore } from '../store/imageSetStore';

type TabPath = '/upload' | '/variables' | '/fillout' | '/review';

const tabs: { path: TabPath; label: string; description: string }[] = [
  { path: '/upload', label: '1. Upload', description: 'Add images' },
  { path: '/variables', label: '2. Variables', description: 'Set templates' },
  { path: '/fillout', label: '3. Fill Out', description: 'Fill forms' },
  { path: '/review', label: '4. Review', description: 'Upload to Commons' },
];

/**
 * TabNavigation displays the step-by-step navigation tabs for the upload workflow.
 * Shows badges for image count and review progress.
 * Highlights the current active tab.
 * 
 * @returns The tab navigation component
 */
export function TabNavigation() {
  const location = useLocation();
  const images = useImageSetStore((state) => state.imageSet.images);

  const imageCount = Object.keys(images).length;
  const reviewedCount = Object.values(images).filter((img) => img.reviewed).length;

  return (
    <nav className="mb-6 border-b border-zinc-700">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex space-x-1">
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.path;

            // Show badge for certain tabs
            let badge: string | undefined;
            if (tab.path === '/upload' && imageCount > 0) {
              badge = `${imageCount}`;
            } else if (tab.path === '/review' && imageCount > 0) {
              badge = `${reviewedCount}/${imageCount}`;
            }

            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`
                  relative px-4 py-3 text-sm font-medium transition-colors
                  ${isActive
                    ? 'border-b-2 border-white text-white'
                    : 'border-b-2 border-transparent text-gray-400 hover:text-gray-200'
                  }
                `}
              >
                <span className="flex items-center gap-2">
                  {tab.label}
                  {badge && (
                    <span className={`
                      rounded-full px-1.5 py-0.5 text-xs
                      ${isActive ? 'bg-white text-black' : 'bg-zinc-700 text-gray-300'}
                    `}>
                      {badge}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
