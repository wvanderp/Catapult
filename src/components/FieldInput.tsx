import { applyTemplate, type TemplateContext } from '../utils/templateUtils';

interface FieldInputProps {
    fieldKey: string;
    value: string;
    onChange: (value: string) => void;
    onFocus?: () => void;
    template?: string;
    templateContext?: TemplateContext;
}

/**
 * FieldInput renders an input field with a label and optional template preview.
 * When a template context is provided, displays a live preview of the template with the current value.
 *
 * @param props - Component props
 * @param props.fieldKey - The key/label for the field
 * @param props.value - Current field value
 * @param props.onChange - Callback when value changes
 * @param props.onFocus - Optional callback when field is focused
 * @param props.templateContext - Optional context for template preview
 * @returns The field input component
 */
export function FieldInput({ fieldKey, value, onChange, onFocus, templateContext }: FieldInputProps) {
    let preview = '';
    if (templateContext && value) {
        const context = {
            ...templateContext,
            [fieldKey]: value,
        };
        preview = applyTemplate(value, context);
    }

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
            {preview && (
                <div className="px-3 py-2 text-xs text-gray-500 break-words">
                    {preview}
                </div>
            )}
        </div>
    );
}
