import React, { useRef } from 'react';

interface ImportPackageButtonProps {
  onFiles: (files: FileList | File[], handle?: { getFile: () => Promise<File> }) => void;
  onError: (error: string) => void;
}

/**
Offers the native ZIP picker with a compatible file input fallback.
 
 * @param root0 Button callbacks.
 * @param root0.onFiles Receives selected package files and optional file handle.
 * @param root0.onError Receives picker failures.
 * @returns Package import button and fallback input.
 */
export function ImportPackageButton({ onFiles, onError }: ImportPackageButtonProps) {
  const inputReference = useRef<HTMLInputElement>(null);

  /**
   *
   */
  async function openPicker() {
    // eslint-disable-next-line unicorn/no-unnecessary-global-this -- optional browser API feature detection.
    const picker = (globalThis as typeof globalThis & { showOpenFilePicker?: (options: unknown) => Promise<Array<{ getFile: () => Promise<File> }>> }).showOpenFilePicker;
    if (!picker) {
      inputReference.current?.click();
      return;
    }
    try {
      const [handle] = await picker({ multiple: false, types: [{ description: 'Catapult companion package', accept: { 'application/zip': ['.zip'] } }] });
      if (handle) onFiles([await handle.getFile()], handle);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) onError(error instanceof Error ? error.message : 'Unable to open package');
    }
  }

  /**
   *
   * @param event File input change event.
   */
  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files) onFiles(event.target.files);
    event.target.value = '';
  }

  return <><button type="button" onClick={openPicker} className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800">Open companion ZIP package</button><input ref={inputReference} type="file" accept=".zip,application/zip" className="hidden" onChange={handleInputChange} aria-label="Select companion ZIP package" /></>;
}
