import { useRef, useState } from 'react';
import { useImageSetStore } from '../store/imageSetStore';
import { getImageBlob } from '../utils/imageBlobStorage';
import { extractCompanionExif } from '../utils/exifUtils';
import { findByIdentity, hashImageBlob, importFile, removePackage, reselect, type BrowserFileHandle } from '../utils/companion';
import { DuplicatePrompt } from '../components/companion/DuplicatePrompt';
import { ReconnectPrompt } from '../components/companion/ReconnectPrompt';

type Choice = 'skip' | 'import' | 'cancel' | 'reconnect' | 'copy';
interface PendingChoice { kind: 'duplicate' | 'reconnect'; count?: number; resolve: (choice: Choice) => void; }

/**
 * Coordinate companion package imports, prompts, cleanup, and image insertion.
 *
 * @returns Import action, current error message, and the active decision prompt.
 */
export function useCompanionImport() {
  const importQueue = useRef<Promise<void>>(Promise.resolve());
  const [pending, setPending] = useState<PendingChoice>();
  const [error, setError] = useState('');
  /**
   * Display a choice prompt and resolve it when the user responds.
   *
   * @param kind The prompt to show.
   * @param count The duplicate count, when relevant.
   */
  function ask(kind: PendingChoice['kind'], count?: number): Promise<Choice> {
    return new Promise((resolve) => setPending({ kind, count, resolve }));
  }
  /**
   * Resolve and close the active prompt.
   *
   * @param choice The user's selected action.
   */
  function finish(choice: Choice) {
    pending?.resolve(choice);
    setPending(undefined);
  }
  /**
   * Import a package, handling identity conflicts and duplicate images.
   *
   * @param file The selected companion ZIP.
   * @param handle The optional browser file handle.
   */
  async function runImport(file: File, handle?: BrowserFileHandle) {
    setError('');
    let packageId: string | undefined;
    try {
      const { record, photos } = await importFile(file, handle);
      packageId = record.id;
      const prior = await findByIdentity(record.identity);
      if (prior && prior.id !== record.id) {
        const choice = await ask('reconnect');
        if (choice === 'cancel') { await removePackage(record.id); return; }
        if (choice === 'reconnect') {
          const result = await reselect(prior.id, file, handle);
          if (!result.ok) throw new Error(result.message);
          await removePackage(record.id);
          return;
        }
      }
      const state = useImageSetStore.getState();
      const hashes = new Set(Object.values(state.imageSet.images).map((image) => image.sha256).filter((hash): hash is string => Boolean(hash)));
      for (const image of Object.values(state.imageSet.images)) {
        if (image.companion || image.sha256) {
          continue;
        }

        const stored = await getImageBlob(image.id); if (stored) hashes.add(await hashImageBlob(stored.blob));
      }
      const duplicates = photos.filter((photo, index) => hashes.has(photo.sha256) || photos.slice(0, index).some((earlier) => earlier.sha256 === photo.sha256));
      const duplicateChoice = duplicates.length > 0 ? await ask('duplicate', duplicates.length) : 'import';
      if (duplicateChoice === 'cancel') { await removePackage(record.id); return; }
      const importedHashes = new Set(hashes);
      const selected = photos.filter((photo) => {
        if (duplicateChoice === 'import') return true;
        if (importedHashes.has(photo.sha256)) return false;
        importedHashes.add(photo.sha256);
        return true;
      });
      if (selected.length === 0) {
        await removePackage(record.id);
        return;
      }
      const ids = await state.addCompanionImages(selected);
      packageId = undefined;
      void extractCompanionExif(ids);
    } catch (error_) {
      if (packageId) {
        try {
          await removePackage(packageId);
        } catch {
          // Keep the import error visible even if temporary record cleanup fails.
        }
      }
      setError(error_ instanceof Error ? error_.message : 'Unable to import companion package');
    }
  }
  /**
   * Queue each package so one unresolved prompt cannot be overwritten by another.
   *
   * @param file Selected ZIP.
   * @param handle Optional file handle.
   * @returns A promise for the queued import.
   */
  function importPackage(file: File, handle?: BrowserFileHandle): Promise<void> {
    const next = importQueue.current.then(() => runImport(file, handle));
    importQueue.current = next.catch(() => {});
    return next;
  }
  const prompt = pending?.kind === 'duplicate' ? <DuplicatePrompt count={pending.count ?? 0} onChoice={finish} /> : (pending ? <ReconnectPrompt onChoice={finish} /> : null);
  return { importPackage, error, prompt };
}
