import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useImageSetStore, type Image } from '../../store/imageSetStore';
import { applyTemplate } from '../../utils/templateUtils';
import { createUtilityContext } from '../../utils/utilityContext';
import { getImageAsFile } from '../../utils/imageBlobStorage';
import { useImageUrl } from '../../hooks/useImageData';

import { useWikimediaCommons, type UploadWarning } from '../../hooks/useWikimediaCommons';

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error' | 'warning';

/**
 * Determine the progress bar color based on upload results.
 *
 * @param errorCount - Number of images with errors
 * @param warningCount - Number of images with warnings
 * @returns CSS color class for the progress bar
 */
function getProgressBarColor(errorCount: number, warningCount: number): string {
  if (errorCount > 0) return 'bg-yellow-500';
  if (warningCount > 0) return 'bg-orange-500';
  return 'bg-green-500';
}

interface ReviewItemProperties {
  image: Image;
  title: string;
  description: string;
  uploadStatus?: UploadStatus;
  onToggleReviewed: () => void;
}

const MISSING_PLACEHOLDER = '<<<missing>>>';

/**
 * Render text with highlighted missing placeholders.
 * Wraps <<<missing>>> placeholders in styled spans for visual emphasis.
 *
 * @param text - The text to render with potential missing placeholders
 * @returns React nodes with highlighted missing placeholders
 */
function renderWithHighlights(text: string): React.ReactNode {
  if (!text) return text;
  const parts = text.split(MISSING_PLACEHOLDER);
  return parts.flatMap((part, index) => {
    const elements: (string | React.ReactNode)[] = [part];
    if (index < parts.length - 1) {
      elements.push(
        <span key={index} className="rounded bg-zinc-800 px-1 font-mono text-red-400">
          {MISSING_PLACEHOLDER}
        </span>,
      );
    }
    return elements;
  });
}

interface UploadStatusIndicatorProperties {
  status?: UploadStatus;
  isReviewed: boolean;
  onToggleReviewed: () => void;
}

/**
 * UploadStatusIndicator displays the current upload status or review checkbox.
 * Shows different UI based on upload status:
 * - Success: green checkmark with "Uploaded" text
 * - Uploading: spinning loader with "Uploading..." text
 * - Pending: "Waiting..." text
 * - Otherwise: checkbox to mark image as ready for upload
 *
 * @param props - The props object
 * @param props.status - Current upload status
 * @param props.isReviewed - Whether the image is marked as reviewed/ready
 * @param props.onToggleReviewed - Callback to toggle the reviewed state
 * @returns The upload status indicator component
 */
function UploadStatusIndicator({ status, isReviewed, onToggleReviewed }: UploadStatusIndicatorProperties) {
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-green-400">
        <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        Uploaded
      </span>
    );
  }

  if (status === 'uploading') {
    return (
      <span className="flex items-center gap-2 text-sm font-medium text-blue-400">
        <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Uploading...
      </span>
    );
  }

  if (status === 'pending') {
    return <span className="text-sm font-medium text-gray-400">Waiting...</span>;
  }

  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={isReviewed}
        onChange={onToggleReviewed}
        className="size-5 rounded border-zinc-600 bg-zinc-800 text-green-600 focus:ring-green-500"
      />
      <span className={`text-sm font-medium ${isReviewed ? 'text-green-400' : 'text-gray-400'}`}>
        {isReviewed ? 'Ready' : 'Mark ready'}
      </span>
    </label>
  );
}

/**
 * ReviewItem displays a single image's review card with:
 * - Thumbnail preview
 * - Filename and Commons title
 * - Template preview with expandable description
 * - Upload status indicator
 * - Success banner with link to Commons (when uploaded)
 * - Warning indicator for unfilled variables
 *
 * @param props - The props object
 * @param props.image - The image data
 * @param props.title - The computed title for the image
 * @param props.description - The computed description from template
 * @param props.uploadStatus - Current upload status
 * @param props.onToggleReviewed - Callback to toggle reviewed state
 * @returns The review item component
 */
function ReviewItem({ image, title, description, uploadStatus, onToggleReviewed }: ReviewItemProperties) {
  const { imageUrl, isLoading } = useImageUrl(image.id);

  const hasUnfilledVariables = title.includes(MISSING_PLACEHOLDER) || description.includes(MISSING_PLACEHOLDER);

  const isUploaded = uploadStatus === 'success';

  /**
   * Determine the border color based on upload status and review state.
   *
   * @returns CSS border color class
   */
  function getBorderColor(): string {
    if (uploadStatus === 'uploading') return 'border-blue-500';
    if (isUploaded) return 'border-green-500';
    if (image.reviewed) return 'border-green-600/50';
    if (hasUnfilledVariables) return 'border-yellow-600';
    return 'border-zinc-700';
  }

  /**
   * Determine the background color based on upload status.
   *
   * @returns CSS background color class
   */
  function getBackgroundColor(): string {
    if (isUploaded) return 'bg-green-900/20';
    return 'bg-zinc-800/50';
  }

  return (
    <div className={`overflow-hidden rounded-xl border ${getBorderColor()} ${getBackgroundColor()} transition-all`}>
      {/* Success banner for uploaded images */}
      {isUploaded && image.uploadUrl && (
        <div className="flex items-center justify-between bg-green-600 px-4 py-3">
          <div className="flex items-center gap-2">
            <svg className="size-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium text-white">Successfully uploaded to Wikimedia Commons</span>
          </div>
          <a
            href={image.uploadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 font-medium text-white transition-colors hover:bg-white/30"
          >
            View on Commons
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      )}

      <div className="flex items-start gap-4 p-4">
        {/* Thumbnail */}
        <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
          {isLoading ? (
            <div className="flex size-full items-center justify-center">
              <div className="size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-400" />
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={image.name}
              className="size-full object-cover"
            />
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-wider text-gray-500">File</span>
                <span className="truncate text-sm text-gray-400">{image.name}</span>
              </div>

              <div>
                <span className="text-xs uppercase tracking-wider text-gray-500">Commons Title</span>
                <h4 className="mt-0.5 break-words font-medium text-white" title={title}>
                  {title ? renderWithHighlights(title) : <span className="italic text-gray-500">No title</span>}
                </h4>
              </div>

              {hasUnfilledVariables && !isUploaded && (
                <p className="flex items-center gap-1 text-xs text-yellow-400">
                  ⚠️ Some variables are not filled in
                </p>
              )}
            </div>

            {/* Status / Review checkbox */}
            <div className="flex shrink-0 items-center">
              <UploadStatusIndicator
                status={uploadStatus}
                isReviewed={image.reviewed}
                onToggleReviewed={onToggleReviewed}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Template preview */}
      <div className="border-t border-zinc-700/50 bg-zinc-900/30">
        <details className="group" open={uploadStatus === 'pending' || uploadStatus === undefined}>
          <summary className="flex cursor-pointer items-center justify-between px-4 py-2 text-xs uppercase tracking-wider text-gray-500 hover:text-gray-400">
            <span>Description Template</span>
            <svg className="size-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-4 pb-4">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm text-gray-300">
              {renderWithHighlights(description)}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}

/**
 * ReviewTab provides the final review and upload interface.
 * Features:
 * - Review all images with their computed titles and descriptions
 * - Mark images as ready for upload
 * - Bulk upload to Wikimedia Commons
 * - Upload progress tracking
 * - Warning and error handling
 * - Success status with links to uploaded files
 * - Option to start new batch after upload
 *
 * Handles authentication, CSRF token retrieval, and upload workflow.
 *
 * @returns The review tab component
 */
export function ReviewTab() {
  const images = useImageSetStore((state) => state.imageSet.images);
  const imageOrder = useImageSetStore((state) => state.imageSet.imageOrder);
  const template = useImageSetStore((state) => state.imageSet.template);
  const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
  const globalVariables = useImageSetStore((state) => state.imageSet.globalVariables);
  const setImageReviewed = useImageSetStore((state) => state.setImageReviewed);
  const setImageUploaded = useImageSetStore((state) => state.setImageUploaded);
  const setImageUploadStatus = useImageSetStore((state) => state.setImageUploadStatus);
  const clearAllImages = useImageSetStore((state) => state.clearAllImages);
  const navigate = useNavigate();

  const { uploadFile, isAuthenticated } = useWikimediaCommons();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadWarnings, setUploadWarnings] = useState<Record<string, { warnings: UploadWarning[]; filekey?: string; file: File; title: string; description: string }>>({});

  // Use imageOrder for correct ordering, filtering to only include existing images
  // Falls back to Object.keys(images) for backwards compatibility with old data
  const imageKeys = Object.keys(images);
  const imageIds = imageOrder.length > 0
    ? imageOrder.filter(id => id in images)
    : imageKeys;

  const reviewedCount = Object.values(images).filter((img) => img.reviewed).length;
  const allReviewed = reviewedCount === imageIds.length && imageIds.length > 0;

  // Generate titles and descriptions for all images
  const processedImages = useMemo(() => {
    return imageIds.map((id, index) => {
      const image = images[id];
      const context = {
        ...image.keys,
        exif: image.exifData ?? {},
        global: globalVariables,
        utility: createUtilityContext(image, index),
      };
      const title = applyTemplate(titleTemplate, context);
      const description = applyTemplate(template, context);
      return { id, image, title, description };
    });
  }, [imageIds, images, titleTemplate, template, globalVariables]);

  const toggleAllReviewed = (reviewed: boolean) => {
    for (const id of imageIds) setImageReviewed(id, reviewed);
  };

  const handleUploadAll = async () => {
    if (!isAuthenticated) {
      alert('Please log in to upload files');
      return;
    }

    setIsUploading(true);
    // Set all reviewed images to pending status
    for (const id of imageIds) {
      if (images[id].reviewed) {
        setImageUploadStatus(id, 'pending');
      }
    }
    setUploadWarnings({});

    for (const { id, image, title, description } of processedImages) {
      if (!image.reviewed) continue;

      setImageUploadStatus(id, 'uploading');

      try {
        // Get the File from IndexedDB
        const file = await getImageAsFile(image.id, image.name);
        if (!file) {
          setImageUploadStatus(id, 'error', 'Image data not found');
          continue;
        }

        const result = await uploadFile(file, title, description);

        if (result.success) {
          const uploadUrl = result.filename
            ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(result.filename)}`
            : undefined;
          setImageUploaded(id, true, uploadUrl);
        } else if (result.warnings && result.warnings.length > 0) {
          // File has warnings - let user decide
          setImageUploadStatus(id, 'warning');
          setUploadWarnings((previous) => ({
            ...previous,
            [id]: {
              warnings: result.warnings!, // We already checked it's defined above
              filekey: result.filekey,
              file,
              title,
              description,
            },
          }));
        } else {
          setImageUploadStatus(id, 'error', result.error || 'Upload failed');
        }
      } catch (error) {
        setImageUploadStatus(id, 'error', error instanceof Error ? error.message : 'Upload failed');
      }
    }

    setIsUploading(false);
  };

  const handleForceUpload = async (id: string) => {
    const warningData = uploadWarnings[id];
    if (!warningData) return;

    setImageUploadStatus(id, 'uploading');

    try {
      const result = await uploadFile(
        warningData.file,
        warningData.title,
        warningData.description,
        { ignorewarnings: true, filekey: warningData.filekey }
      );

      if (result.success) {
        const uploadUrl = result.filename
          ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(result.filename)}`
          : undefined;
        setImageUploaded(id, true, uploadUrl);
        setUploadWarnings((previous) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [id]: _removed, ...rest } = previous;
          return rest;
        });
      } else {
        setImageUploadStatus(id, 'error', result.error || 'Upload failed');
      }
    } catch (error) {
      setImageUploadStatus(id, 'error', error instanceof Error ? error.message : 'Upload failed');
    }
  };

  const handleSkipWarning = (id: string) => {
    setImageUploadStatus(id, 'error', 'Skipped due to warnings');
    setUploadWarnings((previous) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _removed, ...rest } = previous;
      return rest;
    });
  };

  const imagesWithStatus = Object.values(images).filter((img) => img.uploadStatus);
  const successCount = imagesWithStatus.filter((img) => img.uploadStatus === 'success').length;
  const errorCount = imagesWithStatus.filter((img) => img.uploadStatus === 'error').length;
  const warningCount = imagesWithStatus.filter((img) => img.uploadStatus === 'warning').length;
  const uploadComplete = imagesWithStatus.length > 0 &&
    imagesWithStatus.every((img) => img.uploadStatus === 'success' || img.uploadStatus === 'error');

  if (imageIds.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 text-5xl">📭</div>
        <h2 className="mb-2 text-xl font-medium text-white">No images to review</h2>
        <p className="mb-6 text-gray-400">Upload some images first.</p>
        <Link
          to="/upload"
          className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
        >
          Go to Upload
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold text-white">Review & Upload</h2>
        <p className="text-gray-400">
          Check each image and mark it as ready before uploading
        </p>
      </div>

      {/* Progress summary */}
      <div className="flex items-center justify-between rounded-xl bg-zinc-800/50 p-4">
        <div className="flex items-center gap-4">
          <div className={`text-lg font-medium ${allReviewed ? 'text-green-400' : 'text-gray-300'}`}>
            {reviewedCount} / {imageIds.length} ready
          </div>
          <button
            onClick={() => toggleAllReviewed(false)}
            className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-zinc-600"
          >
            Unmark all
          </button>
        </div>

        {!isAuthenticated && (
          <div className="text-sm text-yellow-400">
            ⚠️ Please log in to upload
          </div>
        )}
      </div>

      {/* Upload progress/results */}
      {imagesWithStatus.length > 0 && (
        <div className="rounded-xl bg-zinc-800/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-white">Upload Progress</span>
            <span className="text-sm text-gray-400">
              {successCount} succeeded, {errorCount} failed{warningCount > 0 ? `, ${warningCount} need attention` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-700">
            <div
              className={`h-full transition-all duration-300 ${getProgressBarColor(errorCount, warningCount)}`}
              style={{ width: `${((successCount + errorCount) / imagesWithStatus.length) * 100}%` }}
            />
          </div>
          {warningCount > 0 && (
            <div className="mt-4 rounded-lg border border-orange-600/50 bg-orange-900/20 p-3">
              <p className="mb-2 text-sm text-orange-400">
                ⚠️ {warningCount} file(s) have warnings. Please review and decide whether to force upload or skip them.
              </p>
            </div>
          )}
          {uploadComplete && successCount === imagesWithStatus.length && (
            <div className="mt-4 text-center">
              <p className="mb-3 font-medium text-green-400">All uploads completed successfully! 🎉</p>
              <button
                onClick={() => {
                  clearAllImages();
                  navigate({ to: '/upload' });
                }}
                className="rounded-lg bg-green-600 px-6 py-2 font-medium text-white transition-colors hover:bg-green-700"
              >
                Start new batch
              </button>
            </div>
          )}
        </div>
      )}

      {/* Image list */}
      <div className="space-y-3">
        {processedImages.map(({ id, image, title, description }) => (
          <div key={id}>
            <ReviewItem
              image={image}
              title={title}
              description={description}
              uploadStatus={image.uploadStatus}
              onToggleReviewed={() => setImageReviewed(id, !image.reviewed)}
            />
            {/* Warning details and actions */}
            {image.uploadStatus === 'warning' && uploadWarnings[id] && (
              <div className="mx-4 -mt-px rounded-b-lg border border-t-0 border-orange-600/50 bg-orange-900/20 p-3">
                <p className="mb-2 text-sm font-medium text-orange-400">Warnings:</p>
                <ul className="mb-3 space-y-1 text-sm text-orange-300">
                  {uploadWarnings[id].warnings.map((warning, index) => (
                    <li key={index}>
                      • {warning.message}
                      {warning.duplicateFiles && (
                        <span className="text-orange-400"> ({warning.duplicateFiles.join(', ')})</span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleForceUpload(id)}
                    className="rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-700"
                  >
                    Upload Anyway
                  </button>
                  <button
                    onClick={() => handleSkipWarning(id)}
                    className="rounded bg-zinc-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-zinc-700"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
            {/* Error display */}
            {image.uploadStatus === 'error' && image.uploadError && (
              <div className="mx-4 -mt-px rounded-b-lg border border-t-0 border-red-600/50 bg-red-900/20 p-3">
                <p className="text-sm text-red-400">
                  <span className="font-medium">Error:</span> {image.uploadError}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation and upload button */}
      <div className="flex items-center justify-between">
        <Link
          to="/fillout"
          className="px-6 py-3 font-medium text-gray-400 transition-colors hover:text-white"
        >
          ← Back to Fill Out
        </Link>

        <button
          onClick={handleUploadAll}
          disabled={!allReviewed || isUploading || !isAuthenticated}
          className={`rounded-lg px-8 py-3 font-medium transition-colors ${allReviewed && !isUploading && isAuthenticated
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'cursor-not-allowed bg-zinc-700 text-gray-500'
            }`}
        >
          {isUploading ? 'Uploading...' : `Upload ${reviewedCount} image${reviewedCount === 1 ? '' : 's'} to Commons`}
        </button>
      </div>
    </div>
  );
}
