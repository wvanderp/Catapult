interface FieldInputProps {
    fieldKey: string;
    value: string;
    onChange: (value: string) => void;
    onFocus?: () => void;
}

export function FieldInput({ fieldKey, value, onChange, onFocus }: FieldInputProps) {
    return (
        <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wider text-gray-500">
                {fieldKey}
            </label>
            <input
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onFocus={onFocus}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={fieldKey}
            />
        </div>
    );
}
