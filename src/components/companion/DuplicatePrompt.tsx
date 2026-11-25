/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns -- Component props and output are explicit in the interface and JSX. */
import { AccessibleDialog } from './AccessibleDialog';

interface DuplicatePromptProps { count: number; onChoice: (choice: 'skip' | 'import' | 'cancel') => void; }

/**
Ask how to handle duplicate package photos.
 
 * @param root0
 * @param root0.count
 * @param root0.onChoice
 */
export function DuplicatePrompt({ count, onChoice }: DuplicatePromptProps) {
  return <AccessibleDialog title="Duplicate photos found" onClose={() => onChoice('cancel')}><p className="text-sm text-zinc-300">{count} photo(s) are already in this image set.</p><div className="flex justify-end gap-3"><button type="button" onClick={() => onChoice('cancel')} className="rounded border border-zinc-700 px-3 py-2 text-sm">Cancel import</button><button type="button" onClick={() => onChoice('skip')} className="rounded border border-zinc-700 px-3 py-2 text-sm">Skip duplicates</button><button type="button" onClick={() => onChoice('import')} className="rounded bg-teal-700 px-3 py-2 text-sm">Import anyway</button></div></AccessibleDialog>;
}
