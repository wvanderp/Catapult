/**
 * Tests for the Wikimedia Commons API utilities in wikimediaApi.ts.
 *
 * All tests stub the global `fetch` to avoid real network calls.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkCategoriesExist } from './wikimediaApi';

/**
 * Build a minimal successful fetch response whose `.json()` resolves to the
 * provided value.
 *
 * @param body - The value that `response.json()` will resolve to
 * @returns A partial Response-like object accepted by the `fetch` stub
 */
function okResponse(body: unknown): Partial<Response> {
  return {
    ok: true,
    json: vi.fn<() => Promise<unknown>>().mockResolvedValueOnce(body),
  };
}

describe('checkCategoriesExist', () => {
  const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  // ── Early exit ───────────────────────────────────────────────────────────────

  it('returns an empty object immediately when called with an empty array', async () => {
    const result = await checkCategoriesExist([]);

    expect(result).toEqual({});
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Existing categories ──────────────────────────────────────────────────────

  it('returns true for a category that exists (no "missing" property in page)', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        query: {
          pages: { '1': { title: 'Category:Birds of Europe' } },
        },
      }) as Response,
    );

    const result = await checkCategoriesExist(['Birds of Europe']);

    expect(result).toEqual({ 'Birds of Europe': true });
  });

  // ── Non-existing categories ──────────────────────────────────────────────────

  it('returns false for a category that does not exist ("missing" property present)', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        query: {
          pages: { '-1': { title: 'Category:NonExistent', missing: true } },
        },
      }) as Response,
    );

    const result = await checkCategoriesExist(['NonExistent']);

    expect(result).toEqual({ NonExistent: false });
  });

  // ── Mixed results ────────────────────────────────────────────────────────────

  it('handles a mix of existing and non-existing categories in one request', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        query: {
          pages: {
            '1': { title: 'Category:Exists' },
            '-1': { title: 'Category:Missing', missing: true },
          },
        },
      }) as Response,
    );

    const result = await checkCategoriesExist(['Exists', 'Missing']);

    expect(result).toEqual({ Exists: true, Missing: false });
  });

  // ── Categories absent from response ─────────────────────────────────────────

  it('returns false for categories absent from the API response pages', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        query: { pages: {} },
      }) as Response,
    );

    const result = await checkCategoriesExist(['SomeCat']);

    expect(result).toEqual({ SomeCat: false });
  });

  it('returns false for a requested category not present in partial response', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        query: {
          pages: { '1': { title: 'Category:OnlyThis' } },
        },
      }) as Response,
    );

    const result = await checkCategoriesExist(['OnlyThis', 'AlsoRequested']);

    expect(result).toEqual({ OnlyThis: true, AlsoRequested: false });
  });

  // ── Malformed / empty responses ──────────────────────────────────────────────

  it('returns false for all categories when response has no query object', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}) as Response);

    const result = await checkCategoriesExist(['SomeCat']);

    expect(result).toEqual({ SomeCat: false });
  });

  // ── HTTP errors ──────────────────────────────────────────────────────────────

  it('throws an error when the HTTP response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    await expect(checkCategoriesExist(['Birds'])).rejects.toThrow(
      'Category check failed: HTTP 503',
    );
  });

  // ── URL construction ─────────────────────────────────────────────────────────

  it('constructs the request URL with Category: prefix for each category', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        query: { pages: { '1': { title: 'Category:TestCat' } } },
      }) as Response,
    );

    await checkCategoriesExist(['TestCat']);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    // URLSearchParams encodes ":" as "%3A"
    expect(calledUrl).toContain('Category%3ATestCat');
    expect(calledUrl).toContain('action=query');
    expect(calledUrl).toContain('format=json');
  });
});
