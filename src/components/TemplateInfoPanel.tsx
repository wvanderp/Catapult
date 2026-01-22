import { useEffect, useRef } from 'react';

interface TemplateInfoPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * TemplateInfoPanel provides comprehensive documentation about the templating language.
 * Displays as a modal dialog that can be opened from the header info button.
 * 
 * Features:
 * - Modal dialog presentation
 * - Detailed explanation of template syntax (<<<variable>>>)
 * - Documentation of variable types: local, global, exif, utility
 * - Example usage with real-world scenarios
 * - Nested path access documentation
 * - Information about recursive resolution
 * - Click outside or ESC key to close
 * 
 * @param props - Component props
 * @param props.isOpen - Whether the modal is open
 * @param props.onClose - Function to call when the modal should close
 * @returns The template information panel component
 */
export function TemplateInfoPanel({ isOpen, onClose }: TemplateInfoPanelProps) {
    const modalReference = useRef<HTMLDivElement>(null);

    useEffect(() => {
        /**
         * Handle keyboard events for the modal
         *
         * @param event - Keyboard event
         */
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape' && isOpen) {
                onClose();
            }
        }

        /**
         * Handle click outside the modal to close it
         *
         * @param event - Mouse event
         */
        function handleClickOutside(event: MouseEvent) {
            if (modalReference.current && !modalReference.current.contains(event.target as Node)) {
                onClose();
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.addEventListener('mousedown', handleClickOutside);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-20">
            <div ref={modalReference} className="relative w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-700 p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-5 w-5"
                            >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 16v-4" />
                                <path d="M12 8h.01" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">How Templating Works</h2>
                            <p className="text-sm text-gray-500">
                                Learn about the template syntax and available variables
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-zinc-800 hover:text-white"
                        aria-label="Close"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-6 w-6"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="space-y-6 p-6">
                    {/* Basic Syntax */}
                    <div>
                        <h4 className="mb-2 text-base font-semibold text-white">Basic Syntax</h4>
                        <p className="mb-3 text-sm text-gray-400">
                            Templates use triple angle brackets to define variables that will be replaced with actual values:
                        </p>
                        <div className="rounded-lg bg-zinc-900 p-4 font-mono text-sm">
                            <code className="text-green-400">{"<<<variable>>>"}</code>
                        </div>
                        <p className="mt-2 text-sm text-gray-500">
                            Variables are case-sensitive and spaces inside the brackets are trimmed.
                        </p>
                    </div>

                    {/* Variable Types */}
                    <div>
                        <h4 className="mb-3 text-base font-semibold text-white">Variable Types</h4>
                        <div className="space-y-4">
                            {/* Local Variables */}
                            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                                <h5 className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-400">
                                    <span className="rounded bg-blue-600/20 px-2 py-0.5">Local</span>
                                    Per-Image Variables
                                </h5>
                                <p className="mb-2 text-sm text-gray-400">
                                    Values that are specific to each image. These are set individually for every image.
                                </p>
                                <div className="rounded bg-zinc-950 p-3 font-mono text-xs">
                                    <code className="text-gray-300">{"<<<title>>>"}, {"<<<description>>>"}, {"<<<location>>>"}</code>
                                </div>
                            </div>

                            {/* Global Variables */}
                            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                                <h5 className="mb-2 flex items-center gap-2 text-sm font-medium text-green-400">
                                    <span className="rounded bg-green-600/20 px-2 py-0.5">Global</span>
                                    Shared Variables
                                </h5>
                                <p className="mb-2 text-sm text-gray-400">
                                    Values that apply to all images. Access using the <code className="rounded bg-zinc-800 px-1 text-green-400">global.</code> prefix.
                                </p>
                                <div className="rounded bg-zinc-950 p-3 font-mono text-xs">
                                    <code className="text-gray-300">{"<<<global.author>>>"}, {"<<<global.license>>>"}, {"<<<global.event>>>"}</code>
                                </div>
                                <p className="mt-2 text-xs text-gray-500">
                                    Global variables can also be accessed without the prefix, but local values take priority.
                                </p>
                            </div>

                            {/* EXIF Variables */}
                            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                                <h5 className="mb-2 flex items-center gap-2 text-sm font-medium text-purple-400">
                                    <span className="rounded bg-purple-600/20 px-2 py-0.5">EXIF</span>
                                    Image Metadata
                                </h5>
                                <p className="mb-2 text-sm text-gray-400">
                                    Data extracted from the image file. Access using the <code className="rounded bg-zinc-800 px-1 text-purple-400">exif.</code> prefix.
                                </p>
                                <div className="rounded bg-zinc-950 p-3 font-mono text-xs">
                                    <code className="text-gray-300">{"<<<exif.DateTimeOriginal>>>"}, {"<<<exif.Make>>>"}, {"<<<exif.Model>>>"}</code>
                                </div>
                                <p className="mt-2 text-xs text-gray-500">
                                    Available EXIF fields depend on your camera and image format.
                                </p>
                            </div>

                            {/* Utility Variables */}
                            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                                <h5 className="mb-2 flex items-center gap-2 text-sm font-medium text-orange-400">
                                    <span className="rounded bg-orange-600/20 px-2 py-0.5">Utility</span>
                                    Auto-Generated Values
                                </h5>
                                <p className="mb-2 text-sm text-gray-400">
                                    Automatically computed values. Access using the <code className="rounded bg-zinc-800 px-1 text-orange-400">utility.</code> prefix.
                                </p>
                                <div className="space-y-2">
                                    <div className="rounded bg-zinc-950 p-3">
                                        <div className="mb-1 font-mono text-xs text-gray-300">
                                            <code className="text-orange-400">{"<<<utility.extension>>>"}</code>
                                        </div>
                                        <p className="text-xs text-gray-500">File extension without dot (e.g., jpg, png)</p>
                                    </div>
                                    <div className="rounded bg-zinc-950 p-3">
                                        <div className="mb-1 font-mono text-xs text-gray-300">
                                            <code className="text-orange-400">{"<<<utility.index>>>"}</code>
                                        </div>
                                        <p className="text-xs text-gray-500">Position in upload queue (1-based)</p>
                                    </div>
                                    <div className="rounded bg-zinc-950 p-3">
                                        <div className="mb-1 font-mono text-xs text-gray-300">
                                            <code className="text-orange-400">{"<<<utility.date>>>"}</code>
                                        </div>
                                        <p className="text-xs text-gray-500">Formatted date from EXIF (YYYY-MM-DD)</p>
                                    </div>
                                    <div className="rounded bg-zinc-950 p-3">
                                        <div className="mb-1 font-mono text-xs text-gray-300">
                                            <code className="text-orange-400">{"<<<utility.dateTime>>>"}</code>
                                        </div>
                                        <p className="text-xs text-gray-500">Formatted datetime from EXIF (YYYY-MM-DD HH:mm)</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Examples */}
                    <div>
                        <h4 className="mb-3 text-base font-semibold text-white">Examples</h4>
                        <div className="space-y-3">
                            <div className="rounded-lg bg-zinc-900 p-4">
                                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                                    Title Template
                                </div>
                                <div className="font-mono text-sm text-gray-300">
                                    {"<<<utility.date>>>_<<<title>>>_<<<utility.index>>>.<<<utility.extension>>>"}
                                </div>
                                <div className="mt-2 text-xs text-gray-500">
                                    Result: <span className="text-gray-400">2026-01-22_Sunset_Beach_1.jpg</span>
                                </div>
                            </div>

                            <div className="rounded-lg bg-zinc-900 p-4">
                                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                                    Description Template
                                </div>
                                <div className="font-mono text-sm text-gray-300">
                                    {"<<<description>>>\n\nPhoto by <<<global.author>>>\nCamera: <<<exif.Make>>> <<<exif.Model>>>\nLicense: <<<global.license>>>"}
                                </div>
                                <div className="mt-2 text-xs text-gray-500">
                                    Combines local, global, and EXIF variables for rich descriptions.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Features */}
                    <div>
                        <h4 className="mb-2 text-base font-semibold text-white">Advanced Features</h4>
                        <div className="space-y-3 text-sm text-gray-400">
                            <div className="rounded-lg border-l-4 border-blue-600 bg-zinc-900/50 p-3">
                                <h5 className="mb-1 font-medium text-white">Nested Path Access</h5>
                                <p className="text-xs">
                                    Use dot notation to access nested properties: <code className="rounded bg-zinc-800 px-1 font-mono text-blue-400">{"<<<exif.GPS.Latitude>>>"}</code>
                                </p>
                            </div>

                            <div className="rounded-lg border-l-4 border-blue-600 bg-zinc-900/50 p-3">
                                <h5 className="mb-1 font-medium text-white">Recursive Resolution</h5>
                                <p className="text-xs">
                                    Variables can reference other variables. The template engine resolves them recursively up to 10 iterations.
                                </p>
                            </div>

                            <div className="rounded-lg border-l-4 border-yellow-600 bg-zinc-900/50 p-3">
                                <h5 className="mb-1 font-medium text-white">Missing Variables</h5>
                                <p className="text-xs">
                                    Unresolved variables will show as <code className="rounded bg-zinc-800 px-1 font-mono text-yellow-400">{"<<<missing>>>"}</code> in the final output.
                                </p>
                            </div>

                            <div className="rounded-lg border-l-4 border-green-600 bg-zinc-900/50 p-3">
                                <h5 className="mb-1 font-medium text-white">Priority Order</h5>
                                <p className="text-xs">
                                    For non-prefixed variables: local values override global values.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
