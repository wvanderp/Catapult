import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useImageSetStore, type Image } from '../../store/imageSetStore';
import { applyTemplate } from '../../utils/templateUtils';

import { useWikimediaCommons, type UploadWarning } from '../../hooks/useWikimediaCommons';

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error' | 'warning';

function getProgressBarColor(errorCount: number, warningCount: number): string {
  if (errorCount > 0) return 'bg-yellow-500';
  if (warningCount > 0) return 'bg-orange-500';
  return 'bg-green-500';
}

function getUploadStatusColor(status: UploadStatus): string {
  switch (status) {
    case 'pending': {
      return 'bg-zinc-600 text-gray-300';
    }
    case 'uploading': {
      return 'bg-blue-600 text-white';
    }
    case 'success': {
      return 'bg-green-600 text-white';
    }
    case 'warning': {
      return 'bg-orange-600 text-white';
    }
    case 'error': {
      return 'bg-red-600 text-white';
    }
  }
}

interface ReviewItemProperties {
  image: Image;
  title: string;
  description: string;
  onToggleReviewed: () => void;
}

function ReviewItem({ image, title, description, onToggleReviewed }: ReviewItemProperties) {
  // Always show description preview — do not hide behind a toggle
  const imageUrl = `data:${image.mimeType};base64,${image.file}`;

  // Detect missing values shown as our placeholder
  const MISSING_PLACEHOLDER = '<<<missing>>>';
  const hasUnfilledVariables = new RegExp(MISSING_PLACEHOLDER).test(title) || new RegExp(MISSING_PLACEHOLDER).test(description);

  // Highlight the missing placeholders in the title and description render output
  function renderWithHighlights(text: string) {
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

  return (
    <div className={`overflow-hidden rounded-xl border-2 bg-zinc-800/50 transition-colors ${image.reviewed ? 'border-green-600' : (hasUnfilledVariables ? 'border-yellow-600' : 'border-transparent')
      }`}>
      <div className="flex items-start gap-4 p-4">
        {/* Thumbnail */}
        <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
          <img
            src={imageUrl}
            alt={image.name}
            className="size-full object-cover"
          />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">File Name</p>
              <p className="mb-2 truncate text-sm text-gray-400">{image.name}</p>

              <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Commons Title</p>
              <h4 className="break-words font-medium text-white" title={title}>
                {title ? <>{renderWithHighlights(title)}</> : <span className="italic text-gray-500">No title</span>}
              </h4>

              {hasUnfilledVariables && (
                <p className="mt-2 flex items-center gap-1 text-xs text-yellow-400">
                  ⚠️ Some variables are not filled in (shown as &lt;&lt;&lt;missing&gt;&gt;&gt;)
                </p>
              )}
            </div>

            {/* Review checkbox */}
            <div className="flex shrink-0 items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={image.reviewed}
                  onChange={onToggleReviewed}
                  className="size-5 rounded border-zinc-600 bg-zinc-800 text-green-600 focus:ring-green-500"
                />
                <span className={`text-sm font-medium ${image.reviewed ? 'text-green-400' : 'text-gray-400'}`}>
                  {image.reviewed ? 'Ready' : 'Mark as ready'}
                </span>
              </label>
            </div>
          </div>

          {/* Description preview is always visible */}
        </div>
      </div>
      {/* Template preview (always visible) */}
      <div className="border-t border-zinc-700 bg-zinc-900/50">
        <div className="p-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">Description Template (filled)</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm text-gray-300">
            {renderWithHighlights(description)}
          </pre>
        </div>
      </div>

    </div>
  );
}

export function ReviewTab() {
  const images = useImageSetStore((state) => state.imageSet.images);
  const template = useImageSetStore((state) => state.imageSet.template);
  const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
  const globalVariables = useImageSetStore((state) => state.imageSet.globalVariables);
  const setImageReviewed = useImageSetStore((state) => state.setImageReviewed);
  const clearAllImages = useImageSetStore((state) => state.clearAllImages);
  const navigate = useNavigate();

  const { uploadFile, isAuthenticated } = useWikimediaCommons();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, 'pending' | 'uploading' | 'success' | 'error' | 'warning'>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [uploadWarnings, setUploadWarnings] = useState<Record<string, { warnings: UploadWarning[]; filekey?: string; file: File; title: string; description: string }>>({});

  const imageIds = Object.keys(images);

  const reviewedCount = Object.values(images).filter((img) => img.reviewed).length;
  const allReviewed = reviewedCount === imageIds.length && imageIds.length > 0;

  useEffect(() => {
    console.error(uploadErrors);
  }, [uploadErrors]);

  // Generate titles and descriptions for all images
  const processedImages = useMemo(() => {
    return imageIds.map((id, index) => {
      const image = images[id];
      // Extract file extension without the dot
      const extension = image.name.includes('.')
        ? image.name.split('.').pop()?.toLowerCase() ?? ''
        : '';

      const context = {
        ...image.keys,
        exif: image.exifData ?? {},
        global: globalVariables,
        utility: {
          extension,
          index,
        },
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
    const initialProgress: Record<string, 'pending' | 'uploading' | 'success' | 'error' | 'warning'> = {};
    for (const id of imageIds) {
      if (images[id].reviewed) {
        initialProgress[id] = 'pending';
      }
    }
    setUploadProgress(initialProgress);
    setUploadErrors({});
    setUploadWarnings({});

    for (const { id, image, title, description } of processedImages) {
      if (!image.reviewed) continue;

      setUploadProgress((previous) => ({ ...previous, [id]: 'uploading' }));

      try {
        // Convert base64 to File
        const byteCharacters = atob(image.file);
        const byteNumbers = Array.from({ length: byteCharacters.length }, (_, index) =>
          byteCharacters.codePointAt(index) ?? 0
        );
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: image.mimeType });
        const file = new File([blob], image.name, { type: image.mimeType });

        const result = await uploadFile(file, title, description);

        if (result.success) {
          setUploadProgress((previous) => ({ ...previous, [id]: 'success' }));
        } else if (result.warnings && result.warnings.length > 0) {
          // File has warnings - let user decide
          setUploadProgress((previous) => ({ ...previous, [id]: 'warning' }));
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
          setUploadProgress((previous) => ({ ...previous, [id]: 'error' }));
          setUploadErrors((previous) => ({ ...previous, [id]: result.error || 'Upload failed' }));
        }
      } catch (error) {
        setUploadProgress((previous) => ({ ...previous, [id]: 'error' }));
        setUploadErrors((previous) => ({ ...previous, [id]: error instanceof Error ? error.message : 'Upload failed' }));
      }
    }

    setIsUploading(false);
  };

  const handleForceUpload = async (id: string) => {
    const warningData = uploadWarnings[id];
    if (!warningData) return;

    setUploadProgress((previous) => ({ ...previous, [id]: 'uploading' }));

    try {
      const result = await uploadFile(
        warningData.file,
        warningData.title,
        warningData.description,
        { ignorewarnings: true, filekey: warningData.filekey }
      );

      if (result.success) {
        setUploadProgress((previous) => ({ ...previous, [id]: 'success' }));
        setUploadWarnings((previous) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [id]: _removed, ...rest } = previous;
          return rest;
        });
      } else {
        setUploadProgress((previous) => ({ ...previous, [id]: 'error' }));
        setUploadErrors((previous) => ({ ...previous, [id]: result.error || 'Upload failed' }));
      }
    } catch (error) {
      setUploadProgress((previous) => ({ ...previous, [id]: 'error' }));
      setUploadErrors((previous) => ({ ...previous, [id]: error instanceof Error ? error.message : 'Upload failed' }));
    }
  };

  const handleSkipWarning = (id: string) => {
    setUploadProgress((previous) => ({ ...previous, [id]: 'error' }));
    setUploadErrors((previous) => ({ ...previous, [id]: 'Skipped due to warnings' }));
    setUploadWarnings((previous) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _removed, ...rest } = previous;
      return rest;
    });
  };

  const successCount = Object.values(uploadProgress).filter((s) => s === 'success').length;
  const errorCount = Object.values(uploadProgress).filter((s) => s === 'error').length;
  const warningCount = Object.values(uploadProgress).filter((s) => s === 'warning').length;
  const uploadComplete = Object.keys(uploadProgress).length > 0 &&
    Object.values(uploadProgress).every((s) => s === 'success' || s === 'error');

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
          <div className="flex gap-2">
            <button
              onClick={() => toggleAllReviewed(true)}
              className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-zinc-600"
            >
              Mark all ready
            </button>
            <button
              onClick={() => toggleAllReviewed(false)}
              className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-zinc-600"
            >
              Unmark all
            </button>
          </div>
        </div>

        {!isAuthenticated && (
          <div className="text-sm text-yellow-400">
            ⚠️ Please log in to upload
          </div>
        )}
      </div>

      {/* Upload progress/results */}
      {Object.keys(uploadProgress).length > 0 && (
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
              style={{ width: `${((successCount + errorCount) / Object.keys(uploadProgress).length) * 100}%` }}
            />
          </div>
          {warningCount > 0 && (
            <div className="mt-4 rounded-lg border border-orange-600/50 bg-orange-900/20 p-3">
              <p className="mb-2 text-sm text-orange-400">
                ⚠️ {warningCount} file(s) have warnings. Please review and decide whether to force upload or skip them.
              </p>
            </div>
          )}
          {uploadComplete && successCount === Object.keys(uploadProgress).length && (
            <div className="mt-4 text-center">
              <p className="mb-3 font-medium text-green-400">All uploads completed successfully! 🎉</p>
              <button
                onClick={() => {
                  clearAllImages();
                  setUploadProgress({});
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
          <div key={id} className="relative">
            <ReviewItem
              image={image}
              title={title}
              description={description}
              onToggleReviewed={() => setImageReviewed(id, !image.reviewed)}
            />
            {/* Upload status overlay */}
            {uploadProgress[id] && (
              <div className={`absolute right-16 top-2 rounded px-2 py-1 text-xs font-medium ${getUploadStatusColor(uploadProgress[id])}`}>
                {uploadProgress[id] === 'pending' && 'Waiting...'}
                {uploadProgress[id] === 'uploading' && 'Uploading...'}
                {uploadProgress[id] === 'success' && '✓ Uploaded'}
                {uploadProgress[id] === 'warning' && '⚠️ Has warnings'}
                {uploadProgress[id] === 'error' && `✗ ${uploadErrors[id] || 'Failed'}`}
              </div>
            )}
            {/* Warning details and actions */}
            {uploadProgress[id] === 'warning' && uploadWarnings[id] && (
              <div className="mt-2 rounded-lg border border-orange-600/50 bg-orange-900/20 p-3">
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
                    className="rounded bg-orange-600 px-3 py-1 text-sm text-white transition-colors hover:bg-orange-700"
                  >
                    Upload Anyway
                  </button>
                  <button
                    onClick={() => handleSkipWarning(id)}
                    className="rounded bg-zinc-600 px-3 py-1 text-sm text-white transition-colors hover:bg-zinc-700"
                  >
                    Skip
                  </button>
                </div>
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
