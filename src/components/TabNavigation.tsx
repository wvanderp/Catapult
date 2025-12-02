import { useImageSetStore, type TabId } from '../store/imageSetStore';

const tabs: { id: TabId; label: string; description: string }[] = [
  { id: 'upload', label: '1. Upload', description: 'Add images' },
  { id: 'variables', label: '2. Variables', description: 'Set templates' },
  { id: 'fillout', label: '3. Fill Out', description: 'Fill forms' },
  { id: 'review', label: '4. Review', description: 'Upload to Commons' },
];

export function TabNavigation() {
  const currentTab = useImageSetStore((state) => state.currentTab);
  const setCurrentTab = useImageSetStore((state) => state.setCurrentTab);
  const images = useImageSetStore((state) => state.imageSet.images);
  
  const imageCount = Object.keys(images).length;
  const reviewedCount = Object.values(images).filter((img) => img.reviewed).length;

  return (
    <nav className="border-b border-zinc-700 mb-6">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex space-x-1">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            
            // Show badge for certain tabs
            let badge: string | null = null;
            if (tab.id === 'upload' && imageCount > 0) {
              badge = `${imageCount}`;
            } else if (tab.id === 'review' && imageCount > 0) {
              badge = `${reviewedCount}/${imageCount}`;
            }

            return (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`
                  relative px-4 py-3 text-sm font-medium transition-colors
                  ${isActive
                    ? 'text-white border-b-2 border-white'
                    : 'text-gray-400 hover:text-gray-200 border-b-2 border-transparent'
                  }
                `}
              >
                <span className="flex items-center gap-2">
                  {tab.label}
                  {badge && (
                    <span className={`
                      text-xs px-1.5 py-0.5 rounded-full
                      ${isActive ? 'bg-white text-black' : 'bg-zinc-700 text-gray-300'}
                    `}>
                      {badge}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
