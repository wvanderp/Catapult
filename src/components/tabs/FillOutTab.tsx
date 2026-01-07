import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useImageSetStore } from '../../store/imageSetStore';
import { extractTemplateKeys } from '../../utils/templateUtils';
import { ImageCarousel, type CarouselImage } from '../ImageCarousel';
import { FieldInput } from '../FieldInput';
import { ContextDataPanel } from '../ContextDataPanel';

export function FillOutTab() {
  const images = useImageSetStore((state) => state.imageSet.images);
  const template = useImageSetStore((state) => state.imageSet.template);
  const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
  const globalVariables = useImageSetStore((state) => state.imageSet.globalVariables);
  const updateImageKeys = useImageSetStore((state) => state.updateImageKeys);

  const imageIds = useMemo(() => Object.keys(images), [images]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeFieldKey, setActiveFieldKey] = useState<string>();

  const keys = useMemo(() => {
    const allKeys = extractTemplateKeys(titleTemplate + ' ' + template);
    // Filter out global.*, exif.*, and utility.* prefixed keys as those are special references
    return allKeys.filter(key => !key.startsWith('global.') && !key.startsWith('exif.') && !key.startsWith('utility.'));
  }, [titleTemplate, template]);

  const safeCurrentIndex = Math.min(currentIndex, Math.max(0, imageIds.length - 1));

  const carouselImages = useMemo<CarouselImage[]>(() => {
    return imageIds.map(id => ({
      id,
      name: images[id].name,
      mimeType: images[id].mimeType,
      file: images[id].file,
    }));
  }, [imageIds, images]);

  function getCompletionStatus(image: CarouselImage): 'complete' | 'partial' | 'empty' {
    const fullImage = images[image.id];
    const filledFields = keys.filter(key => fullImage.keys[key]?.trim()).length;
    const totalFields = keys.length;
    if (filledFields === totalFields) return 'complete';
    if (filledFields > 0) return 'partial';
    return 'empty';
  }

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
        <p className="mb-6 text-gray-400">Add variables to your template first (e.g., {"<<<description>>>"}).</p>
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

  // Extract file extension for utility context
  const currentExtension = currentImage.name.includes('.')
    ? currentImage.name.split('.').pop()?.toLowerCase() ?? ''
    : '';

  function handleKeyChange(key: string, value: string) {
    updateImageKeys(currentId, {
      ...currentImage.keys,
      [key]: value,
    });
  }

  function handleInsertReference(reference: string) {
    if (!activeFieldKey) return;
    const currentValue = currentImage.keys[activeFieldKey] ?? '';
    handleKeyChange(activeFieldKey, currentValue + reference);
  }

  function copyFromPrevious() {
    if (safeCurrentIndex > 0) {
      const previousId = imageIds[safeCurrentIndex - 1];
      const previousImage = images[previousId];
      updateImageKeys(currentId, { ...previousImage.keys });
    }
  }

  function handleNavigatePrevious() {
    setCurrentIndex(Math.max(0, safeCurrentIndex - 1));
    setActiveFieldKey(undefined);
  }

  function handleNavigateNext() {
    setCurrentIndex(safeCurrentIndex + 1);
    setActiveFieldKey(undefined);
  }

  function handleSelectImage(index: number) {
    setCurrentIndex(index);
    setActiveFieldKey(undefined);
  }

  const filledFields = keys.filter(key => currentImage.keys[key]?.trim()).length;
  const totalFields = keys.length;
  const progressPercent = Math.round((filledFields / totalFields) * 100);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header with navigation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Fill Out Details</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              Image {safeCurrentIndex + 1} of {imageIds.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleNavigatePrevious}
                disabled={safeCurrentIndex === 0}
                className={`rounded px-3 py-1.5 text-sm transition-colors ${safeCurrentIndex === 0
                  ? 'cursor-not-allowed text-gray-600'
                  : 'bg-zinc-700 text-gray-300 hover:bg-zinc-600'
                  }`}
              >
                ← Prev
              </button>
              {safeCurrentIndex < imageIds.length - 1 ? (
                <button
                  onClick={handleNavigateNext}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-700"
                >
                  Next →
                </button>
              ) : (
                <Link
                  to="/review"
                  className="rounded bg-green-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-green-700"
                >
                  Review ✓
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Image carousel */}
        <ImageCarousel
          images={carouselImages}
          currentIndex={safeCurrentIndex}
          onSelectImage={handleSelectImage}
          getCompletionStatus={getCompletionStatus}
        />
      </div>

      {/* Main content area */}
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Image preview */}
        <div className="flex items-center justify-center rounded-xl bg-zinc-900 p-4">
          <img
            src={imageUrl}
            alt={currentImage.name}
            className="max-h-[300px] rounded object-contain lg:max-h-[400px]"
          />
        </div>

        {/* Form fields */}
        <div className="space-y-4 rounded-xl bg-zinc-800/50 p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="truncate font-medium text-white" title={currentImage.name}>
              {currentImage.name}
            </h3>
            <div className="flex items-center gap-2">
              <span className={`rounded px-2 py-1 text-sm ${progressPercent === 100 ? 'bg-green-600/20 text-green-400' : 'bg-zinc-700 text-gray-400'
                }`}>
                {filledFields}/{totalFields}
              </span>
              {safeCurrentIndex > 0 && (
                <button
                  onClick={copyFromPrevious}
                  className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-zinc-600"
                >
                  Copy from previous
                </button>
              )}
            </div>
          </div>

          <div className="grid max-h-[250px] grid-cols-1 gap-3 overflow-y-auto pr-2 md:grid-cols-2">
            {keys.map((key) => (
              <FieldInput
                key={key}
                fieldKey={key}
                value={currentImage.keys[key] ?? ''}
                onChange={(value) => handleKeyChange(key, value)}
                onFocus={() => setActiveFieldKey(key)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Combined context panel */}
      <ContextDataPanel
        globalVariables={globalVariables}
        exifData={currentImage.exifData ?? {}}
        templateKeys={keys}
        activeFieldKey={activeFieldKey}
        onInsertReference={handleInsertReference}
        utility={{
          extension: currentExtension,
          index: safeCurrentIndex,
        }}
      />
    </div>
  );
}
