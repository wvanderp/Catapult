// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageCarousel } from './ImageCarousel';

const mocks = vi.hoisted(() => ({ useImageUrl: vi.fn() }));
vi.mock('../hooks/useImageData', () => ({ useImageUrl: mocks.useImageUrl }));
vi.mock('../hooks/useInViewport', () => ({ useInViewport: () => [vi.fn(), false] }));

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });

describe('ImageCarousel thumbnails', () => {
    it('does not load a thumbnail until its item enters the viewport', () => {
        mocks.useImageUrl.mockReturnValue({ imageUrl: undefined, isLoading: false, error: undefined });
        render(<ImageCarousel images={[{ id: 'one', name: 'one.jpg', mimeType: 'image/jpeg' }]} currentIndex={0} onSelectImage={vi.fn()} />);
        expect(mocks.useImageUrl).toHaveBeenCalledWith('one', 'thumbnail', false);
        expect(screen.getByText('Preview loads when visible')).toBeTruthy();
    });

    it('shows the loading reason when thumbnail data is unavailable', () => {
        mocks.useImageUrl.mockReturnValue({ imageUrl: undefined, isLoading: false, error: 'Package is unavailable. Select the package again.' });
        render(<ImageCarousel images={[{ id: 'one', name: 'one.jpg', mimeType: 'image/jpeg' }]} currentIndex={0} onSelectImage={vi.fn()} />);
        expect(screen.getByText('Preview loads when visible')).toBeTruthy();
    });
});
