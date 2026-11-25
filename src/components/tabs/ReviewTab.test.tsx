// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImageSetStore } from '../../store/imageSetStore';
import { ReviewTab } from './ReviewTab';

const mocks = vi.hoisted(() => ({ getImageAsFile: vi.fn(), uploadFile: vi.fn() }));
vi.mock('../../utils/imageBlobStorage', async (importOriginal) => ({ ...await importOriginal<typeof import('../../utils/imageBlobStorage')>(), getImageAsFile: mocks.getImageAsFile }));
vi.mock('../../hooks/useWikimediaCommons', () => ({ useWikimediaCommons: () => ({ uploadFile: mocks.uploadFile, isAuthenticated: true }) }));
vi.mock('../../hooks/useLintResults', () => ({ useLintResults: () => ({ issues: [], isChecking: false }) }));
vi.mock('../../hooks/useImageData', () => ({ useImageUrl: () => ({ imageUrl: undefined, isLoading: false, error: 'Package is unavailable. Select the package again.' }) }));
vi.mock('../../hooks/useInViewport', () => ({ useInViewport: () => [vi.fn(), true] }));
vi.mock('@tanstack/react-router', () => ({ Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <a {...props}>{children}</a>, useNavigate: () => vi.fn() }));

/**
 * Seed three reviewed companion images for an upload batch.
 */
function setImages(): void {
  const images = Object.fromEntries(['missing', 'mismatch', 'good'].map((id) => [id, {
    id, name: `${id}.jpg`, mimeType: 'image/jpeg', keys: {}, reviewed: true,
    companion: { packageId: 'package', photoId: id, name: `${id}.jpg`, mimeType: 'image/jpeg', sha256: id, size: 1 },
  }]));
  useImageSetStore.setState((state) => ({ imageSet: { ...state.imageSet, images, imageOrder: ['missing', 'mismatch', 'good'], titleTemplate: 'Photo' } }));
}

afterEach(async () => {
  cleanup();
  mocks.getImageAsFile.mockReset();
  mocks.uploadFile.mockReset();
  await useImageSetStore.getState().clearAllImages();
});

describe('ReviewTab uploads', () => {
  it('records missing package and hash errors per image and continues the batch', async () => {
    setImages();
    const goodFile = new File(['good'], 'good.jpg', { type: 'image/jpeg' });
    mocks.getImageAsFile.mockRejectedValueOnce(new Error('Package is unavailable. Select the package again.'))
      .mockRejectedValueOnce(new Error('Original mismatch.jpg failed SHA-256 verification'))
      .mockResolvedValueOnce(goodFile);
    mocks.uploadFile.mockResolvedValue({ success: true, filename: 'good.jpg' });
    render(<ReviewTab />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Upload to Commons/ })); });

    await waitFor(() => expect(useImageSetStore.getState().imageSet.images.good?.uploadStatus).toBe('success'));
    expect(useImageSetStore.getState().imageSet.images.missing?.uploadError).toMatch(/Package is unavailable/);
    expect(useImageSetStore.getState().imageSet.images.mismatch?.uploadError).toMatch(/SHA-256 verification/);
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(mocks.getImageAsFile).toHaveBeenCalledTimes(3);
  });

  it('keeps warning uploads available through Upload Anyway', async () => {
    setImages();
    const file = new File(['good'], 'good.jpg', { type: 'image/jpeg' });
    mocks.getImageAsFile.mockResolvedValue(file);
    mocks.uploadFile.mockResolvedValueOnce({ success: false, warnings: [{ message: 'Duplicate exists' }], filekey: 'key' })
      .mockResolvedValue({ success: true, filename: 'good.jpg' });
    render(<ReviewTab />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Upload to Commons/ })); });
    await waitFor(() => expect(useImageSetStore.getState().imageSet.images.missing?.uploadStatus).toBe('warning'));
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Upload Anyway' })[0]!); });
    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(4));
  });
});
