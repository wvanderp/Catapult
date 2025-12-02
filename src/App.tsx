import { Header } from './components/Header';
import { TabNavigation } from './components/TabNavigation';
import { UploadTab, VariablesTab, FillOutTab, ReviewTab } from './components/tabs';
import { useImageSetStore } from './store/imageSetStore';

function App() {
  const currentTab = useImageSetStore((state) => state.currentTab);

  return (
    <div className="min-h-screen bg-zinc-900 text-gray-300 font-sans">
      <Header />
      <TabNavigation />
      <main className="max-w-5xl mx-auto px-6 pb-12">
        {currentTab === 'upload' && <UploadTab />}
        {currentTab === 'variables' && <VariablesTab />}
        {currentTab === 'fillout' && <FillOutTab />}
        {currentTab === 'review' && <ReviewTab />}
      </main>
    </div>
  )
}

export default App
