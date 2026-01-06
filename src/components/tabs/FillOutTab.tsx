import { useMemo, useState, useRef, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { useImageSetStore } from '../../store/imageSetStore';
import { extractTemplateKeys } from '../../utils/templateUtils';
import type { Image } from '../../store/imageSetStore';

interface ImageCarouselProps {
  imageIds: string[];
  images: Record<string, Image>;
  currentIndex: number;
  keys: string[];
  onSelectImage: (index: number) => void;
}

function getStatusStyles(status: 'complete' | 'partial' | 'empty', isSelected: boolean): string {
  if (isSelected) return 'ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-900';
  switch (status) {
    case 'complete': {
      return 'ring-2 ring-green-500/50';
    }
    case 'partial': {
      return 'ring-2 ring-yellow-500/50';
    }
    default: {
      return 'ring-1 ring-zinc-600';
    }
  }
}

function ImageCarousel({ imageIds, images, currentIndex, keys, onSelectImage }: ImageCarouselProps) {
  const carouselReference = useRef<HTMLDivElement>(null);
  const totalFields = keys.length;

  useEffect(() => {
    const carousel = carouselReference.current;
    if (!carousel) return;

    const selectedThumb = carousel.children[currentIndex] as HTMLElement | undefined;
    if (selectedThumb) {
      selectedThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentIndex]);

  function getCompletionStatus(image: Image): 'complete' | 'partial' | 'empty' {
    const filledFields = keys.filter(key => image.keys[key]?.trim()).length;
    if (filledFields === totalFields) return 'complete';
    if (filledFields > 0) return 'partial';
    return 'empty';
  }

  return (
    <div
      ref={carouselReference}
      className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-zinc-800 scrollbar-thumb-zinc-600"
    >
      {imageIds.map((id, index) => {
        const image = images[id];
        const imageUrl = `data:${image.mimeType};base64,${image.file}`;
        const status = getCompletionStatus(image);
        const isSelected = index === currentIndex;

        return (
          <button
            key={id}
            onClick={() => onSelectImage(index)}
            className={`group relative size-16 shrink-0 overflow-hidden rounded-lg transition-all ${getStatusStyles(status, isSelected)}`}
            title={image.name}
          >
            <img
              src={imageUrl}
              alt={image.name}
              className="size-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
              <span className="text-xs font-medium text-white">{index + 1}</span>
            </div>
            {status === 'complete' && (
              <div className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-green-500 text-xs text-white">
                ✓
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface FieldInputProps {
  fieldKey: string;
  value: string;
  globalValue?: string;
  onChange: (value: string) => void;
  onInsertGlobalRef: () => void;
}

function FieldInput({ fieldKey, value, globalValue, onChange, onInsertGlobalRef }: FieldInputProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-gray-500">
          {fieldKey}
        </label>
        {globalValue && (
          <button
            type="button"
            onClick={onInsertGlobalRef}
            className="text-xs text-blue-400 transition-colors hover:text-blue-300"
            title={`Insert reference to global variable (value: ${globalValue})`}
          >
            + Use global
          </button>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder={fieldKey}
      />
    </div>
  );
}

interface ExifDisplayProps {
  exifData: Record<string, unknown>;
  onInsertExifReference: (path: string) => void;
  activeFieldKey: string | undefined;
}

const USEFUL_EXIF_FIELDS = [
  'DateTimeOriginal',
  'CreateDate',
  'GPSLatitude',
  'GPSLongitude',
  'Make',
  'Model',
  'LensModel',
  'FocalLength',
  'FNumber',
  'ExposureTime',
  'ISO',
  'ImageWidth',
  'ImageHeight',
  'ExifImageWidth',
  'ExifImageHeight',
];

function ExifDisplay({ exifData, onInsertExifReference, activeFieldKey }: ExifDisplayProps) {
  const exifEntries = useMemo(() => {
    const entries: Array<{ key: string; value: string }> = [];

    for (const field of USEFUL_EXIF_FIELDS) {
      if (field in exifData && exifData[field] !== undefined) {
        entries.push({ key: field, value: String(exifData[field]) });
      }
    }

    return entries;
  }, [exifData]);

  if (exifEntries.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500">
        No EXIF data available
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3 lg:grid-cols-4">
      {exifEntries.map(({ key, value }) => (
        <button
          key={key}
          onClick={() => onInsertExifReference(key)}
          disabled={!activeFieldKey}
          className={`flex flex-col rounded bg-zinc-800 p-2 text-left transition-colors ${activeFieldKey ? 'cursor-pointer hover:bg-zinc-700' : 'cursor-default opacity-60'
            }`}
          title={activeFieldKey ? `Click to insert <<<exif.${key}>>> into ${activeFieldKey}` : 'Select a field above first'}
        >
          <span className="text-xs text-gray-500">{key}</span>
          <span className="truncate text-gray-300">{value}</span>
        </button>
      ))}
    </div>
  );
}

interface GlobalVariablesDisplayProps {
  globalVariables: Record<string, string>;
  keys: string[];
  onInsertGlobalReference: (variableKey: string) => void;
  activeFieldKey: string | undefined;
}

function GlobalVariablesDisplay({ globalVariables, keys, onInsertGlobalReference, activeFieldKey }: GlobalVariablesDisplayProps) {
  const definedGlobals = useMemo(() => {
    return keys.filter(key => globalVariables[key]?.trim());
  }, [globalVariables, keys]);

  if (definedGlobals.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500">
        No global variables defined. Set them in the Variables tab.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3 lg:grid-cols-4">
      {definedGlobals.map((key) => (
        <button
          key={key}
          onClick={() => onInsertGlobalReference(key)}
          disabled={!activeFieldKey}
          className={`flex flex-col rounded bg-zinc-800 p-2 text-left transition-colors ${activeFieldKey ? 'cursor-pointer hover:bg-zinc-700' : 'cursor-default opacity-60'
            }`}
          title={activeFieldKey ? `Click to insert <<<global.${key}>>> into ${activeFieldKey}` : 'Select a field above first'}
        >
          <span className="text-xs text-gray-500">{key}</span>
          <span className="truncate text-gray-300">{globalVariables[key]}</span>
        </button>
      ))}
    </div>
  );
}

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
    // Filter out global.* and exif.* prefixed keys as those are special references
    return allKeys.filter(key => !key.startsWith('global.') && !key.startsWith('exif.'));
  }, [titleTemplate, template]);

  const safeCurrentIndex = Math.min(currentIndex, Math.max(0, imageIds.length - 1));

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

  function handleKeyChange(key: string, value: string) {
    updateImageKeys(currentId, {
      ...currentImage.keys,
      [key]: value,
    });
  }

  function insertIntoField(textToInsert: string) {
    if (!activeFieldKey) return;
    const currentValue = currentImage.keys[activeFieldKey] ?? '';
    handleKeyChange(activeFieldKey, currentValue + textToInsert);
  }

  function handleInsertGlobalReference(variableKey: string) {
    insertIntoField(`<<<global.${variableKey}>>>`);
  }

  function handleInsertExifReference(exifPath: string) {
    insertIntoField(`<<<exif.${exifPath}>>>`);
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
          imageIds={imageIds}
          images={images}
          currentIndex={safeCurrentIndex}
          keys={keys}
          onSelectImage={handleSelectImage}
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
              <div key={key} onFocus={() => setActiveFieldKey(key)}>
                <FieldInput
                  fieldKey={key}
                  value={currentImage.keys[key] ?? ''}
                  globalValue={globalVariables[key]}
                  onChange={(value) => handleKeyChange(key, value)}
                  onInsertGlobalRef={() => handleInsertGlobalReference(key)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom panels: Global variables and EXIF data */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Global variables panel */}
        <div className="rounded-xl bg-zinc-800/50 p-4">
          <h4 className="mb-3 text-sm font-medium text-gray-400">
            Global Variables
            {activeFieldKey && (
              <span className="ml-2 text-blue-400">→ Click to insert into {activeFieldKey}</span>
            )}
          </h4>
          <GlobalVariablesDisplay
            globalVariables={globalVariables}
            keys={keys}
            onInsertGlobalReference={handleInsertGlobalReference}
            activeFieldKey={activeFieldKey}
          />
        </div>

        {/* EXIF data panel */}
        <div className="rounded-xl bg-zinc-800/50 p-4">
          <h4 className="mb-3 text-sm font-medium text-gray-400">
            EXIF Data
            {activeFieldKey && (
              <span className="ml-2 text-blue-400">→ Click to insert into {activeFieldKey}</span>
            )}
          </h4>
          <ExifDisplay
            exifData={currentImage.exifData ?? {}}
            onInsertExifReference={handleInsertExifReference}
            activeFieldKey={activeFieldKey}
          />
        </div>
      </div>
    </div>
  );
}
