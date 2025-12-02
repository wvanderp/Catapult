import React, { useRef } from 'react';
import { useImageSetStore } from '../../store/imageSetStore';

export function UploadTab() {
  const addImage = useImageSetStore((state) => state.addImage);
  const images = useImageSetStore((state) => state.imageSet.images);
  const removeImage = useImageSetStore((state) => state.removeImage);
  const setCurrentTab = useImageSetStore((state) => state.setCurrentTab);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageIds = Object.keys(images);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
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
        };
        reader.readAsDataURL(file);
      });
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files) {
      Array.from(files).forEach((file) => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
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
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Upload Images</h2>
        <p className="text-gray-400">Add images you want to upload to Wikimedia Commons</p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed border-zinc-600 rounded-xl p-12 text-center hover:border-zinc-500 transition-colors"
      >
        <input
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <div className="space-y-4">
          <div className="text-5xl">📷</div>
          <div>
            <p className="text-gray-300 mb-2">Drag and drop images here, or</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-white text-black hover:bg-gray-200 font-medium px-6 py-3 rounded-lg transition-colors shadow-sm"
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {imageIds.map((id) => {
              const image = images[id];
              const imageUrl = `data:${image.mimeType};base64,${image.file}`;
              return (
                <div
                  key={id}
                  className="relative group aspect-square bg-zinc-800 rounded-lg overflow-hidden"
                >
                  <img
                    src={imageUrl}
                    alt={image.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={() => removeImage(id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2">
                    <p className="text-xs text-gray-300 truncate">{image.name}</p>
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
          <button
            onClick={() => setCurrentTab('variables')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Next: Set up templates →
          </button>
        </div>
      )}
    </div>
  );
}
