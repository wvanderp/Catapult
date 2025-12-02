import React, { useMemo, useState } from 'react';
import { useImageSetStore, type Image } from '../../store/imageSetStore';

import { useCommonsApi } from '../../hooks/useCommonsApi';
import { useWikimediaAuth } from '../../hooks/useWikimediaAuth';

function applyTemplate(template: string, keys: Record<string, string>, globalVariables: Record<string, string>): string {
  let result = template;
  const regex = /\{\{\{(.*?)\}\}\}/g;
  result = result.replace(regex, (_, key) => {
    const trimmedKey = key.trim();
    // If the key doesn't exist or is an empty string, show a visible placeholder
    const value = keys[trimmedKey] || globalVariables[trimmedKey];
    return value !== undefined && value !== '' ? value : '<<<missing>>>';
  });
  return result;
}

interface ReviewItemProps {
  image: Image;
  title: string;
  description: string;
  onToggleReviewed: () => void;
}

function ReviewItem({ image, title, description, onToggleReviewed }: ReviewItemProps) {
  // Always show description preview — do not hide behind a toggle
  const imageUrl = `data:${image.mimeType};base64,${image.file}`;

  // Detect missing values shown as our placeholder
  const MISSING_PLACEHOLDER = '<<<missing>>>';
  const hasUnfilledVariables = new RegExp(MISSING_PLACEHOLDER).test(title) || new RegExp(MISSING_PLACEHOLDER).test(description);

  // Highlight the missing placeholders in the title and description render output
  const renderWithHighlights = (text: string) => {
    if (!text) return text;
    const parts = text.split(MISSING_PLACEHOLDER);
    return parts.reduce((acc, part, idx, arr) => {
      acc.push(part);
      if (idx < arr.length - 1) {
        acc.push(
          <span key={idx} className="text-red-400 font-mono bg-zinc-800 px-1 rounded">
            {MISSING_PLACEHOLDER}
          </span>,
        );
      }
      return acc;
    }, [] as (string | React.ReactNode)[]);
  };

  return (
    <div className={`bg-zinc-800/50 rounded-xl overflow-hidden border-2 transition-colors ${image.reviewed ? 'border-green-600' : hasUnfilledVariables ? 'border-yellow-600' : 'border-transparent'
      }`}>
      <div className="flex items-start gap-4 p-4">
        {/* Thumbnail */}
        <div className="w-24 h-24 bg-zinc-900 rounded-lg overflow-hidden flex-shrink-0">
          <img
            src={imageUrl}
            alt={image.name}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">File Name</p>
              <p className="text-sm text-gray-400 truncate mb-2">{image.name}</p>

              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Commons Title</p>
              <h4 className="text-white font-medium break-words" title={title}>
                {title ? <>{renderWithHighlights(title)}</> : <span className="text-gray-500 italic">No title</span>}
              </h4>

              {hasUnfilledVariables && (
                <p className="text-yellow-400 text-xs mt-2 flex items-center gap-1">
                  ⚠️ Some variables are not filled in (shown as &lt;&lt;&lt;missing&gt;&gt;&gt;)
                </p>
              )}
            </div>

            {/* Review checkbox */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={image.reviewed}
                  onChange={onToggleReviewed}
                  className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-green-600 focus:ring-green-500"
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
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Description Template (filled)</p>
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto bg-zinc-900 p-3 rounded-lg border border-zinc-700">
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
  const setCurrentTab = useImageSetStore((state) => state.setCurrentTab);

  const { uploadFile } = useCommonsApi();
  const { isAuthenticated } = useWikimediaAuth();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, 'pending' | 'uploading' | 'success' | 'error'>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  const imageIds = Object.keys(images);

  const reviewedCount = Object.values(images).filter((img) => img.reviewed).length;
  const allReviewed = reviewedCount === imageIds.length && imageIds.length > 0;

  // Generate titles and descriptions for all images
  const processedImages = useMemo(() => {
    return imageIds.map((id) => {
      const image = images[id];
      const title = applyTemplate(titleTemplate, image.keys, globalVariables);
      const description = applyTemplate(template, image.keys, globalVariables);
      return { id, image, title, description };
    });
  }, [imageIds, images, titleTemplate, template, globalVariables]);

  const toggleAllReviewed = (reviewed: boolean) => {
    imageIds.forEach((id) => setImageReviewed(id, reviewed));
  };

  const handleUploadAll = async () => {
    if (!isAuthenticated) {
      alert('Please log in to upload files');
      return;
    }

    setIsUploading(true);
    const initialProgress: Record<string, 'pending' | 'uploading' | 'success' | 'error'> = {};
    imageIds.forEach((id) => {
      if (images[id].reviewed) {
        initialProgress[id] = 'pending';
      }
    });
    setUploadProgress(initialProgress);
    setUploadErrors({});

    for (const { id, image, title, description } of processedImages) {
      if (!image.reviewed) continue;

      setUploadProgress((prev) => ({ ...prev, [id]: 'uploading' }));

      try {
        // Convert base64 to File
        const byteCharacters = atob(image.file);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: image.mimeType });
        const file = new File([blob], image.name, { type: image.mimeType });

        await uploadFile(file, title, description);
        setUploadProgress((prev) => ({ ...prev, [id]: 'success' }));
      } catch (error) {
        setUploadProgress((prev) => ({ ...prev, [id]: 'error' }));
        setUploadErrors((prev) => ({ ...prev, [id]: error instanceof Error ? error.message : 'Upload failed' }));
      }
    }

    setIsUploading(false);
  };

  const successCount = Object.values(uploadProgress).filter((s) => s === 'success').length;
  const errorCount = Object.values(uploadProgress).filter((s) => s === 'error').length;
  const uploadComplete = Object.keys(uploadProgress).length > 0 &&
    Object.values(uploadProgress).every((s) => s === 'success' || s === 'error');

  if (imageIds.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-xl font-medium text-white mb-2">No images to review</h2>
        <p className="text-gray-400 mb-6">Upload some images first.</p>
        <button
          onClick={() => setCurrentTab('upload')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          Go to Upload
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Review & Upload</h2>
        <p className="text-gray-400">
          Check each image and mark it as ready before uploading
        </p>
      </div>

      {/* Progress summary */}
      <div className="bg-zinc-800/50 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`text-lg font-medium ${allReviewed ? 'text-green-400' : 'text-gray-300'}`}>
            {reviewedCount} / {imageIds.length} ready
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => toggleAllReviewed(true)}
              className="text-sm bg-zinc-700 hover:bg-zinc-600 text-gray-300 px-3 py-1.5 rounded transition-colors"
            >
              Mark all ready
            </button>
            <button
              onClick={() => toggleAllReviewed(false)}
              className="text-sm bg-zinc-700 hover:bg-zinc-600 text-gray-300 px-3 py-1.5 rounded transition-colors"
            >
              Unmark all
            </button>
          </div>
        </div>

        {!isAuthenticated && (
          <div className="text-yellow-400 text-sm">
            ⚠️ Please log in to upload
          </div>
        )}
      </div>

      {/* Upload progress/results */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="bg-zinc-800/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-medium">Upload Progress</span>
            <span className="text-sm text-gray-400">
              {successCount} succeeded, {errorCount} failed
            </span>
          </div>
          <div className="bg-zinc-700 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${errorCount > 0 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
              style={{ width: `${((successCount + errorCount) / Object.keys(uploadProgress).length) * 100}%` }}
            />
          </div>
          {uploadComplete && successCount === Object.keys(uploadProgress).length && (
            <div className="mt-4 text-center">
              <p className="text-green-400 font-medium mb-3">All uploads completed successfully! 🎉</p>
              <button
                onClick={() => {
                  clearAllImages();
                  setUploadProgress({});
                  setCurrentTab('upload');
                }}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
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
              <div className={`absolute top-2 right-16 px-2 py-1 rounded text-xs font-medium ${uploadProgress[id] === 'pending' ? 'bg-zinc-600 text-gray-300' :
                  uploadProgress[id] === 'uploading' ? 'bg-blue-600 text-white' :
                    uploadProgress[id] === 'success' ? 'bg-green-600 text-white' :
                      'bg-red-600 text-white'
                }`}>
                {uploadProgress[id] === 'pending' && 'Waiting...'}
                {uploadProgress[id] === 'uploading' && 'Uploading...'}
                {uploadProgress[id] === 'success' && '✓ Uploaded'}
                {uploadProgress[id] === 'error' && `✗ ${uploadErrors[id] || 'Failed'}`}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation and upload button */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => setCurrentTab('fillout')}
          className="text-gray-400 hover:text-white font-medium px-6 py-3 transition-colors"
        >
          ← Back to Fill Out
        </button>

        <button
          onClick={handleUploadAll}
          disabled={!allReviewed || isUploading || !isAuthenticated}
          className={`font-medium px-8 py-3 rounded-lg transition-colors ${allReviewed && !isUploading && isAuthenticated
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-zinc-700 text-gray-500 cursor-not-allowed'
            }`}
        >
          {isUploading ? 'Uploading...' : `Upload ${reviewedCount} image${reviewedCount !== 1 ? 's' : ''} to Commons`}
        </button>
      </div>
    </div>
  );
}
