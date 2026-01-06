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

export interface ContextDataPanelProps {
    globalVariables: Record<string, string>;
    exifData: Record<string, unknown>;
    imageKeys: Record<string, string>;
    templateKeys: string[];
    activeFieldKey: string | undefined;
    onInsertReference: (reference: string) => void;
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

function ContextSectionDisplay({ section, disabled, onInsertReference }: {
    section: ContextSection;
    disabled: boolean;
    onInsertReference: (reference: string) => void;
}): JSX.Element | null {
    if (section.items.length === 0) {
        return null;
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

export function ContextDataPanel({
    globalVariables,
    exifData,
    imageKeys,
    templateKeys,
    activeFieldKey,
    onInsertReference,
}: ContextDataPanelProps) {
    const [showAllExif, setShowAllExif] = useState(false);

    const sections = useMemo<ContextSection[]>(() => {
        const result: ContextSection[] = [];

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
            ? Object.keys(exifData).sort()
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
    }, [globalVariables, exifData, templateKeys, showAllExif]);

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
