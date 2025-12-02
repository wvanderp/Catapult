import { useImageSetStore } from '../store/imageSetStore';
import { TabNavigation } from '../components/TabNavigation';
import { UploadTab, VariablesTab, FillOutTab, ReviewTab } from '../components/tabs';

export function Index() {
  const currentTab = useImageSetStore((state) => state.currentTab);

  return (
    <>
      <TabNavigation />
      <main className="max-w-5xl mx-auto px-6 pb-12">
        {currentTab === 'upload' && <UploadTab />}
        {currentTab === 'variables' && <VariablesTab />}
        {currentTab === 'fillout' && <FillOutTab />}
        {currentTab === 'review' && <ReviewTab />}
      </main>
    </>
  );
}
