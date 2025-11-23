import { Header } from './components/Header';
import { TemplateInput } from './components/TemplateInput';
import { ImageUploader } from './components/ImageUploader';
import { ImageList } from './components/ImageList';
import TitleTemplateInput from './components/TitleTemplateInput';

function App() {
  return (
    <div className="min-h-screen bg-zinc-900 text-gray-300 font-sans">
      <Header />

      <main className="max-w-5xl mx-auto p-6 space-y-8">
        <TitleTemplateInput />
        <TemplateInput />
        <ImageUploader />
        <ImageList />
      </main>
    </div>
  )
}

export default App
