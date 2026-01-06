import { useRef, useEffect } from 'react';

export interface CarouselImage {
    id: string;
    name: string;
    mimeType: string;
    file: string;
}

export interface ImageCarouselProps {
    images: CarouselImage[];
    currentIndex: number;
    onSelectImage: (index: number) => void;
    getCompletionStatus?: (image: CarouselImage) => 'complete' | 'partial' | 'empty';
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

export function ImageCarousel({ images, currentIndex, onSelectImage, getCompletionStatus }: ImageCarouselProps) {
    const carouselReference = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const carousel = carouselReference.current;
        if (!carousel) return;

        const selectedThumb = carousel.children[currentIndex] as HTMLElement | undefined;
        if (selectedThumb) {
            selectedThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [currentIndex]);

    return (
        <div
            ref={carouselReference}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-zinc-800 scrollbar-thumb-zinc-600"
        >
            {images.map((image, index) => {
                const imageUrl = `data:${image.mimeType};base64,${image.file}`;
                const status = getCompletionStatus?.(image) ?? 'empty';
                const isSelected = index === currentIndex;

                return (
                    <button
                        key={image.id}
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
