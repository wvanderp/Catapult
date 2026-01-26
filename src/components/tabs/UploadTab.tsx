import React, { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useImageSetStore, type Image } from '../../store/imageSetStore';
import { extractExifData } from '../../utils/exifUtils';
import { useImageUrl } from '../../hooks/useImageData';

/**
 * Prevents the default drag-over behavior to allow dropping files.
 *
 * @param event - The drag event
 */
function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
  event.preventDefault();
}

interface SortArrowsProps {
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/**
 * SortArrows component displays up and down arrow buttons for reordering images.
 * The buttons appear on hover and are disabled when at the boundaries (first/last item).
 *
 * @param props - The props object
 * @param props.index - Current position of the image in the list
 * @param props.total - Total number of images
 * @param props.onMoveUp - Callback to move the image up
 * @param props.onMoveDown - Callback to move the image down
 * @returns The sort arrows component
 */
function SortArrows({ index, total, onMoveUp, onMoveDown }: SortArrowsProps) {
  return (
    <div className="absolute right-2 top-2 z-20 flex flex-col gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (index > 0) onMoveUp();
        }}
        disabled={index === 0}
        className={`flex size-7 items-center justify-center rounded-md backdrop-blur-sm text-xs leading-none transition-all ${index === 0
          ? 'cursor-not-allowed bg-black/40 text-zinc-600'
          : 'bg-black/60 text-zinc-300 hover:bg-black/80 hover:text-white'
          }`}
        title="Move up"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (index < total - 1) onMoveDown();
        }}
        disabled={index === total - 1}
        className={`flex size-7 items-center justify-center rounded-md backdrop-blur-sm text-xs leading-none transition-all ${index === total - 1
          ? 'cursor-not-allowed bg-black/40 text-zinc-600'
          : 'bg-black/60 text-zinc-300 hover:bg-black/80 hover:text-white'
          }`}
        title="Move down"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}

interface ImagePreviewCardProps {
  image: Image;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

/**
 * ImagePreviewCard displays a single uploaded image with:
 * - Image preview loaded from IndexedDB
 * - Sort arrows for reordering
 * - Remove button on hover
 * - Position indicator
 * - Loading state while image loads from storage
 * 
 * @param props - The props object
 * @param props.image - The image data to display
 * @param props.index - Current position in the list
 * @param props.total - Total number of images
 * @param props.onMoveUp - Callback to move image up
 * @param props.onMoveDown - Callback to move image down
 * @param props.onRemove - Callback to remove image
 * @returns The image preview card component
 */
function ImagePreviewCard({ image, index, total, onMoveUp, onMoveDown, onRemove }: ImagePreviewCardProps) {
  const { imageUrl, isLoading } = useImageUrl(image.id);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-2xl bg-zinc-900/80 ring-1 ring-zinc-800/60 transition-all duration-200 hover:ring-zinc-700/60 hover:shadow-lg hover:shadow-black/20">
      {isLoading ? (
        <div className="flex size-full items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-400" />
        </div>
      ) : (imageUrl ? (
        <img
          src={imageUrl}
          alt={image.name}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-zinc-600">
          <svg className="size-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      ))}
      <SortArrows
        index={index}
        total={total}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 bg-black/0 opacity-0 backdrop-blur-none transition-all duration-200 group-hover:bg-black/60 group-hover:opacity-100 group-hover:backdrop-blur-sm">
        <button
          onClick={onRemove}
          className="pointer-events-auto rounded-xl bg-red-500/90 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:bg-red-500 hover:scale-105"
        >
          Remove
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-black/80 p-3">
        <p className="truncate text-xs font-medium text-zinc-200">{image.name}</p>
      </div>
      <div className="absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-lg bg-black/60 text-xs font-bold text-zinc-200 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:opacity-100">
        {index + 1}
      </div>
    </div>
  );
}

/**
 * UploadTab component provides the interface for uploading images to prepare for Wikimedia Commons.
 * Features:
 * - Drag-and-drop file upload with visual feedback (tracks drag depth to prevent flickering)
 * - Browse files button for traditional file selection
 * - Displays uploaded images in a responsive grid
 * - Image reordering via drag controls (up/down arrows)
 * - Image removal functionality
 * - EXIF data extraction from uploaded images
 * - Maintains image order state and syncs with store
 * - Navigation to next step when images are uploaded
 *
 * The component uses a dragDepthRef to properly track when files are dragged over child elements,
 * preventing the dropzone highlight from flickering when hovering over text or buttons.
 * 
 * @returns The upload tab component
 */
export function UploadTab() {
  const addImage = useImageSetStore((state) => state.addImage);
  const images = useImageSetStore((state) => state.imageSet.images);
  const imageOrder = useImageSetStore((state) => state.imageSet.imageOrder);
  const removeImage = useImageSetStore((state) => state.removeImage);
  const reorderImages = useImageSetStore((state) => state.reorderImages);
  const setImageOrder = useImageSetStore((state) => state.setImageOrder);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthReference = useRef(0);

  // Sync imageOrder with images for backwards compatibility
  const imageKeys = Object.keys(images);
  const needsSync = imageKeys.length > 0 && imageOrder.length === 0;

  React.useEffect(() => {
    if (needsSync) {
      setImageOrder(imageKeys);
    }
  }, [needsSync, imageKeys, setImageOrder]);

  // Filter imageOrder to only include existing images (handles deleted images)
  const imageIds = imageOrder.length > 0
    ? imageOrder.filter(id => id in images)
    : imageKeys;

  /**
   * Handles drag enter event and increments drag depth counter.
   * Sets the isDragOver state to show visual feedback.
   * 
   * @param event - The drag event
   */
  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthReference.current += 1;
    setIsDragOver(true);
  }

  /**
   * Handles drag leave event and decrements drag depth counter.
   * Only clears isDragOver state when drag depth reaches 0, preventing
   * flickering when dragging over child elements.
   * 
   * @param event - The drag event
   */
  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthReference.current -= 1;
    if (dragDepthReference.current === 0) {
      setIsDragOver(false);
    }
  }

  /**
   * Handles file selection from the file input dialog.
   * Processes each selected file by:
   * - Extracting EXIF data
   * - Converting to base64
   * - Adding to the image store
   * Resets the file input after processing.
   * 
   * @param event - The change event from the file input
   */
  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files) {
      for (const file of files) {
        // Extract EXIF data first (before FileReader consumes the file)
        const exifData = await extractExifData(file);

        const reader = new FileReader();
        reader.addEventListener('load', (e) => {
          const result = e.target?.result as string;
          if (result) {
            const [prefix, base64] = result.split(',');
            const mimeType = prefix.split(':')[1].split(';')[0];

            addImage({
              file: base64,
              name: file.name,
              mimeType,
              keys: {},
              exifData,
            });
          }
        });
        reader.readAsDataURL(file);
      }
      // Reset input
      if (fileInputReference.current) {
        fileInputReference.current.value = '';
      }
    }
  }

  /**
   * Handles file drop event from drag-and-drop.
   * Resets drag state and processes dropped files by:
   * - Filtering for image files only
   * - Extracting EXIF data
   * - Converting to base64
   * - Adding to the image store
   * 
   * @param event - The drop event containing the dragged files
   */
  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthReference.current = 0;
    setIsDragOver(false);
    const files = event.dataTransfer.files;
    if (files) {
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          // Extract EXIF data first (before FileReader consumes the file)
          const exifData = await extractExifData(file);

          const reader = new FileReader();
          reader.addEventListener('load', (e) => {
            const result = e.target?.result as string;
            if (result) {
              const [prefix, base64] = result.split(',');
              const mimeType = prefix.split(':')[1].split(';')[0];

              addImage({
                file: base64,
                name: file.name,
                mimeType,
                keys: {},
                exifData,
              });
            }
          });
          reader.readAsDataURL(file);
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div className="text-center">
        <h2 className="mb-3 text-3xl font-bold tracking-tight text-white">Select Images</h2>
        <p className="text-zinc-400">Add the images you want to prepare for Wikimedia Commons</p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={`relative overflow-hidden rounded-3xl border-2 border-dashed p-16 text-center transition-all duration-300 ${isDragOver
          ? 'border-teal-500 bg-teal-500/10'
          : 'border-zinc-700/80 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-900/50'
          }`}
      >
        <input
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          ref={fileInputReference}
          onChange={handleFileChange}
        />
        <div className="relative z-10 space-y-6">
          <div className={`mx-auto flex size-24 items-center justify-center rounded-2xl transition-all duration-300 ${isDragOver ? 'bg-teal-400/15 scale-110 ring-2 ring-teal-400/30' : 'bg-zinc-800/80 ring-1 ring-zinc-700/50'}`}>
            <svg className={`size-12 transition-colors duration-300 ${isDragOver ? 'text-teal-400' : 'text-zinc-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="mb-4 text-lg font-medium text-zinc-300">
              {isDragOver ? 'Release to add images' : 'Drag and drop images here, or'}
            </p>
            {!isDragOver && (
              <button
                onClick={() => fileInputReference.current?.click()}
                className="rounded-xl bg-teal-600 px-8 py-3.5 font-semibold text-white transition-all duration-200 hover:bg-teal-500 active:bg-teal-700"
              >
                Browse files
              </button>
            )}
          </div>
          <p className="text-sm text-zinc-500">Supports JPG, PNG, GIF, TIFF, WebP, and other common formats</p>
        </div>
      </div>

      {/* Image preview grid */}
      {imageIds.length > 0 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-3 text-lg font-bold text-white">
              Selected Images
              <span className="inline-flex items-center justify-center rounded-full bg-teal-400/10 px-2.5 py-1 text-sm font-bold text-teal-400 ring-1 ring-teal-400/25">
                {imageIds.length}
              </span>
            </h3>
            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Hover over an image to reorder or remove it
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {imageIds.map((id, index) => {
              const image = images[id];
              if (!image) return null;
              return (
                <ImagePreviewCard
                  key={id}
                  image={image}
                  index={index}
                  total={imageIds.length}
                  onMoveUp={() => reorderImages(index, index - 1)}
                  onMoveDown={() => reorderImages(index, index + 1)}
                  onRemove={() => removeImage(id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Next button */}
      {imageIds.length > 0 && (
        <div className="flex justify-end">
          <Link
            to="/variables"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-8 py-3.5 font-semibold text-white transition-all duration-200 hover:bg-teal-500"
          >
            Continue to Templates
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}

