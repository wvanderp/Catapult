import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkFileNamesAvailable } from './wikimediaApi';

describe('checkFileNamesAvailable', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps normalized names and distinguishes missing, occupied, and invalid pages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      query: {
        normalized: [{ from: 'File:My_photo.jpg', to: 'File:My photo.jpg' }],
        pages: {
          1: { title: 'File:My photo.jpg' },
          2: { title: 'File:Redirect.jpg', redirect: '' },
          '-1': { title: 'File:New.jpg', missing: '' },
          '-2': { title: 'File:Invalid.jpg', invalid: '' },
        },
      },
    }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await checkFileNamesAvailable([
      'my photo.jpg', 'My_photo.jpg', 'Redirect.jpg', 'New.jpg', 'Invalid.jpg', 'Unknown.jpg',
    ])).toEqual({
      'my photo.jpg': false, 'My_photo.jpg': false,
      'Redirect.jpg': false, 'New.jpg': true, 'Invalid.jpg': false,
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('titles')?.split('|')).toHaveLength(5);
    expect(url.searchParams.has('redirects')).toBe(false);
  });

  it('splits more than 50 distinct titles into bounded requests', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const titles = new URL(url).searchParams.get('titles')!.split('|');
      return { ok: true, json: async () => ({ query: {
        pages: Object.fromEntries(titles.map((title, index) => [index, { title, missing: '' }])),
      } }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const names = Array.from({ length: 101 }, (_, index) => `Photo${index}.jpg`);
    const result = await checkFileNamesAvailable(names);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(Object.values(result)).toEqual(names.map(() => true));
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('titles')!.split('|').length))
      .toEqual([50, 50, 1]);
  });

  it.each([
    { ok: false, status: 503 },
    { ok: true, json: async () => ({ error: { code: 'badvalue' } }) },
    { ok: true, json: async () => ({}) },
  ])('rejects unsuccessful API responses', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(checkFileNamesAvailable(['Photo.jpg'])).rejects.toThrow();
  });

  it('skips requests for no names', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await checkFileNamesAvailable([])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
