import { useEffect, useRef, useState } from 'react';

interface ImageViewerProps {
    imageUrl: string;
    imageName: string;
    isOpen: boolean;
    onClose: () => void;
}

export function ImageViewer({ imageUrl, imageName, isOpen, onClose }: ImageViewerProps) {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
            setIsDragging(false);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === '+' || e.key === '=') {
                handleZoomIn();
            } else if (e.key === '-' || e.key === '_') {
                handleZoomOut();
            } else if (e.key === '0') {
                handleResetZoom();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, scale, onClose]);

    const handleZoomIn = () => {
        setScale((prev) => Math.min(prev + 0.5, 5));
    };

    const handleZoomOut = () => {
        setScale((prev) => Math.max(prev - 0.5, 0.5));
    };

    const handleResetZoom = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale((prev) => Math.min(Math.max(prev + delta, 0.5), 5));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale > 1) {
            setIsDragging(true);
            setDragStart({
                x: e.clientX - position.x,
                y: e.clientY - position.y,
            });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && scale > 1) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y,
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
            onClick={onClose}
        >
            <div
                ref={containerRef}
                className="relative flex size-full items-center justify-center overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <img
                    src={imageUrl}
                    alt={imageName}
                    className="max-h-full max-w-full object-contain transition-transform"
                    style={{
                        transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                    }}
                    draggable={false}
                />

                {/* Controls overlay */}
                <div className="absolute left-4 top-4 flex flex-col gap-2">
                    <button
                        onClick={onClose}
                        className="flex size-10 items-center justify-center rounded-lg bg-zinc-800/90 text-white transition-colors hover:bg-zinc-700"
                        title="Close (Esc)"
                    >
                        ✕
                    </button>
                </div>

                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-lg bg-zinc-800/90 p-2">
                    <button
                        onClick={handleZoomOut}
                        className="flex size-10 items-center justify-center rounded text-white transition-colors hover:bg-zinc-700"
                        title="Zoom out (-)"
                    >
                        −
                    </button>
                    <div className="flex items-center justify-center px-3 text-sm text-white">
                        {Math.round(scale * 100)}%
                    </div>
                    <button
                        onClick={handleZoomIn}
                        className="flex size-10 items-center justify-center rounded text-white transition-colors hover:bg-zinc-700"
                        title="Zoom in (+)"
                    >
                        +
                    </button>
                    <button
                        onClick={handleResetZoom}
                        className="flex items-center justify-center rounded px-3 text-sm text-white transition-colors hover:bg-zinc-700"
                        title="Reset (0)"
                    >
                        Reset
                    </button>
                </div>

                {/* Image name */}
                <div className="absolute right-4 top-4 max-w-md truncate rounded-lg bg-zinc-800/90 px-4 py-2 text-sm text-white">
                    {imageName}
                </div>
            </div>
        </div>
    );
}
