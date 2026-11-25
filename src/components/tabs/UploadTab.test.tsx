// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadTab } from './UploadTab';

const mocks = vi.hoisted(() => ({ importPackage: vi.fn() }));
vi.mock('../../hooks/useCompanionImport', () => ({ useCompanionImport: () => ({ importPackage: mocks.importPackage, error: '', prompt: null }) }));

afterEach(() => { cleanup(); mocks.importPackage.mockReset().mockResolvedValue(undefined); });

describe('UploadTab dropped package files', () => {
  it('requests handles synchronously and falls back to getAsFile when the file list is empty', async () => {
    const file = new File(['package'], 'photos.zip', { type: 'application/zip' });
    const { promise, resolve } = Promise.withResolvers<FileSystemHandle | null>();
    const order: string[] = [];
    const item = {
      kind: 'file',
      getAsFile: () => { order.push('file'); return file; },
      getAsFileSystemHandle: () => { order.push('handle'); return promise; },
    };
    const { container } = render(<UploadTab />);
    const dropzone = [...container.querySelectorAll('div')].find((element) => element.className.includes('border-dashed'))!;

    fireEvent.drop(dropzone, { dataTransfer: { items: [item], files: [] } });

    expect(order).toEqual(['handle', 'file']);
    expect(mocks.importPackage).not.toHaveBeenCalled();
    await act(async () => { resolve(null); await promise; });
    await waitFor(() => expect(mocks.importPackage).toHaveBeenCalledWith(file, undefined));
  });
});
