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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-6 pt-16 backdrop-blur-sm">
            <div ref={modalReference} className="relative w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 p-6">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/15 text-teal-400 ring-1 ring-teal-500/30">
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
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 16v-4" />
                                <path d="M12 8h.01" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">How Templating Works</h2>
                            <p className="text-sm text-zinc-500">
                                Master the template syntax to automate your descriptions
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2.5 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
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
                <div className="space-y-8 p-6">
                    {/* Basic Syntax */}
                    <div>
                        <h4 className="mb-3 text-base font-semibold text-white">Basic Syntax</h4>
                        <p className="mb-4 text-sm text-zinc-400">
                            Templates use triple angle brackets to define variables that will be replaced with actual values:
                        </p>
                        <div className="rounded-xl bg-zinc-900 p-4 font-mono text-sm ring-1 ring-zinc-800">
                            <code className="text-teal-400">{"<<<variable>>>"}</code>
                        </div>
                        <p className="mt-3 text-sm text-zinc-600">
                            Variables are case-sensitive and spaces inside the brackets are trimmed.
                        </p>
                    </div>

                    {/* Variable Types */}
                    <div>
                        <h4 className="mb-4 text-base font-semibold text-white">Variable Types</h4>
                        <div className="space-y-4">
                            {/* Local Variables */}
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                                <h5 className="mb-2 flex items-center gap-2 text-sm font-semibold text-teal-400">
                                    <span className="rounded-md bg-teal-500/15 px-2.5 py-1 ring-1 ring-teal-500/30">Local</span>
                                    Per-Image Variables
                                </h5>
                                <p className="mb-3 text-sm text-zinc-400">
                                    Values that are specific to each image. These are set individually for every image.
                                </p>
                                <div className="rounded-lg bg-zinc-950 p-3 font-mono text-xs ring-1 ring-zinc-800">
                                    <code className="text-zinc-300">{"<<<title>>>"}, {"<<<description>>>"}, {"<<<location>>>"}</code>
                                </div>
                            </div>

                            {/* Global Variables */}
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                                <h5 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-400">
                                    <span className="rounded-md bg-emerald-500/15 px-2.5 py-1 ring-1 ring-emerald-500/30">Global</span>
                                    Shared Variables
                                </h5>
                                <p className="mb-3 text-sm text-zinc-400">
                                    Values that apply to all images. Access using the <code className="rounded-md bg-zinc-800 px-1.5 text-emerald-400">global.</code> prefix.
                                </p>
                                <div className="rounded-lg bg-zinc-950 p-3 font-mono text-xs ring-1 ring-zinc-800">
                                    <code className="text-zinc-300">{"<<<global.author>>>"}, {"<<<global.license>>>"}, {"<<<global.event>>>"}</code>
                                </div>
                                <p className="mt-3 text-xs text-zinc-600">
                                    Global variables can also be accessed without the prefix, but local values take priority.
                                </p>
                            </div>

                            {/* EXIF Variables */}
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                                <h5 className="mb-2 flex items-center gap-2 text-sm font-semibold text-purple-400">
                                    <span className="rounded-md bg-purple-500/15 px-2.5 py-1 ring-1 ring-purple-500/30">EXIF</span>
                                    Image Metadata
                                </h5>
                                <p className="mb-3 text-sm text-zinc-400">
                                    Data extracted from the image file. Access using the <code className="rounded-md bg-zinc-800 px-1.5 text-purple-400">exif.</code> prefix.
                                </p>
                                <div className="rounded-lg bg-zinc-950 p-3 font-mono text-xs ring-1 ring-zinc-800">
                                    <code className="text-zinc-300">{"<<<exif.DateTimeOriginal>>>"}, {"<<<exif.Make>>>"}, {"<<<exif.Model>>>"}</code>
                                </div>
                                <p className="mt-3 text-xs text-zinc-600">
                                    Available EXIF fields depend on your camera and image format.
                                </p>
                            </div>

                            {/* Utility Variables */}
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                                <h5 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-400">
                                    <span className="rounded-md bg-amber-500/15 px-2.5 py-1 ring-1 ring-amber-500/30">Utility</span>
                                    Auto-Generated Values
                                </h5>
                                <p className="mb-3 text-sm text-zinc-400">
                                    Automatically computed values. Access using the <code className="rounded-md bg-zinc-800 px-1.5 text-amber-400">utility.</code> prefix.
                                </p>
                                <div className="space-y-2">
                                    <div className="rounded-lg bg-zinc-950 p-3 ring-1 ring-zinc-800">
                                        <div className="mb-1.5 font-mono text-xs text-zinc-300">
                                            <code className="text-amber-400">{"<<<utility.extension>>>"}</code>
                                        </div>
                                        <p className="text-xs text-zinc-600">File extension without dot (e.g., jpg, png)</p>
                                    </div>
                                    <div className="rounded-lg bg-zinc-950 p-3 ring-1 ring-zinc-800">
                                        <div className="mb-1.5 font-mono text-xs text-zinc-300">
                                            <code className="text-amber-400">{"<<<utility.index>>>"}</code>
                                        </div>
                                        <p className="text-xs text-zinc-600">Position in upload queue (1-based)</p>
                                    </div>
                                    <div className="rounded-lg bg-zinc-950 p-3 ring-1 ring-zinc-800">
                                        <div className="mb-1.5 font-mono text-xs text-zinc-300">
                                            <code className="text-amber-400">{"<<<utility.date>>>"}</code>
                                        </div>
                                        <p className="text-xs text-zinc-600">Formatted date from EXIF (YYYY-MM-DD)</p>
                                    </div>
                                    <div className="rounded-lg bg-zinc-950 p-3 ring-1 ring-zinc-800">
                                        <div className="mb-1.5 font-mono text-xs text-zinc-300">
                                            <code className="text-amber-400">{"<<<utility.dateTime>>>"}</code>
                                        </div>
                                        <p className="text-xs text-zinc-600">Formatted datetime from EXIF (YYYY-MM-DD HH:mm)</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Examples */}
                    <div>
                        <h4 className="mb-4 text-base font-semibold text-white">Examples</h4>
                        <div className="space-y-4">
                            <div className="rounded-xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
                                <div className="mb-2.5 text-xs font-bold uppercase tracking-widest text-zinc-600">
                                    Title Template
                                </div>
                                <div className="font-mono text-sm text-zinc-300">
                                    {"<<<utility.date>>>_<<<title>>>_<<<utility.index>>>.<<<utility.extension>>>"}
                                </div>
                                <div className="mt-3 text-xs text-zinc-500">
                                    Result: <span className="text-teal-400">2026-01-22_Sunset_Beach_1.jpg</span>
                                </div>
                            </div>

                            <div className="rounded-xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
                                <div className="mb-2.5 text-xs font-bold uppercase tracking-widest text-zinc-600">
                                    Description Template
                                </div>
                                <div className="font-mono text-sm text-zinc-300">
                                    {"<<<description>>>\n\nPhoto by <<<global.author>>>\nCamera: <<<exif.Make>>> <<<exif.Model>>>\nLicense: <<<global.license>>>"}
                                </div>
                                <div className="mt-3 text-xs text-zinc-500">
                                    Combines local, global, and EXIF variables for rich descriptions.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Conditional Blocks */}
                    <div>
                        <h4 className="mb-4 text-base font-semibold text-white">Conditional Blocks</h4>
                        <p className="mb-4 text-sm text-zinc-400">
                            Include content only when a variable is defined and not empty:
                        </p>
                        <div className="space-y-4">
                            <div className="rounded-xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
                                <div className="mb-2.5 text-xs font-bold uppercase tracking-widest text-zinc-600">
                                    Syntax
                                </div>
                                <div className="font-mono text-sm text-teal-400">
                                    {"<<<if {variable}>>>"}
                                    <span className="text-zinc-400">content to include</span>
                                    {"<<<endif>>>"}
                                </div>
                            </div>

                            <div className="rounded-xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
                                <div className="mb-2.5 text-xs font-bold uppercase tracking-widest text-zinc-600">
                                    Example: Optional Category
                                </div>
                                <div className="font-mono text-sm text-zinc-300">
                                    {"<<<if {global.category}>>>[[Category:<<<global.category>>>]]<<<endif>>>"}
                                </div>
                                <div className="mt-3 text-xs text-zinc-500">
                                    Only adds the category if <code className="text-emerald-400">global.category</code> is set.
                                </div>
                            </div>

                            <div className="rounded-xl bg-zinc-900 p-5 ring-1 ring-zinc-800">
                                <div className="mb-2.5 text-xs font-bold uppercase tracking-widest text-zinc-600">
                                    Nested Conditionals
                                </div>
                                <div className="font-mono text-sm text-zinc-300 whitespace-pre-line">
                                    {"<<<if {location}>>>Location: <<<location>>>\n<<<if {exif.GPS.Latitude}>>>GPS: <<<exif.GPS.Latitude>>><<<endif>>><<<endif>>>"}
                                </div>
                                <div className="mt-3 text-xs text-zinc-500">
                                    Conditionals can be nested inside each other.
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                            <h5 className="mb-3 text-sm font-semibold text-white">What counts as "defined"?</h5>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="text-emerald-400">✓ Truthy: any text, numbers (including 0), booleans</div>
                                <div className="text-red-400">✗ Falsy: undefined, null, empty string, whitespace only</div>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Features */}
                    <div>
                        <h4 className="mb-4 text-base font-semibold text-white">Advanced Features</h4>
                        <div className="space-y-3 text-sm text-zinc-400">
                            <div className="rounded-xl border-l-4 border-teal-600 bg-zinc-900/50 p-4">
                                <h5 className="mb-1.5 font-semibold text-white">Nested Path Access</h5>
                                <p className="text-xs">
                                    Use dot notation to access nested properties: <code className="rounded-md bg-zinc-800 px-1.5 font-mono text-teal-400">{"<<<exif.GPS.Latitude>>>"}</code>
                                </p>
                            </div>

                            <div className="rounded-xl border-l-4 border-teal-600 bg-zinc-900/50 p-4">
                                <h5 className="mb-1.5 font-semibold text-white">Recursive Resolution</h5>
                                <p className="text-xs">
                                    Variables can reference other variables. The template engine resolves them recursively up to 10 iterations.
                                </p>
                            </div>

                            <div className="rounded-xl border-l-4 border-amber-600 bg-zinc-900/50 p-4">
                                <h5 className="mb-1.5 font-semibold text-white">Missing Variables</h5>
                                <p className="text-xs">
                                    Unresolved variables will show as <code className="rounded-md bg-zinc-800 px-1.5 font-mono text-amber-400">{"<<<missing>>>"}</code> in the final output.
                                </p>
                            </div>

                            <div className="rounded-xl border-l-4 border-emerald-600 bg-zinc-900/50 p-4">
                                <h5 className="mb-1.5 font-semibold text-white">Priority Order</h5>
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

