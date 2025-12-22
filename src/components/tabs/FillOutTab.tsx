import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useImageSetStore } from '../../store/imageSetStore';
import { extractTemplateKeys } from '../../utils/templateUtils';

export function FillOutTab() {
  const images = useImageSetStore((state) => state.imageSet.images);
  const template = useImageSetStore((state) => state.imageSet.template);
  const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
  const globalVariables = useImageSetStore((state) => state.imageSet.globalVariables);
  const updateImageKeys = useImageSetStore((state) => state.updateImageKeys);

  const imageIds = Object.keys(images);
  const [currentIndex, setCurrentIndex] = useState(0);

  const keys = useMemo(() => extractTemplateKeys(titleTemplate + ' ' + template), [titleTemplate, template]);

  // Ensure current index is valid
  const safeCurrentIndex = Math.min(currentIndex, Math.max(0, imageIds.length - 1));

  if (imageIds.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 text-5xl">📭</div>
        <h2 className="mb-2 text-xl font-medium text-white">No images uploaded</h2>
        <p className="mb-6 text-gray-400">Upload some images first to fill out their details.</p>
        <Link
          to="/upload"
          className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
        >
          Go to Upload
        </Link>
      </div>
    );
  }

  if (keys.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 text-5xl">📝</div>
        <h2 className="mb-2 text-xl font-medium text-white">No variables defined</h2>
        <p className="mb-6 text-gray-400">Add variables to your template first (e.g., {"{{{description}}}"}).</p>
        <Link
          to="/variables"
          className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
        >
          Go to Variables
        </Link>
      </div>
    );
  }

  const currentId = imageIds[safeCurrentIndex];
  const currentImage = images[currentId];
  const imageUrl = `data:${currentImage.mimeType};base64,${currentImage.file}`;

  const handleKeyChange = (key: string, value: string) => {
    updateImageKeys(currentId, {
      ...currentImage.keys,
      [key]: value,
    });
  };

  const applyGlobalVariables = () => {
    const newKeys = { ...currentImage.keys };
    for (const key of keys) {
      if (!newKeys[key] && globalVariables[key]) {
        newKeys[key] = globalVariables[key];
      }
    }
    updateImageKeys(currentId, newKeys);
  };

  const copyFromPrevious = () => {
    if (safeCurrentIndex > 0) {
      const previousId = imageIds[safeCurrentIndex - 1];
      const previousImage = images[previousId];
      updateImageKeys(currentId, { ...previousImage.keys });
    }
  };

  // Check how many fields are filled for progress
  const filledFields = keys.filter(key => currentImage.keys[key]?.trim()).length;
  const totalFields = keys.length;
  const progressPercent = Math.round((filledFields / totalFields) * 100);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold text-white">Fill Out Details</h2>
        <p className="text-gray-400">
          Image {safeCurrentIndex + 1} of {imageIds.length}
        </p>
      </div>

      {/* Progress bar for all images */}
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${((safeCurrentIndex + 1) / imageIds.length) * 100}%` }}
        />
      </div>

      {/* Image navigation dots */}
      <div className="flex flex-wrap justify-center gap-2">
        {imageIds.map((id, index) => {
          const img = images[id];
          const imgFilledFields = keys.filter(key => img.keys[key]?.trim()).length;
          const isComplete = imgFilledFields === totalFields;

          return (
            <button
              key={id}
              onClick={() => setCurrentIndex(index)}
              className={`size-3 rounded-full transition-colors ${index === safeCurrentIndex
                ? 'bg-blue-500'
                : (isComplete
                  ? 'bg-green-500'
                  : 'bg-zinc-600 hover:bg-zinc-500')
                }`}
              title={`Image ${index + 1}: ${img.name}`}
            />
          );
        })}
      </div>

      {/* Current image editor */}
      <div className="overflow-hidden rounded-xl bg-zinc-800/50">
        <div className="flex flex-col lg:flex-row">
          {/* Image preview */}
          <div className="flex items-center justify-center bg-zinc-900 p-4 lg:w-1/3">
            <img
              src={imageUrl}
              alt={currentImage.name}
              className="max-h-[400px] rounded object-contain"
            />
          </div>

          {/* Form */}
          <div className="flex-1 space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="truncate font-medium text-white" title={currentImage.name}>
                {currentImage.name}
              </h3>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-1 text-sm ${progressPercent === 100 ? 'bg-green-600/20 text-green-400' : 'bg-zinc-700 text-gray-400'
                  }`}>
                  {filledFields}/{totalFields} fields
                </span>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={applyGlobalVariables}
                className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-zinc-600"
              >
                Apply global defaults
              </button>
              {safeCurrentIndex > 0 && (
                <button
                  onClick={copyFromPrevious}
                  className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-zinc-600"
                >
                  Copy from previous
                </button>
              )}
            </div>

            {/* Fields */}
            <div className="grid max-h-[300px] grid-cols-1 gap-4 overflow-y-auto pr-2">
              {keys.map((key) => (
                <div key={key} className="space-y-1">
                  <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                    {key}
                    {globalVariables[key] && !currentImage.keys[key] && (
                      <span className="font-normal normal-case text-blue-400">
                        (default: {globalVariables[key]})
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={currentImage.keys[key] || ''}
                    onChange={(e) => handleKeyChange(key, e.target.value)}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={globalVariables[key] || key}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentIndex(Math.max(0, safeCurrentIndex - 1))}
          disabled={safeCurrentIndex === 0}
          className={`rounded-lg px-6 py-3 font-medium transition-colors ${safeCurrentIndex === 0
            ? 'cursor-not-allowed text-gray-600'
            : 'text-gray-400 hover:text-white'
            }`}
        >
          ← Previous
        </button>

        <div className="flex gap-3">
          {safeCurrentIndex < imageIds.length - 1 ? (
            <button
              onClick={() => setCurrentIndex(safeCurrentIndex + 1)}
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Next image →
            </button>
          ) : (
            <Link
              to="/review"
              className="rounded-lg bg-green-600 px-6 py-3 font-medium text-white transition-colors hover:bg-green-700"
            >
              Go to Review ✓
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
