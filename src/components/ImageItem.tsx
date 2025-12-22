import { useMemo } from 'react';
import { useImageSetStore } from '../store/imageSetStore';
import { extractTemplateKeys } from '../utils/templateUtils';

interface ImageItemProperties {
    id: string;
}

export function ImageItem({ id }: ImageItemProperties) {
    const image = useImageSetStore((state) => state.imageSet.images[id]);
    const template = useImageSetStore((state) => state.imageSet.template);
    const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
    const updateImageKeys = useImageSetStore((state) => state.updateImageKeys);

    const keys = useMemo(() => extractTemplateKeys(titleTemplate + ' ' + template), [titleTemplate, template]);
    
    // Compute imageUrl directly from the image data
    const imageUrl = image?.file ? `data:${image.mimeType};base64,${image.file}` : '';

    const handleKeyChange = (key: string, value: string) => {
        updateImageKeys(id, {
            ...image.keys,
            [key]: value,
        });
    };

    if (!image) return;

    return (
        <div className="flex flex-col gap-6 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-6 md:flex-row">
            <div className="flex min-h-[200px] w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-900 md:w-1/3">
                {imageUrl && (
                    <img
                        src={imageUrl}
                        alt={image.name}
                        className="max-h-[400px] w-full object-contain" />
                )}
            </div>
            <div className="flex-1 space-y-4">
                <div className="truncate font-medium text-white" title={image.name}>
                    {image.name}
                </div>
                <div className="grid grid-cols-1 gap-4">
                    {keys.map((key) => (
                        <div key={key} className="space-y-1">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500">
                                {key}
                            </label>
                            <input
                                type="text"
                                value={image.keys[key] || ''}
                                onChange={(e) => handleKeyChange(key, e.target.value)}
                                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white transition-colors focus:border-gray-500 focus:outline-none"
                                placeholder={key} />
                        </div>
                    ))}
                    {keys.length === 0 && (
                        <p className="text-sm italic text-gray-500">
                            No variables found in template. Add variables like {"{{{variable}}}"} to the template above.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
