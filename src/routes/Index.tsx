import { TemplateInput } from '../components/TemplateInput'
import { ImageUploader } from '../components/ImageUploader'
import { ImageList } from '../components/ImageList'
import TitleTemplateInput from '../components/TitleTemplateInput'

export function Index() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-8">
      <TemplateInput />
      <TitleTemplateInput />
      <ImageUploader />
      <ImageList />
    </main>
  )
}
