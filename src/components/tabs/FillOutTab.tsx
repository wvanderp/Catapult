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
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 flex size-20 items-center justify-center rounded-2xl bg-zinc-800/60 ring-1 ring-zinc-700/50">
          <svg className="size-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-bold text-white">No images selected</h2>
        <p className="mb-8 max-w-sm text-zinc-500">Add images first, then return here to fill out their details.</p>
        <Link
          to="/upload"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white transition-all duration-200 hover:bg-teal-500"
        >
          Go to Upload
        </Link>
      </div>
    );
  }

  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 flex size-20 items-center justify-center rounded-2xl bg-zinc-800/60 ring-1 ring-zinc-700/50">
          <svg className="size-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-bold text-white">No variables to fill out</h2>
        <p className="mb-8 max-w-sm text-zinc-500">Your templates don't have any placeholders. Add some (e.g., {"<<<description>>>"}) to customize each image.</p>
        <Link
          to="/variables"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white transition-all duration-200 hover:bg-teal-500"
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
    <div className="flex h-full flex-col gap-5 p-5">
      {/* Header with navigation */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold tracking-tight text-white">Fill Out Image Details</h2>
            <span className="flex items-center gap-2 rounded-lg bg-zinc-800/60 px-3 py-1.5 text-sm font-medium text-zinc-400 ring-1 ring-zinc-700/50">
              Image <span className="font-bold text-white">{safeCurrentIndex + 1}</span> of {imageIds.length}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleNavigatePrevious}
              disabled={safeCurrentIndex === 0}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${safeCurrentIndex === 0
                ? 'cursor-not-allowed bg-zinc-900/50 text-zinc-700'
                : 'border border-zinc-700/80 bg-zinc-800/80 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-700 hover:text-white'
                }`}
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            {safeCurrentIndex < imageIds.length - 1 ? (
              <button
                onClick={handleNavigateNext}
                className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-teal-500"
              >
                Next
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <Link
                to="/review"
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-emerald-500"
              >
                Review
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </Link>
            )}
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
      <div className="grid flex-1 gap-5 overflow-hidden lg:grid-cols-[400px_1fr]">
        {/* Image preview */}
        <div
          className="group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-zinc-900/80 ring-1 ring-zinc-800/60 transition-all duration-200 hover:ring-zinc-700/60"
          onClick={() => setIsImageViewerOpen(true)}
          title="Click to view fullscreen"
        >
          {isImageLoading ? (
            <div className="flex size-full items-center justify-center py-20">
              <div className="size-10 animate-spin rounded-full border-3 border-zinc-700 border-t-teal-400" />
            </div>
          ) : (
            <>
              <img
                src={imageUrl}
                alt={currentImage.name}
                className="h-full max-h-[50vh] w-full rounded-xl object-contain p-4"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/40 group-hover:opacity-100">
                <span className="flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                  Enlarge image
                </span>
              </div>
            </>
          )}
        </div>

        {/* Form fields */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/60 backdrop-blur-md">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-800/50 px-5 py-4">
            <h3 className="truncate font-semibold text-white" title={currentImage.name}>
              {currentImage.name}
            </h3>
            <div className="flex items-center gap-3">
              <span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${progressPercent === 100
                ? 'bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/25'
                : 'bg-zinc-800/80 text-zinc-400 ring-1 ring-zinc-700/50'
                }`}>
                {filledFields}/{totalFields}
              </span>
              {safeCurrentIndex > 0 && (
                <button
                  onClick={copyFromPrevious}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-all duration-200 hover:border-zinc-600/50 hover:bg-zinc-700/50"
                >
                  <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy from previous
                </button>
              )}
            </div>
          </div>

          <div className="grid flex-1 auto-rows-min grid-cols-1 gap-5 overflow-y-auto p-5 md:grid-cols-2 xl:grid-cols-3">
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

