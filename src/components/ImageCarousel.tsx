import { useRef, useEffect } from 'react';
import { useImageUrl } from '../hooks/useImageData';

export interface CarouselImage {
    id: string;
    name: string;
    mimeType: string;
}

export interface ImageCarouselProps {
    images: CarouselImage[];
    currentIndex: number;
    onSelectImage: (index: number) => void;
    getCompletionStatus?: (image: CarouselImage) => 'complete' | 'partial' | 'empty';
}

/**
 * Determines the CSS classes for a thumbnail's ring/border based on status and selection state.
 *
 * @param status - Completion status of the image
 * @param isSelected - Whether the image is currently selected
 * @returns CSS class string for the ring styling
 */
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

interface ThumbnailProps {
    image: CarouselImage;
    isSelected: boolean;
    status: 'complete' | 'partial' | 'empty';
    index: number;
    onSelect: () => void;
}

/**
 * Thumbnail component that displays a preview of an image in the carousel.
 * Shows loading state, status indicator, and handles selection.
 *
 * @param props - Component props
 * @param props.image - The carousel image data to display
 * @param props.isSelected - Whether this thumbnail is currently selected
 * @param props.status - Status of the image metadata (complete, partial, empty)
 * @param props.index - Index position in the carousel for display
 * @param props.onSelect - Callback function when thumbnail is clicked
 * @returns The rendered thumbnail button component
 */
function Thumbnail({ image, isSelected, status, index, onSelect }: ThumbnailProps) {
    const { imageUrl, isLoading } = useImageUrl(image.id);

    return (
        <button
            onClick={onSelect}
            className={`group relative size-16 shrink-0 overflow-hidden rounded-lg transition-all ${getStatusStyles(status, isSelected)}`}
            title={image.name}
        >
            {isLoading ? (
                <div className="flex size-full items-center justify-center bg-zinc-800">
                    <div className="size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-400" />
                </div>
            ) : (
                <img
                    src={imageUrl}
                    alt={image.name}
                    className="size-full object-cover"
                />
            )}
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
}

/**
 * ImageCarousel displays a horizontal scrollable list of image thumbnails.
 * Shows completion status for each image and automatically scrolls to the selected image.
 * Each thumbnail displays its position number and completion status indicator.
 * 
 * @param props - Component props
 * @param props.images - Array of images to display
 * @param props.currentIndex - Index of currently selected image
 * @param props.onSelectImage - Callback when an image is selected
 * @param props.getCompletionStatus - Optional function to determine completion status
 * @returns The image carousel component
 */
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
            className="flex gap-2 overflow-x-auto p-1 scrollbar-thin scrollbar-track-zinc-800 scrollbar-thumb-zinc-600"
        >
            {images.map((image, index) => {
                const status = getCompletionStatus?.(image) ?? 'empty';
                const isSelected = index === currentIndex;

                return (
                    <Thumbnail
                        key={image.id}
                        image={image}
                        isSelected={isSelected}
                        status={status}
                        index={index}
                        onSelect={() => onSelectImage(index)}
                    />
                );
            })}
        </div>
    );
}
