import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useImageSetStore } from '../../store/imageSetStore';
import { extractTemplateKeys } from '../../utils/templateUtils';

export function VariablesTab() {
  const template = useImageSetStore((state) => state.imageSet.template);
  const setTemplate = useImageSetStore((state) => state.setTemplate);
  const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
  const setTitleTemplate = useImageSetStore((state) => state.setTitleTemplate);
  const globalVariables = useImageSetStore((state) => state.imageSet.globalVariables);
  const setGlobalVariable = useImageSetStore((state) => state.setGlobalVariable);
  const images = useImageSetStore((state) => state.imageSet.images);

  const imageCount = Object.keys(images).length;

  // Extract keys that could be global (appear in template)
  const templateKeys = useMemo(() => {
    return extractTemplateKeys(titleTemplate + ' ' + template);
  }, [titleTemplate, template]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold text-white">Variables & Templates</h2>
        <p className="text-gray-400">Define templates and global variables for your images</p>
      </div>

      {/* Title Template */}
      <section className="space-y-4 rounded-xl bg-zinc-800/50 p-6">
        <div>
          <h3 className="mb-1 text-lg font-medium text-white">Title Template</h3>
          <p className="text-sm text-gray-500">
            Define the filename pattern for uploaded images. Use {"{{{variable}}}"} for dynamic parts.
          </p>
        </div>
        <input
          type="text"
          value={titleTemplate}
          onChange={(event) => setTitleTemplate(event.target.value)}
          placeholder="Image title template"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-gray-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </section>

      {/* Description Template */}
      <section className="space-y-4 rounded-xl bg-zinc-800/50 p-6">
        <div>
          <h3 className="mb-1 text-lg font-medium text-white">Description Template</h3>
          <p className="text-sm text-gray-500">
            The template applied to all images. Use {"{{{variable}}}"} for values that change per image.
          </p>
        </div>
        <textarea
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          placeholder={`=={{int:filedesc}}==
{{Information
|description={{en|1={{{description}}}}}
|date={{{date}}}
|source={{own}}
|author=[[User:YourUsername|YourUsername]]
}}

=={{int:license-header}}==
{{self|cc-by-sa-4.0}}

[[Category:{{{category}}}]]`}
          className="h-64 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 p-4 font-mono text-sm text-gray-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </section>

      {/* Global Variables */}
      {templateKeys.length > 0 && (
        <section className="space-y-4 rounded-xl bg-zinc-800/50 p-6">
          <div>
            <h3 className="mb-1 text-lg font-medium text-white">Global Variables</h3>
            <p className="text-sm text-gray-500">
              Set default values for variables. These will be used unless overridden per image.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {templateKeys.map((key) => (
              <div key={key} className="space-y-1">
                <label className="text-sm font-medium text-gray-400">
                  {key}
                </label>
                <input
                  type="text"
                  value={globalVariables[key] || ''}
                  onChange={(e) => setGlobalVariable(key, e.target.value)}
                  placeholder={`Default value for ${key}`}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Template Preview */}
      {template && (
        <section className="space-y-4 rounded-xl bg-zinc-800/50 p-6">
          <div>
            <h3 className="mb-1 text-lg font-medium text-white">Detected Variables</h3>
            <p className="text-sm text-gray-500">
              These variables will need to be filled in for each image.
            </p>
          </div>
          {templateKeys.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {templateKeys.map((key) => (
                <span
                  key={key}
                  className="rounded-full bg-blue-600/20 px-3 py-1 text-sm font-medium text-blue-400"
                >
                  {`{{{${key}}}}`}
                </span>
              ))}
            </div>
          ) : (
            <p className="italic text-gray-500">
              No variables detected. Add variables like {"{{{variable}}}"} to your template.
            </p>
          )}
        </section>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Link
          to="/upload"
          className="px-6 py-3 font-medium text-gray-400 transition-colors hover:text-white"
        >
          ← Back to Upload
        </Link>
        {imageCount > 0 && templateKeys.length > 0 && (
          <Link
            to="/fillout"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Next: Fill out forms →
          </Link>
        )}
      </div>
    </div>
  );
}
