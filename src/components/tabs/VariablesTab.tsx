import { useEffect, useMemo } from 'react';
import { useImageSetStore } from '../../store/imageSetStore';
import { extractTemplateKeys } from '../../utils/templateUtils';

export function VariablesTab() {
  const template = useImageSetStore((state) => state.imageSet.template);
  const setTemplate = useImageSetStore((state) => state.setTemplate);
  const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
  const setTitleTemplate = useImageSetStore((state) => state.setTitleTemplate);
  const globalVariables = useImageSetStore((state) => state.imageSet.globalVariables);
  const setGlobalVariable = useImageSetStore((state) => state.setGlobalVariable);
  const setCurrentTab = useImageSetStore((state) => state.setCurrentTab);
  const images = useImageSetStore((state) => state.imageSet.images);

  const imageCount = Object.keys(images).length;

  // Extract keys that could be global (appear in template)
  const templateKeys = useMemo(() => {
    return extractTemplateKeys(titleTemplate + ' ' + template);
  }, [titleTemplate, template]);

  // Set defaults if no template in state
  useEffect(() => {
    if (!template) {
      setTemplate(`=={{int:filedesc}}==
{{Information
|description={{en|1={{{description}}}}}
|date={{{date}}}
|source={{own}}
|author=[[User:YourUsername|YourUsername]]
}}

=={{int:license-header}}==
{{self|cc-by-sa-4.0}}

[[Category:{{{category}}}]]`);
    }
    if (!titleTemplate) {
      setTitleTemplate('{{{location}}} - {{{subject}}} ({{{date}}}).jpg');
    }
  }, [template, titleTemplate, setTemplate, setTitleTemplate]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Variables & Templates</h2>
        <p className="text-gray-400">Define templates and global variables for your images</p>
      </div>

      {/* Title Template */}
      <section className="bg-zinc-800/50 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-lg font-medium text-white mb-1">Title Template</h3>
          <p className="text-sm text-gray-500">
            Define the filename pattern for uploaded images. Use {"{{{variable}}}"} for dynamic parts.
          </p>
        </div>
        <input
          type="text"
          value={titleTemplate}
          onChange={(e) => setTitleTemplate(e.target.value)}
          placeholder="e.g., {{{location}}} - {{{subject}}} ({{{date}}}).jpg"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
        />
      </section>

      {/* Description Template */}
      <section className="bg-zinc-800/50 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-lg font-medium text-white mb-1">Description Template</h3>
          <p className="text-sm text-gray-500">
            The template applied to all images. Use {"{{{variable}}}"} for values that change per image.
          </p>
        </div>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
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
          className="w-full h-64 bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono text-sm"
        />
      </section>

      {/* Global Variables */}
      {templateKeys.length > 0 && (
        <section className="bg-zinc-800/50 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-white mb-1">Global Variables</h3>
            <p className="text-sm text-gray-500">
              Set default values for variables. These will be used unless overridden per image.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Template Preview */}
      {template && (
        <section className="bg-zinc-800/50 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-white mb-1">Detected Variables</h3>
            <p className="text-sm text-gray-500">
              These variables will need to be filled in for each image.
            </p>
          </div>
          {templateKeys.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {templateKeys.map((key) => (
                <span
                  key={key}
                  className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-sm font-medium"
                >
                  {`{{{${key}}}}`}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">
              No variables detected. Add variables like {"{{{variable}}}"} to your template.
            </p>
          )}
        </section>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrentTab('upload')}
          className="text-gray-400 hover:text-white font-medium px-6 py-3 transition-colors"
        >
          ← Back to Upload
        </button>
        {imageCount > 0 && templateKeys.length > 0 && (
          <button
            onClick={() => setCurrentTab('fillout')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Next: Fill out forms →
          </button>
        )}
      </div>
    </div>
  );
}
