import { useMemo, useState } from 'react';

interface ContextItem {
    key: string;
    value: string;
    referenceKey: string;
}

interface ContextSection {
    title: string;
    items: ContextItem[];
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
            className={`flex flex-col rounded bg-zinc-800 p-2 text-left transition-colors ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-zinc-700'
                }`}
            title={disabled ? 'Select a field above first' : `Click to insert ${item.referenceKey}`}
        >
            <span className="text-xs text-gray-500">{item.key}</span>
            <span className="truncate text-gray-300">{item.value}</span>
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
        <div className="space-y-2">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {section.title}
            </h5>
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3 lg:grid-cols-4">
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
                result.push({ title: 'Utility', items: utilityItems });
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
            result.push({ title: 'Global Variables', items: globalItems });
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
            result.push({ title: 'EXIF Data', items: exifItems });
        }

        return result;
    }, [globalVariables, exifData, templateKeys, showAllExif, utility]);

    const hasAnyData = sections.length > 0;
    const hasExifData = Object.keys(exifData).length > 0;

    return (
        <div className="rounded-xl bg-zinc-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-400">
                    Available Context
                    {activeFieldKey && (
                        <span className="ml-2 text-blue-400">→ Click to insert into {activeFieldKey}</span>
                    )}
                </h4>
            </div>

            {hasAnyData ? (
                <div className="space-y-4">
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
                <div className="text-center text-sm text-gray-500">
                    No context data available. Set global variables in the Variables tab or upload images with EXIF data.
                </div>
            )}
            {hasExifData && (
                <button
                    onClick={() => setShowAllExif(!showAllExif)}
                    className="mt-4 rounded bg-zinc-700 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-zinc-600"
                >
                    {showAllExif ? 'Show Default EXIF' : 'Show All EXIF'}
                </button>
            )}
        </div>
    );
}
