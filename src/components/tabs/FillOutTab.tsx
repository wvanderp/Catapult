import { useMemo, useState } from 'react';
import { useImageSetStore } from '../../store/imageSetStore';
import { extractTemplateKeys } from '../../utils/templateUtils';

export function FillOutTab() {
  const images = useImageSetStore((state) => state.imageSet.images);
  const template = useImageSetStore((state) => state.imageSet.template);
  const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
  const globalVariables = useImageSetStore((state) => state.imageSet.globalVariables);
  const updateImageKeys = useImageSetStore((state) => state.updateImageKeys);
  const setCurrentTab = useImageSetStore((state) => state.setCurrentTab);

  const imageIds = Object.keys(images);
  const [currentIndex, setCurrentIndex] = useState(0);

  const keys = useMemo(() => extractTemplateKeys(titleTemplate + ' ' + template), [titleTemplate, template]);

  // Ensure current index is valid
  const safeCurrentIndex = Math.min(currentIndex, Math.max(0, imageIds.length - 1));

  if (imageIds.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-xl font-medium text-white mb-2">No images uploaded</h2>
        <p className="text-gray-400 mb-6">Upload some images first to fill out their details.</p>
        <button
          onClick={() => setCurrentTab('upload')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          Go to Upload
        </button>
      </div>
    );
  }

  if (keys.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">📝</div>
        <h2 className="text-xl font-medium text-white mb-2">No variables defined</h2>
        <p className="text-gray-400 mb-6">Add variables to your template first (e.g., {"{{{description}}}"}).</p>
        <button
          onClick={() => setCurrentTab('variables')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          Go to Variables
        </button>
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
        <h2 className="text-2xl font-bold text-white mb-2">Fill Out Details</h2>
        <p className="text-gray-400">
          Image {safeCurrentIndex + 1} of {imageIds.length}
        </p>
      </div>

      {/* Progress bar for all images */}
      <div className="bg-zinc-800 rounded-full h-2 overflow-hidden">
        <div
          className="bg-blue-600 h-full transition-all duration-300"
          style={{ width: `${((safeCurrentIndex + 1) / imageIds.length) * 100}%` }}
        />
      </div>

      {/* Image navigation dots */}
      <div className="flex justify-center gap-2 flex-wrap">
        {imageIds.map((id, index) => {
          const img = images[id];
          const imgFilledFields = keys.filter(key => img.keys[key]?.trim()).length;
          const isComplete = imgFilledFields === totalFields;
          
          return (
            <button
              key={id}
              onClick={() => setCurrentIndex(index)}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === safeCurrentIndex
                  ? 'bg-blue-500'
                  : isComplete
                  ? 'bg-green-500'
                  : 'bg-zinc-600 hover:bg-zinc-500'
              }`}
              title={`Image ${index + 1}: ${img.name}`}
            />
          );
        })}
      </div>

      {/* Current image editor */}
      <div className="bg-zinc-800/50 rounded-xl overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          {/* Image preview */}
          <div className="lg:w-1/3 bg-zinc-900 flex items-center justify-center p-4">
            <img
              src={imageUrl}
              alt={currentImage.name}
              className="max-h-[400px] object-contain rounded"
            />
          </div>

          {/* Form */}
          <div className="flex-1 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium truncate" title={currentImage.name}>
                {currentImage.name}
              </h3>
              <div className="flex items-center gap-2">
                <span className={`text-sm px-2 py-1 rounded ${
                  progressPercent === 100 ? 'bg-green-600/20 text-green-400' : 'bg-zinc-700 text-gray-400'
                }`}>
                  {filledFields}/{totalFields} fields
                </span>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={applyGlobalVariables}
                className="text-sm bg-zinc-700 hover:bg-zinc-600 text-gray-300 px-3 py-1.5 rounded transition-colors"
              >
                Apply global defaults
              </button>
              {safeCurrentIndex > 0 && (
                <button
                  onClick={copyFromPrevious}
                  className="text-sm bg-zinc-700 hover:bg-zinc-600 text-gray-300 px-3 py-1.5 rounded transition-colors"
                >
                  Copy from previous
                </button>
              )}
            </div>

            {/* Fields */}
            <div className="grid grid-cols-1 gap-4 max-h-[300px] overflow-y-auto pr-2">
              {keys.map((key) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    {key}
                    {globalVariables[key] && !currentImage.keys[key] && (
                      <span className="text-blue-400 normal-case font-normal">
                        (default: {globalVariables[key]})
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={currentImage.keys[key] || ''}
                    onChange={(e) => handleKeyChange(key, e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    placeholder={globalVariables[key] || key}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => setCurrentIndex(Math.max(0, safeCurrentIndex - 1))}
          disabled={safeCurrentIndex === 0}
          className={`font-medium px-6 py-3 rounded-lg transition-colors ${
            safeCurrentIndex === 0
              ? 'text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          ← Previous
        </button>
        
        <div className="flex gap-3">
          {safeCurrentIndex < imageIds.length - 1 ? (
            <button
              onClick={() => setCurrentIndex(safeCurrentIndex + 1)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
            >
              Next image →
            </button>
          ) : (
            <button
              onClick={() => setCurrentTab('review')}
              className="bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
            >
              Go to Review ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
