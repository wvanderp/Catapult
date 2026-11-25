/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns -- Component props and output are explicit in the interface and JSX. */
import { AccessibleDialog } from './AccessibleDialog';

interface ReconnectPromptProps { onChoice: (choice: 'reconnect' | 'copy' | 'cancel') => void; }

/**
Ask whether to restore a saved companion package or import a separate copy.
 
 * @param root0
 * @param root0.onChoice
 */
export function ReconnectPrompt({ onChoice }: ReconnectPromptProps) {
  return <AccessibleDialog title="Package already imported" onClose={() => onChoice('cancel')}><p className="text-sm text-zinc-300">Reconnect to saved photos and keep their edits, or import this package as a new copy.</p><div className="flex justify-end gap-3"><button type="button" onClick={() => onChoice('cancel')} className="rounded border border-zinc-700 px-3 py-2 text-sm">Cancel</button><button type="button" onClick={() => onChoice('copy')} className="rounded border border-zinc-700 px-3 py-2 text-sm">Import as new copy</button><button type="button" onClick={() => onChoice('reconnect')} className="rounded bg-teal-700 px-3 py-2 text-sm">Reconnect</button></div></AccessibleDialog>;
}
