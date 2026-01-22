import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useImageSetStore } from '../../store/imageSetStore';
import { useSettingsStore, INITIAL_TEMPLATE, INITIAL_TITLE_TEMPLATE } from '../../store/settingsStore';
import { extractTemplateKeys } from '../../utils/templateUtils';

/**
 * VariablesTab allows users to configure templates and global variables.
 * Users can define:
 * - Title template for filenames
 * - Description template for image descriptions
 * - Global variables that apply to all images
 *
 * Displays warnings if no images are uploaded and shows preview of global variables.
 * 
 * @returns The variables tab component
 */
export function VariablesTab() {
  const template = useImageSetStore((state) => state.imageSet.template);
  const setTemplate = useImageSetStore((state) => state.setTemplate);
  const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
  const setTitleTemplate = useImageSetStore((state) => state.setTitleTemplate);
  const globalVariables = useImageSetStore((state) => state.imageSet.globalVariables);
  const setGlobalVariable = useImageSetStore((state) => state.setGlobalVariable);
  const images = useImageSetStore((state) => state.imageSet.images);

  const defaultGlobalVariables = useSettingsStore((state) => state.defaultGlobalVariables);
  const defaultTemplate = useSettingsStore((state) => state.defaultTemplate);
  const defaultTitleTemplate = useSettingsStore((state) => state.defaultTitleTemplate);

  const imageCount = Object.keys(images).length;

  // Extract keys that could be global (appear in template)
  const templateKeys = useMemo(() => {
    return extractTemplateKeys(titleTemplate + ' ' + template);
  }, [titleTemplate, template]);

  // Filter out utility variables from global variables section
  // (utility.* variables are auto-generated per image and shouldn't have global defaults)
  const globalSettableKeys = useMemo(() => {
    return templateKeys.filter((key) => !key.startsWith('utility.'));
  }, [templateKeys]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold text-white">Variables & Templates</h2>
        <p className="text-gray-400">Define templates and global variables for your images</p>
      </div>

      {/* Title Template */}
      <section className="space-y-4 rounded-xl bg-zinc-800/50 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="mb-1 text-lg font-medium text-white">Title Template</h3>
            <p className="text-sm text-gray-500">
              Define the filename pattern for uploaded images. Use {"<<<variable>>>"} for dynamic parts.
            </p>
          </div>
          <div className="flex gap-2">
            {titleTemplate !== defaultTitleTemplate && (
              <button
                onClick={() => setTitleTemplate(defaultTitleTemplate)}
                className="rounded bg-zinc-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-zinc-600"
                title="Reset to default from settings"
              >
                Use Default
              </button>
            )}
            {titleTemplate !== INITIAL_TITLE_TEMPLATE && (
              <button
                onClick={() => setTitleTemplate(INITIAL_TITLE_TEMPLATE)}
                className="rounded border border-zinc-600 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-zinc-800"
                title="Reset to built-in initial template"
              >
                Reset
              </button>
            )}
          </div>
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
        <div className="flex items-start justify-between">
          <div>
            <h3 className="mb-1 text-lg font-medium text-white">Description Template</h3>
            <p className="text-sm text-gray-500">
              The template applied to all images. Use {"<<<variable>>>"} for values that change per image.
            </p>
          </div>
          <div className="flex gap-2">
            {template !== defaultTemplate && (
              <button
                onClick={() => setTemplate(defaultTemplate)}
                className="rounded bg-zinc-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-zinc-600"
                title="Reset to default from settings"
              >
                Use Default
              </button>
            )}
            {template !== INITIAL_TEMPLATE && (
              <button
                onClick={() => setTemplate(INITIAL_TEMPLATE)}
                className="rounded border border-zinc-600 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-zinc-800"
                title="Reset to built-in initial template"
              >
                Reset
              </button>
            )}
          </div>
        </div>
        <textarea
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          placeholder={INITIAL_TEMPLATE}
          className="h-64 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 p-4 font-mono text-sm text-gray-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </section>

      {/* Global Variables */}
      {globalSettableKeys.length > 0 && (
        <section className="space-y-4 rounded-xl bg-zinc-800/50 p-6">
          <div>
            <h3 className="mb-1 text-lg font-medium text-white">Global Variables</h3>
            <p className="text-sm text-gray-500">
              Set default values for variables. These will be used unless overridden per image.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {globalSettableKeys.map((key) => {
              const hasDefault = key in defaultGlobalVariables;
              const currentValue = globalVariables[key] || '';
              const defaultValue = defaultGlobalVariables[key] || '';
              const isDifferentFromDefault = hasDefault && currentValue !== defaultValue;

              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-400">
                      {key}
                    </label>
                    {isDifferentFromDefault && (
                      <button
                        onClick={() => setGlobalVariable(key, defaultValue)}
                        className="rounded px-2 py-0.5 text-xs text-blue-400 transition-colors hover:bg-blue-900/30"
                        title={`Reset to default: ${defaultValue}`}
                      >
                        Use Default
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={currentValue}
                    onChange={(e) => setGlobalVariable(key, e.target.value)}
                    placeholder={hasDefault ? `Default: ${defaultValue}` : `Default value for ${key}`}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              );
            })}
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
                  {`<<<${key}>>>`}
                </span>
              ))}
            </div>
          ) : (
            <p className="italic text-gray-500">
              No variables detected. Add variables like {"<<<variable>>>"} to your template.
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
