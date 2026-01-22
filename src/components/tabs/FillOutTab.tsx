import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useImageSetStore } from '../../store/imageSetStore';
import { extractTemplateKeys, type TemplateContext } from '../../utils/templateUtils';
import { ImageCarousel, type CarouselImage } from '../ImageCarousel';
import { FieldInput } from '../FieldInput';
import { ContextDataPanel } from '../ContextDataPanel';
import { ImageViewer } from '../ImageViewer';
import { createUtilityContext } from '../../utils/utilityContext';
import { useImageUrl } from '../../hooks/useImageData';

/**
 * FillOutTab provides the interface for filling out metadata for each uploaded image.
 * Features:
 * - Image carousel for navigation between images
 * - Form fields for all template variables
 * - Automatic prefilling from global variables
 * - Copy from previous image functionality
 * - Progress tracking per image
 * - Support for EXIF, global, and utility context references
 *
 * The component automatically persists prefilled global variable values when navigating
 * between images to ensure data consistency.
 *
 * @returns The fill out tab component
 */
export function FillOutTab() {
  const images = useImageSetStore((state) => state.imageSet.images);
  const imageOrder = useImageSetStore((state) => state.imageSet.imageOrder);
  const template = useImageSetStore((state) => state.imageSet.template);
  const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
  const globalVariables = useImageSetStore((state) => state.imageSet.globalVariables);
  const updateImageKeys = useImageSetStore((state) => state.updateImageKeys);

  // Use imageOrder for correct ordering, filtering to only include existing images
  // Falls back to Object.keys(images) for backwards compatibility with old data
  const imageIds = useMemo(() => {
    const imageKeys = Object.keys(images);
    if (imageOrder.length > 0) {
      return imageOrder.filter(id => id in images);
    }
    return imageKeys;
  }, [images, imageOrder]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeFieldKey, setActiveFieldKey] = useState<string>();
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);

  const keys = useMemo(() => {
    const allKeys = extractTemplateKeys(titleTemplate + ' ' + template);
    // Filter out global.*, exif.*, and utility.* prefixed keys as those are special references
    return allKeys.filter(key => !key.startsWith('global.') && !key.startsWith('exif.') && !key.startsWith('utility.'));
  }, [titleTemplate, template]);

  const safeCurrentIndex = Math.min(currentIndex, Math.max(0, imageIds.length - 1));
  const currentId = imageIds[safeCurrentIndex];
  const currentImage = images[currentId];

  // Hook must be called unconditionally before any early returns
  const { imageUrl, isLoading: isImageLoading } = useImageUrl(currentImage?.id);

  const carouselImages = useMemo<CarouselImage[]>(() => {
    return imageIds.map(id => ({
      id,
      name: images[id].name,
      mimeType: images[id].mimeType,
    }));
  }, [imageIds, images]);

  /**
   * Get the effective value for a field key for a specific image.
   * If the image has a value, use that. Otherwise, if there's a matching global variable, use that.
   */
  const getEffectiveValueForImage = useCallback((imageKeys: Record<string, string>, key: string): string => {
    const imageValue = imageKeys[key];
    if (imageValue !== undefined && imageValue !== '') {
      return imageValue;
    }
    // Pre-fill from global variable if the key matches exactly
    return globalVariables[key] ?? '';
  }, [globalVariables]);

  /**
   * Persist prefilled global variable values to the image's keys.
   * This ensures that values shown in the UI are actually saved to the store.
   */
  const commitPrefilledValues = useCallback((imageId: string) => {
    const image = images[imageId];
    if (!image) return;

    const updatedKeys: Record<string, string> = { ...image.keys };
    let hasChanges = false;

    for (const key of keys) {
      const imageValue = image.keys[key];
      const globalValue = globalVariables[key];
      // If the image doesn't have a value but there's a global value, persist it
      if ((imageValue === undefined || imageValue === '') && globalValue) {
        updatedKeys[key] = globalValue;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      updateImageKeys(imageId, updatedKeys);
    }
  }, [images, keys, globalVariables, updateImageKeys]);

  // Track the previous image ID to commit prefilled values when navigating away
  const previousImageIdReference = useRef<string | undefined>(undefined);

  // Commit prefilled values when navigating between images
  useEffect(() => {
    // If we had a previous image, commit its prefilled values
    if (previousImageIdReference.current && previousImageIdReference.current !== currentId) {
      commitPrefilledValues(previousImageIdReference.current);
    }
    // Also commit prefilled values for the current image on mount/change
    if (currentId) {
      commitPrefilledValues(currentId);
    }
    previousImageIdReference.current = currentId;
  }, [currentId, commitPrefilledValues]);

  /**
   * Determine completion status of an image based on filled template fields.
   *
   * @param image - The image to check completion status for
   * @returns 'complete' if all fields filled, 'partial' if some filled, 'empty' if none filled
   */
  function getCompletionStatus(image: CarouselImage): 'complete' | 'partial' | 'empty' {
    const fullImage = images[image.id];
    const filledFields = keys.filter(key => getEffectiveValueForImage(fullImage.keys, key).trim()).length;
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

  /**
   * Update a template variable value for the current image.
   *
   * @param key - The template variable key to update
   * @param value - The new value for the variable
   */
  function handleKeyChange(key: string, value: string) {
    updateImageKeys(currentId, {
      ...currentImage.keys,
      [key]: value,
    });
  }

  /**
   * Get the effective value for a field key for the current image.
   * Returns the image-specific value or falls back to the global variable value.
   *
   * @param key - The template variable key to get value for
   * @returns The effective value (image-specific or global fallback)
   */
  function getEffectiveValue(key: string): string {
    return getEffectiveValueForImage(currentImage.keys, key);
  }

  /**
   * Insert a context reference (EXIF, global, or utility) into the active field.
   * Appends the reference to the current field value.
   *
   * @param reference - The reference string to insert (e.g., "<<<exif.Make>>>")
   */
  function handleInsertReference(reference: string) {
    if (!activeFieldKey) return;
    const currentValue = currentImage.keys[activeFieldKey] ?? '';
    handleKeyChange(activeFieldKey, currentValue + reference);
  }

  /**
   * Copy all template variable values from the previous image to the current image.
   * Only works if there is a previous image in the list.
   */
  function copyFromPrevious() {
    if (safeCurrentIndex > 0) {
      const previousId = imageIds[safeCurrentIndex - 1];
      const previousImage = images[previousId];
      updateImageKeys(currentId, { ...previousImage.keys });
    }
  }

  /**
   * Navigate to the previous image in the list.
   * Clears the active field selection.
   */
  function handleNavigatePrevious() {
    setCurrentIndex(Math.max(0, safeCurrentIndex - 1));
    setActiveFieldKey(undefined);
  }

  /**
   * Navigate to the next image in the list.
   * Clears the active field selection.
   */
  function handleNavigateNext() {
    setCurrentIndex(safeCurrentIndex + 1);
    setActiveFieldKey(undefined);
  }

  /**
   * Select a specific image by index from the carousel.
   * Clears the active field selection.
   *
   * @param index - The index of the image to select
   */
  function handleSelectImage(index: number) {
    setCurrentIndex(index);
    setActiveFieldKey(undefined);
  }

  const filledFields = keys.filter(key => getEffectiveValue(key).trim()).length;
  const totalFields = keys.length;
  const progressPercent = Math.round((filledFields / totalFields) * 100);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header with navigation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Fill Out Details</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-300">
              Image {safeCurrentIndex + 1} of {imageIds.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleNavigatePrevious}
                disabled={safeCurrentIndex === 0}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${safeCurrentIndex === 0
                  ? 'cursor-not-allowed bg-zinc-800 text-gray-600'
                  : 'bg-zinc-700 text-gray-200 hover:bg-zinc-600'
                  }`}
              >
                ← Prev
              </button>
              {safeCurrentIndex < imageIds.length - 1 ? (
                <button
                  onClick={handleNavigateNext}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Next →
                </button>
              ) : (
                <Link
                  to="/review"
                  className="inline-flex items-center rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
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
      <div className="grid flex-1 gap-3 overflow-hidden lg:grid-cols-[400px_1fr]">
        {/* Image preview */}
        <div
          className="flex cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-zinc-900 p-3 ring-1 ring-zinc-800 transition-all hover:bg-zinc-850 hover:ring-zinc-700"
          onClick={() => setIsImageViewerOpen(true)}
          title="Click to view fullscreen"
        >
          {isImageLoading ? (
            <div className="flex size-full items-center justify-center">
              <div className="size-8 animate-spin rounded-full border-4 border-zinc-600 border-t-zinc-400" />
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={currentImage.name}
              className="h-full w-full rounded object-contain"
            />
          )}
        </div>

        {/* Form fields */}
        <div className="flex flex-col overflow-hidden rounded-lg bg-zinc-800/50 ring-1 ring-zinc-700/50">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-700/50 px-4 py-3">
            <h3 className="truncate font-medium text-white" title={currentImage.name}>
              {currentImage.name}
            </h3>
            <div className="flex items-center gap-2">
              <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${progressPercent === 100 ? 'bg-green-600/20 text-green-400 ring-1 ring-green-500/30' : 'bg-zinc-700 text-gray-300'
                }`}>
                {filledFields}/{totalFields}
              </span>
              {safeCurrentIndex > 0 && (
                <button
                  onClick={copyFromPrevious}
                  className="rounded-lg bg-zinc-700 px-3 py-1 text-xs font-medium text-gray-200 transition-colors hover:bg-zinc-600"
                >
                  Copy from previous
                </button>
              )}
            </div>
          </div>

          <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
            {keys.map((key) => {
              const templateContext: TemplateContext = {
                ...currentImage.keys,
                global: globalVariables,
                exif: currentImage.exifData,
                utility: createUtilityContext(currentImage, safeCurrentIndex),
              };
              const effectiveValue = getEffectiveValue(key);

              return (
                <FieldInput
                  key={key}
                  fieldKey={key}
                  value={effectiveValue}
                  onChange={(value) => handleKeyChange(key, value)}
                  onFocus={() => setActiveFieldKey(key)}
                  template={template}
                  templateContext={templateContext}
                />
              );
            })}
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
        utility={createUtilityContext(currentImage, safeCurrentIndex)}
      />

      {/* Image viewer modal - conditionally rendered to reset state on close */}
      {isImageViewerOpen && (
        <ImageViewer
          imageUrl={imageUrl ?? ''}
          imageName={currentImage.name}
          isOpen={isImageViewerOpen}
          onClose={() => setIsImageViewerOpen(false)}
        />
      )}
    </div>
  );
}
