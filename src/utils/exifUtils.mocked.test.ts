/**
 * Tests for extractExifData that require mocking the exifr library.
 * Split into a separate file to avoid interfering with the real-network tests
 * in exifUtils.test.ts.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('exifr', () => ({
  default: { parse: vi.fn() },
}));

import exifr from 'exifr';
import { extractExifData } from './exifUtils';

describe('extractExifData (mocked exifr)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return empty object when exifr.parse returns null', async () => {
    // Force null return to exercise the falsy-result branch (lines 39-40)
    vi.mocked(exifr.parse).mockResolvedValueOnce(
      null as unknown as Awaited<ReturnType<typeof exifr.parse>>,
    );
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    const result = await extractExifData(file);

    expect(result).toEqual({});
  });

  it('should return empty object when exifr.parse returns a non-object value', async () => {
    // Returning a primitive exercises the typeof-object guard
    vi.mocked(exifr.parse).mockResolvedValueOnce(
      'not-an-object' as unknown as Awaited<ReturnType<typeof exifr.parse>>,
    );
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    const result = await extractExifData(file);

    expect(result).toEqual({});
  });

  it('should return empty object when exifr.parse throws an error', async () => {
    // Rejection exercises the catch block (lines 42-43)
    vi.mocked(exifr.parse).mockRejectedValueOnce(new Error('Corrupt EXIF'));
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    const result = await extractExifData(file);

    expect(result).toEqual({});
  });
});
