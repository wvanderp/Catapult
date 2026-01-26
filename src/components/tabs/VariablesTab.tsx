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
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <div className="text-center">
        <h2 className="mb-3 text-3xl font-bold tracking-tight text-white">Templates & Variables</h2>
        <p className="text-zinc-400">Configure how your images will be titled and described on Commons</p>
      </div>

      {/* Title Template */}
      <section className="overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/60 backdrop-blur-md">
        <div className="flex items-start justify-between border-b border-zinc-800/50 p-5">
          <div>
            <h3 className="mb-1 text-lg font-bold text-white">Title Template</h3>
            <p className="text-sm text-zinc-500">
              Set the filename pattern for Commons. Use {"<<<variable>>>"} placeholders for dynamic values.
            </p>
          </div>
          <div className="flex gap-2">
            {titleTemplate !== defaultTitleTemplate && (
              <button
                onClick={() => setTitleTemplate(defaultTitleTemplate)}
                className="rounded-xl bg-zinc-800/80 px-3.5 py-2 text-xs font-semibold text-zinc-300 transition-all duration-200 hover:bg-zinc-700 hover:text-white"
                title="Reset to default from settings"
              >
                Use Default
              </button>
            )}
            {titleTemplate !== INITIAL_TITLE_TEMPLATE && (
              <button
                onClick={() => setTitleTemplate(INITIAL_TITLE_TEMPLATE)}
                className="rounded-xl border border-zinc-700/80 px-3.5 py-2 text-xs font-semibold text-zinc-500 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                title="Reset to built-in initial template"
              >
                Reset
              </button>
            )}
          </div>
        </div>
        <div className="p-5">
          <input
            type="text"
            value={titleTemplate}
            onChange={(event) => setTitleTemplate(event.target.value)}
            placeholder="Image title template"
            className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-4 py-3.5 font-mono text-[13px] text-zinc-200 transition-all duration-200 placeholder:text-zinc-600 focus:border-teal-400/50 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
          />
        </div>
      </section>

      {/* Description Template */}
      <section className="overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/60 backdrop-blur-md">
        <div className="flex items-start justify-between border-b border-zinc-800/50 p-5">
          <div>
            <h3 className="mb-1 text-lg font-bold text-white">Description Template</h3>
            <p className="text-sm text-zinc-500">
              The wikitext description for your images. Use {"<<<variable>>>"} for per-image values.
            </p>
          </div>
          <div className="flex gap-2">
            {template !== defaultTemplate && (
              <button
                onClick={() => setTemplate(defaultTemplate)}
                className="rounded-xl bg-zinc-800/80 px-3.5 py-2 text-xs font-semibold text-zinc-300 transition-all duration-200 hover:bg-zinc-700 hover:text-white"
                title="Reset to default from settings"
              >
                Use Default
              </button>
            )}
            {template !== INITIAL_TEMPLATE && (
              <button
                onClick={() => setTemplate(INITIAL_TEMPLATE)}
                className="rounded-xl border border-zinc-700/80 px-3.5 py-2 text-xs font-semibold text-zinc-500 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                title="Reset to built-in initial template"
              >
                Reset
              </button>
            )}
          </div>
        </div>
        <div className="p-5">
          <textarea
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            placeholder={INITIAL_TEMPLATE}
            className="h-64 w-full resize-y rounded-xl border border-zinc-700/80 bg-zinc-900/80 p-4 font-mono text-[13px] text-zinc-200 transition-all duration-200 placeholder:text-zinc-600 focus:border-teal-400/50 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
          />
        </div>
      </section>

      {/* Global Variables */}
      {globalSettableKeys.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/60 backdrop-blur-md">
          <div className="border-b border-zinc-800/50 p-5">
            <h3 className="mb-1 text-lg font-bold text-white">Global Variables</h3>
            <p className="text-sm text-zinc-500">
              Values shared across all images. Can be overridden individually in the next step.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
            {globalSettableKeys.map((key) => {
              const hasDefault = key in defaultGlobalVariables;
              const currentValue = globalVariables[key] || '';
              const defaultValue = defaultGlobalVariables[key] || '';
              const isDifferentFromDefault = hasDefault && currentValue !== defaultValue;

              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">
                      {key}
                    </label>
                    {isDifferentFromDefault && (
                      <button
                        onClick={() => setGlobalVariable(key, defaultValue)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-400 transition-all duration-200 hover:bg-teal-400/10"
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
                    className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-4 py-3 text-sm text-white transition-all duration-200 placeholder:text-zinc-600 focus:border-teal-400/50 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Template Preview */}
      {template && (
        <section className="overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/60 backdrop-blur-md">
          <div className="border-b border-zinc-800/50 p-5">
            <h3 className="mb-1 text-lg font-bold text-white">Detected Variables</h3>
            <p className="text-sm text-zinc-500">
              Variables found in your templates. You'll fill these in for each image.
            </p>
          </div>
          <div className="p-5">
            {templateKeys.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {templateKeys.map((key) => (
                  <span
                    key={key}
                    className="rounded-xl bg-teal-400/10 px-3.5 py-2 font-mono text-[13px] font-semibold text-teal-400 ring-1 ring-teal-400/25"
                  >
                    {`<<<${key}>>>`}
                  </span>
                ))}
              </div>
            ) : (
              <p className="italic text-zinc-600">
                No variables found. Add placeholders like {"<<<description>>>"} to your templates.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <Link
          to="/upload"
          className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-zinc-500 transition-all duration-200 hover:bg-zinc-800/50 hover:text-white"
        >
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back to Upload
        </Link>
        {imageCount > 0 && templateKeys.length > 0 && (
          <Link
            to="/fillout"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-8 py-3.5 font-semibold text-white transition-all duration-200 hover:bg-teal-500"
          >
            Continue to Fill Out
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}

