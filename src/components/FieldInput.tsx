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

    const hasValue = value.trim().length > 0;

    return (
        <div className="group space-y-2">
            <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 transition-colors group-focus-within:text-teal-400">
                <span>{fieldKey}</span>
                {hasValue && (
                    <span className="flex size-1.5 rounded-full bg-emerald-400" />
                )}
            </label>
            <input
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onFocus={onFocus}
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-4 py-3 text-sm text-white transition-all duration-200 placeholder:text-zinc-600 focus:border-teal-400/50 focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                placeholder={`Value for ${fieldKey}`}
            />
            {templateContext && (
                <div className="min-h-[3rem] rounded-lg bg-zinc-800/50 px-3 py-2.5 text-xs leading-relaxed text-zinc-400 ring-1 ring-zinc-700/30 break-all">
                    {preview || <span className="text-zinc-600 italic">Live preview appears as you type</span>}
                </div>
            )}
        </div>
    );
}

