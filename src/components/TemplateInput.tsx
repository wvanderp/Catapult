import { useImageSetStore } from '../store/imageSetStore';

/**
 * TemplateInput allows users to define the description template for all images.
 * The template uses triple angle brackets (<<<variable>>>) for variable placeholders.
 * Users will be prompted to fill in values for these variables for each image.
 *
 * @returns The template input component
 */
export function TemplateInput() {
  const template = useImageSetStore((state) => state.imageSet.template);
  const setTemplate = useImageSetStore((state) => state.setTemplate);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <label className="text-lg font-medium text-white" htmlFor="templateInput">
          Template for images
        </label>
        <p className="text-sm text-gray-500">
          The template below is applied to all images. Use triple angle brackets for variables (e.g. {"<<<title>>>"}). You will be asked to fill in the values for each image.
        </p>
      </div>
      <textarea
        id="templateInput"
        placeholder="..."
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        className="h-32 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 p-4 font-mono text-gray-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-500" />
    </section>
  );
}
