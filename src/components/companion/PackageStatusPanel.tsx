import React, { useEffect, useSyncExternalStore, useState } from 'react';
import { getSnapshot, reselect, requestAccess, subscribe, type PackageAvailability } from '../../utils/companion';

interface PackageStatusPanelProps { onReselect: (file: File, packageId: string) => Promise<void>; }
const stateLabels: Record<PackageAvailability, string> = { available: 'Available', 'needs-permission': 'Needs permission', missing: 'Missing', mismatch: 'Mismatch', unselected: 'Unselected' };

/**
Lists saved packages and lets the user restore access.
 
 * @param root0 Panel callbacks.
 * @param root0.onReselect Called when a saved package is selected again.
 * @returns Saved package status rows.
 */
export function PackageStatusPanel({ onReselect }: PackageStatusPanelProps) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string>();

  useEffect(() => {
    /**
     *
     */
    function onWindowFocus() { /* session is refreshed explicitly by user action */ }
    window.addEventListener('focus', onWindowFocus);
    return () => window.removeEventListener('focus', onWindowFocus);
  }, []);

  /**
   *
   * @param event File input change event.
   * @param id Saved package identifier.
   */
  async function handleReselect(event: React.ChangeEvent<HTMLInputElement>, id: string) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPending(id);
    try {
      const result = await reselect(id, file);
      if (result.ok) { setErrors((previous) => ({ ...previous, [id]: '' })); await onReselect(file, id); }
      else {setErrors((previous) => ({ ...previous, [id]: result.message }));}
    } catch (error) { setErrors((previous) => ({ ...previous, [id]: error instanceof Error ? error.message : 'Could not select package' })); }
    finally { setPending(undefined); }
  }

  /**
   *
   * @param id Saved package identifier.
   */
  async function handleReopen(id: string) {
    setPending(id);
    try { const result = await requestAccess(id); if (result.ok) {setErrors((previous) => ({ ...previous, [id]: '' }));} else {setErrors((previous) => ({ ...previous, [id]: result.message }));} }
    finally { setPending(undefined); }
  }

  const entries = Object.values(snapshot.packages);
  if (entries.length === 0) return null;
  return <section aria-label="Saved companion packages" className="space-y-2 rounded-xl border border-zinc-800 p-4"><h3 className="text-sm font-semibold text-zinc-200">Saved packages</h3>{entries.map((record) => {
    const state = snapshot.states[record.id] ?? 'unselected';
    return <div key={record.id} className="flex items-center gap-3 border-t border-zinc-800 py-3"><span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{record.name}</span><span className="text-xs text-zinc-500">{stateLabels[state]}</span>{state === 'available' ? <button type="button" onClick={() => void handleReopen(record.id)} disabled={pending === record.id} className="text-xs text-teal-300">Reopen</button> : <label className="cursor-pointer text-xs text-teal-300">Select again<input type="file" accept=".zip,application/zip" className="sr-only" aria-label={`Select ${record.name} again`} disabled={pending === record.id} onChange={(event) => void handleReselect(event, record.id)} /></label>}{errors[record.id] && <span role="alert" className="basis-full text-xs text-amber-300">{errors[record.id]}</span>}</div>;
  })}</section>;
}
