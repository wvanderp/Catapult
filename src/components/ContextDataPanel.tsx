import { useMemo, useState } from 'react';

interface ContextItem {
    key: string;
    value: string;
    referenceKey: string;
}

interface ContextSection {
    title: string;
    items: ContextItem[];
    icon: React.ReactNode;
}


const DEFAULT_EXIF_FIELDS = [
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
    'ISO'
];

/**
 * ContextItemButton renders a clickable button displaying a context item's key-value pair.
 * It shows the key in gray and the value below it, with conditional styling based on disabled state.
 *
 * @param props - The component props
 * @param props.item - The context item to display
 * @param props.disabled - Whether the button is disabled
 * @param props.onClick - Click handler function
 * @returns The context item button component
 */
function ContextItemButton({ item, disabled, onClick }: {
    item: ContextItem;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`group flex flex-col rounded-xl border border-zinc-700/50 bg-zinc-800/60 p-2.5 text-left transition-all duration-200 ${disabled
                ? 'cursor-default opacity-50'
                : 'cursor-pointer hover:border-teal-500/30 hover:bg-zinc-700/60 hover:shadow-md hover:shadow-teal-500/5'
                }`}
            title={disabled ? 'Select a field above first' : `Click to insert ${item.referenceKey}`}
        >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors group-hover:text-teal-400">{item.key}</span>
            <span className="truncate text-sm font-medium text-zinc-200">{item.value}</span>
        </button>
    );
}

/**
 * ContextSectionDisplay renders a section of context items in a grid layout.
 * Returns undefined if the section has no items.
 *
 * @param props - The component props
 * @param props.section - The section data containing title and items
 * @param props.disabled - Whether insertion is disabled
 * @param props.onInsertReference - Callback to insert a reference
 * @returns The section display component or undefined
 */
function ContextSectionDisplay({ section, disabled, onInsertReference }: {
    section: ContextSection;
    disabled: boolean;
    onInsertReference: (reference: string) => void;
}): React.JSX.Element | undefined {
    if (section.items.length === 0) {
        return undefined;
    }

    return (
        <div className="space-y-3">
            <h5 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                <span className="flex size-5 items-center justify-center rounded-md bg-zinc-700/50 text-zinc-400">
                    {section.icon}
                </span>
                {section.title}
                <span className="rounded-full bg-zinc-700/50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                    {section.items.length}
                </span>
            </h5>
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {section.items.map((item) => (
                    <ContextItemButton
                        key={item.referenceKey}
                        item={item}
                        disabled={disabled}
                        onClick={() => onInsertReference(item.referenceKey)}
                    />
                ))}
            </div>
        </div>
    );
}

export interface ContextDataPanelProps {
    globalVariables: Record<string, string>;
    exifData: Record<string, unknown>;
    templateKeys: string[];
    activeFieldKey: string | undefined;
    onInsertReference: (reference: string) => void;
    utility?: {
        extension: string;
        index: number;
        date?: string;
        dateTime?: string;
    };
}

/**
 * ContextDataPanel displays available context data for template variable insertion.
 * Shows global variables, EXIF data, utility context, and template keys in organized sections.
 * Users can click items to insert references into the active field.
 *
 * @param props - Component props
 * @param props.globalVariables - Global variables available across all images
 * @param props.exifData - EXIF metadata extracted from the image
 * @param props.templateKeys - Keys defined in the template
 * @param props.activeFieldKey - Currently focused field key
 * @param props.onInsertReference - Callback to insert a reference into the active field
 * @param props.utility - Utility context information (extension, index, date, dateTime)
 * @returns The context data panel component
 */
export function ContextDataPanel({
    globalVariables,
    exifData,
    templateKeys,
    activeFieldKey,
    onInsertReference,
    utility,
}: ContextDataPanelProps) {
    const [showAllExif, setShowAllExif] = useState(false);

    const sections = useMemo<ContextSection[]>(() => {
        const result: ContextSection[] = [];

        // Utility context section
        if (utility) {
            const utilityItems: ContextItem[] = Object.entries(utility)
                .filter(([, value]) => value !== undefined && value !== null)
                .map(([key, value]) => ({
                    key,
                    value: String(value),
                    referenceKey: `<<<utility.${key}>>>`,
                }));

            if (utilityItems.length > 0) {
                result.push({
                    title: 'Utility',
                    items: utilityItems,
                    icon: <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                });
            }
        }

        // Global variables section
        const globalItems: ContextItem[] = templateKeys
            .filter(key => globalVariables[key]?.trim())
            .map(key => ({
                key,
                value: globalVariables[key],
                referenceKey: `<<<global.${key}>>>`,
            }));

        if (globalItems.length > 0) {
            result.push({
                title: 'Global Variables',
                items: globalItems,
                icon: <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>
            });
        }

        // EXIF data section - dynamically get all EXIF fields
        const exifItems: ContextItem[] = [];
        const exifFields = showAllExif
            ? Object.keys(exifData).toSorted()
            : DEFAULT_EXIF_FIELDS.filter(field => field in exifData);

        for (const field of exifFields) {
            if (exifData[field] !== undefined && exifData[field] !== null) {
                exifItems.push({
                    key: field,
                    value: String(exifData[field]),
                    referenceKey: `<<<exif.${field}>>>`,
                });
            }
        }

        if (exifItems.length > 0) {
            result.push({
                title: 'EXIF Data',
                items: exifItems,
                icon: <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            });
        }

        return result;
    }, [globalVariables, exifData, templateKeys, showAllExif, utility]);

    const hasAnyData = sections.length > 0;
    const hasExifData = Object.keys(exifData).length > 0;

    return (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5 backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                    <svg className="size-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                    Available Data (click to insert)
                </h4>
                {activeFieldKey && (
                    <span className="flex items-center gap-1.5 rounded-lg bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-400 ring-1 ring-teal-500/25">
                        <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        Adding to: {activeFieldKey}
                    </span>
                )}
            </div>

            {hasAnyData ? (
                <div className="space-y-5">
                    {sections.map((section) => (
                        <ContextSectionDisplay
                            key={section.title}
                            section={section}
                            disabled={!activeFieldKey}
                            onInsertReference={onInsertReference}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-zinc-800/60">
                        <svg className="size-6 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                    </div>
                    <p className="text-sm text-zinc-500">No data available to insert.</p>
                    <p className="mt-1 text-xs text-zinc-600">Add global variables in the previous step, or use images with EXIF metadata.</p>
                </div>
            )}
            {hasExifData && (
                <button
                    onClick={() => setShowAllExif(!showAllExif)}
                    className="mt-5 flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3.5 py-2 text-xs font-semibold text-zinc-300 transition-all duration-200 hover:border-zinc-600/50 hover:bg-zinc-700/50"
                >
                    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        {showAllExif ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        )}
                    </svg>
                    {showAllExif ? 'Show common EXIF fields' : 'Show all EXIF fields'}
                </button>
            )}
        </div>
    );
}

