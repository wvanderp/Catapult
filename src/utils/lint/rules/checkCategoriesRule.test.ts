import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkCategoriesRule } from './checkCategoriesRule';
import * as wikimediaApi from '../../wikimediaApi';

vi.mock('../../wikimediaApi');

const mockCheckCategoriesExist = vi.mocked(wikimediaApi.checkCategoriesExist);

/**
 * Minimal RenderedText fixture builder.
 *
 * @param id - Image ID.
 * @param wikitext - Rendered wikitext for the image.
 * @returns A `RenderedText`-shaped object.
 */
function makeText(id: string, wikitext: string) {
  return { id, wikitext };
}

describe('checkCategoriesRule', () => {
  beforeEach(() => {
    mockCheckCategoriesExist.mockReset();
  });

  // ── No categories ───────────────────────────────────────────────────────────

  it('returns an empty array when there are no rendered texts', async () => {
    const result = await checkCategoriesRule([]);
    expect(result).toEqual([]);
    expect(mockCheckCategoriesExist).not.toHaveBeenCalled();
  });

  it('returns an empty array when no wikitext contains a category', async () => {
    const texts = [makeText('img-1', '{{Information|description={{en|1=A photo}}}}')];
    const result = await checkCategoriesRule(texts);
    expect(result).toEqual([]);
    expect(mockCheckCategoriesExist).not.toHaveBeenCalled();
  });

  // ── All categories exist ─────────────────────────────────────────────────────

  it('returns an empty array when all categories exist', async () => {
    mockCheckCategoriesExist.mockResolvedValue({ Birds: true, Nature: true });

    const texts = [
      makeText('img-1', '[[Category:Birds]]\n[[Category:Nature]]'),
    ];
    const result = await checkCategoriesRule(texts);
    expect(result).toEqual([]);
  });

  // ── Missing categories ───────────────────────────────────────────────────────

  it('returns an error issue for a missing category', async () => {
    mockCheckCategoriesExist.mockResolvedValue({ 'Missing Cat': false });

    const texts = [makeText('img-1', '[[Category:Missing Cat]]')];
    const result = await checkCategoriesRule(texts);

    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe('error');
    expect(result[0]?.code).toBe('category-not-found');
    expect(result[0]?.imageId).toBe('img-1');
    expect(result[0]?.message).toContain('Missing Cat');
  });

  it('returns an error for each image that references a missing category', async () => {
    mockCheckCategoriesExist.mockResolvedValue({ 'Ghost Cat': false });

    const texts = [
      makeText('img-1', '[[Category:Ghost Cat]]'),
      makeText('img-2', '[[Category:Ghost Cat]]'),
    ];
    const result = await checkCategoriesRule(texts);

    expect(result).toHaveLength(2);
    expect(result.map((issue) => issue.imageId)).toEqual(['img-1', 'img-2']);
  });

  it('returns issues only for missing categories, not existing ones', async () => {
    mockCheckCategoriesExist.mockResolvedValue({ Birds: true, 'Ghost Cat': false });

    const texts = [makeText('img-1', '[[Category:Birds]]\n[[Category:Ghost Cat]]')];
    const result = await checkCategoriesRule(texts);

    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('Ghost Cat');
  });

  // ── Batching ─────────────────────────────────────────────────────────────────

  it('makes exactly one API call regardless of how many images there are', async () => {
    mockCheckCategoriesExist.mockResolvedValue({ Birds: true, Nature: true, Mammals: true });

    const texts = [
      makeText('img-1', '[[Category:Birds]]\n[[Category:Nature]]'),
      makeText('img-2', '[[Category:Nature]]\n[[Category:Mammals]]'),
      makeText('img-3', '[[Category:Birds]]\n[[Category:Mammals]]'),
    ];
    await checkCategoriesRule(texts);

    expect(mockCheckCategoriesExist).toHaveBeenCalledTimes(1);
  });

  it('passes all unique categories (de-duplicated) to the API', async () => {
    mockCheckCategoriesExist.mockResolvedValue({ Birds: true, Nature: true });

    const texts = [
      makeText('img-1', '[[Category:Birds]]'),
      makeText('img-2', '[[Category:Birds]]\n[[Category:Nature]]'),
    ];
    await checkCategoriesRule(texts);

    const calledWith = mockCheckCategoriesExist.mock.calls[0]?.[0] ?? [];
    expect(calledWith).toHaveLength(2);
    expect(new Set(calledWith)).toEqual(new Set(['Birds', 'Nature']));
  });

  // ── API failure ───────────────────────────────────────────────────────────────

  it('returns an empty array when the API call throws', async () => {
    mockCheckCategoriesExist.mockRejectedValue(new Error('Network error'));

    const texts = [makeText('img-1', '[[Category:Birds]]')];
    const result = await checkCategoriesRule(texts);

    expect(result).toEqual([]);
  });

  it('does not throw when the API fails', async () => {
    mockCheckCategoriesExist.mockRejectedValue(new Error('HTTP 500'));

    await expect(
      checkCategoriesRule([makeText('img-1', '[[Category:X]]')]),
    ).resolves.not.toThrow();
  });

  // ── Safe default for unknown categories ────────────────────────────────────

  it('treats a category absent from the API response as existing (safe default)', async () => {
    // API returns an empty map — neither true nor false for 'UnknownCat'
    mockCheckCategoriesExist.mockResolvedValue({});

    const texts = [makeText('img-1', '[[Category:UnknownCat]]')];
    const result = await checkCategoriesRule(texts);

    // Should NOT raise a false-positive error
    expect(result).toEqual([]);
  });

  // ── Multiple images with mixed results ────────────────────────────────────

  it('correctly attributes issues to the right image', async () => {
    mockCheckCategoriesExist.mockResolvedValue({
      'Real Cat': true,
      'Fake Cat': false,
    });

    const texts = [
      makeText('img-A', '[[Category:Real Cat]]'),
      makeText('img-B', '[[Category:Fake Cat]]'),
    ];
    const result = await checkCategoriesRule(texts);

    expect(result).toHaveLength(1);
    expect(result[0]?.imageId).toBe('img-B');
  });
});
