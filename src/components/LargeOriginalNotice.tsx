interface LargeOriginalNoticeProperties {
  names: string[];
}

/**
 * Warn about originals that Commons may reject as single uploads.
 *
 * @param props - Large originals to name in the warning.
 * @param props.names - Names of originals above the warning threshold.
 * @returns An informational notice or nothing when there are no large originals.
 */
export function LargeOriginalNotice({ names }: LargeOriginalNoticeProperties) {
  if (names.length === 0) return null;
  return (
    <aside role="note" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
      <p>Wikimedia Commons may reject single uploads above 100 MB.</p>
      <p className="mt-1">Large originals: {names.join(', ')}</p>
      <a className="mt-2 inline-block underline underline-offset-2" href="https://github.com/wvanderp/Catapult/issues/2" target="_blank" rel="noreferrer">Details and updates</a>
    </aside>
  );
}
