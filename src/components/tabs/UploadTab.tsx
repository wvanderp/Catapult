import React, { useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useImageSetStore } from '../../store/imageSetStore';

function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
  event.preventDefault();
}

export function UploadTab() {
  const addImage = useImageSetStore((state) => state.addImage);
  const images = useImageSetStore((state) => state.imageSet.images);
  const removeImage = useImageSetStore((state) => state.removeImage);
  const fileInputReference = useRef<HTMLInputElement>(null);

  const imageIds = Object.keys(images);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      for (const file of files) {
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
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files) {
      for (const file of files) {
        if (file.type.startsWith('image/')) {
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
              });
            }
          });
          reader.readAsDataURL(file);
        }
      }
    }
  };

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
        className="rounded-xl border-2 border-dashed border-zinc-600 p-12 text-center transition-colors hover:border-zinc-500"
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
          <div className="text-5xl">📷</div>
          <div>
            <p className="mb-2 text-gray-300">Drag and drop images here, or</p>
            <button
              onClick={() => fileInputReference.current?.click()}
              className="rounded-lg bg-white px-6 py-3 font-medium text-black shadow-sm transition-colors hover:bg-gray-200"
            >
              Browse files
            </button>
          </div>
          <p className="text-sm text-gray-500">Supports JPG, PNG, GIF, SVG, and other image formats</p>
        </div>
      </div>

      {/* Image preview grid */}
      {imageIds.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">
            Uploaded Images ({imageIds.length})
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
            {imageIds.map((id) => {
              const image = images[id];
              const imageUrl = `data:${image.mimeType};base64,${image.file}`;
              return (
                <div
                  key={id}
                  className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-800"
                >
                  <img
                    src={imageUrl}
                    alt={image.name}
                    className="size-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => removeImage(id)}
                      className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2">
                    <p className="truncate text-xs text-gray-300">{image.name}</p>
                  </div>
                </div>
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
