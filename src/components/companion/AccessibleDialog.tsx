/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns -- Component props and output are explicit in the interface and JSX. */
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface AccessibleDialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

/**
Render a labelled modal dialog with initial focus and Escape handling.
 
 * @param root0
 * @param root0.title
 * @param root0.children
 * @param root0.onClose
 */
export function AccessibleDialog({ title, children, onClose }: AccessibleDialogProps) {
  const dialogReference = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    dialogReference.current?.focus();
    /**
     *
     * @param event
     */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); previousFocus?.focus(); };
  }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogReference} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-full max-w-lg space-y-5 rounded-xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl"><h2 id={titleId} className="text-lg font-semibold text-zinc-100">{title}</h2>{children}</div></div>;
}
