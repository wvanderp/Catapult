import { useMemo, useEffect, useState } from 'react';
import { useImageSetStore } from '../store/imageSetStore';
import { extractTemplateKeys } from '../utils/templateUtils';

interface ImageItemProps {
    id: string;
}

export function ImageItem({ id }: ImageItemProps) {
    const image = useImageSetStore((state) => state.imageSet.images[id]);
    const template = useImageSetStore((state) => state.imageSet.template);
    const titleTemplate = useImageSetStore((state) => state.imageSet.titleTemplate);
    const updateImageKeys = useImageSetStore((state) => state.updateImageKeys);

    const keys = useMemo(() => extractTemplateKeys(titleTemplate + ' ' + template), [titleTemplate, template]);
    const [imageUrl, setImageUrl] = useState<string>('');

    useEffect(() => {
        if (image?.file) {
            const url = `data:${image.mimeType};base64,${image.file}`;
            setImageUrl(url);
        }
    }, [image?.file, image?.mimeType]);

    const handleKeyChange = (key: string, value: string) => {
        updateImageKeys(id, {
            ...image.keys,
            [key]: value,
        });
    };

    if (!image) return null;

    return (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden p-6 flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-1/3 bg-zinc-900 flex items-center justify-center rounded-lg overflow-hidden min-h-[200px]">
                {imageUrl && (
                    <img
                        src={imageUrl}
                        alt={image.name}
                        className="object-contain max-h-[400px] w-full" />
                )}
            </div>
            <div className="flex-1 space-y-4">
                <div className="text-white font-medium truncate" title={image.name}>
                    {image.name}
                </div>
                <div className="grid grid-cols-1 gap-4">
                    {keys.map((key) => (
                        <div key={key} className="space-y-1">
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {key}
                            </label>
                            <input
                                type="text"
                                value={image.keys[key] || ''}
                                onChange={(e) => handleKeyChange(key, e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500 transition-colors"
                                placeholder={key} />
                        </div>
                    ))}
                    {keys.length === 0 && (
                        <p className="text-gray-500 italic text-sm">
                            No variables found in template. Add variables like {"{{{variable}}}"} to the template above.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
