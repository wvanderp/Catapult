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
    <div className="absolute right-1 top-1 z-20 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (index > 0) onMoveUp();
        }}
        disabled={index === 0}
        className={`flex size-7 items-center justify-center rounded bg-black/60 text-sm leading-none transition-colors ${index === 0
          ? 'cursor-not-allowed text-zinc-600'
          : 'text-zinc-300 hover:bg-black/80 hover:text-white'
          }`}
        title="Move up"
      >
        ▲
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (index < total - 1) onMoveDown();
        }}
        disabled={index === total - 1}
        className={`flex size-7 items-center justify-center rounded bg-black/60 text-sm leading-none transition-colors ${index === total - 1
          ? 'cursor-not-allowed text-zinc-600'
          : 'text-zinc-300 hover:bg-black/80 hover:text-white'
          }`}
        title="Move down"
      >
        ▼
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
    <div className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-zinc-700">
      {isLoading ? (
        <div className="flex size-full items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
        </div>
      ) : (imageUrl ? (
        <img
          src={imageUrl}
          alt={image.name}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-zinc-500">
          <span>Failed to load</span>
        </div>
      ))}
      <SortArrows
        index={index}
        total={total}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onRemove}
          className="pointer-events-auto rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
        >
          Remove
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-4">
        <p className="truncate text-xs text-gray-300">{image.name}</p>
      </div>
      <div className="absolute left-1 top-1 z-10 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100">
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
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-bold text-white">Upload Images</h2>
        <p className="text-gray-400">Add images you want to upload to Wikimedia Commons</p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={`rounded-xl border-2 border-dashed p-12 text-center transition-all ${isDragOver
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-zinc-600 hover:border-zinc-500'
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
        <div className="space-y-4">
          <div className={`text-5xl transition-transform ${isDragOver ? 'scale-110' : ''}`}>📷</div>
          <div>
            <p className="mb-2 text-gray-300">
              {isDragOver ? 'Drop images here' : 'Drag and drop images here, or'}
            </p>
            {!isDragOver && (
              <button
                onClick={() => fileInputReference.current?.click()}
                className="rounded-lg bg-white px-6 py-3 font-medium text-black shadow-sm transition-colors hover:bg-gray-200"
              >
                Browse files
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500">Supports JPG, PNG, GIF, SVG, and other image formats</p>
        </div>
      </div>

      {/* Image preview grid */}
      {imageIds.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-white">
              Uploaded Images ({imageIds.length})
            </h3>
            <p className="text-xs text-zinc-500">Hover to reorder or remove</p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Next: Set up templates →
          </Link>
        </div>
      )}
    </div>
  );
}
