import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAvailableFilenames, checkUniqueFilenames } from './checkFilenames';
import { checkFileNamesAvailable } from '../../wikimediaApi';

vi.mock('../../wikimediaApi');
const images = [
  { id: 'a', title: 'my photo.jpg', wikitext: '' },
  { id: 'b', title: 'My_photo.jpg', wikitext: '' },
  { id: 'c', title: 'Other.jpg', wikitext: '' },
];

describe('filename checks', () => {
  beforeEach(() => vi.resetAllMocks());

  it('flags every normalized collision while leaving distinct names alone', () => {
    expect(checkUniqueFilenames(images).map((issue) => issue.imageId)).toEqual(['a', 'b']);
    expect(checkUniqueFilenames([
      { id: 'a', title: 'Photo:1.jpg', wikitext: '' },
      { id: 'b', title: 'Photo-1.jpg', wikitext: '' },
    ])).toHaveLength(2);
  });

  it('keeps case differences after the first character distinct', () => {
    expect(checkUniqueFilenames([
      { id: 'a', title: 'Photo.jpg', wikitext: '' },
      { id: 'b', title: 'PHOTO.jpg', wikitext: '' },
    ])).toEqual([]);
  });

  it('attributes unavailable and unknown names to the right images', async () => {
    vi.mocked(checkFileNamesAvailable).mockResolvedValue({
      'my photo.jpg': false, 'My_photo.jpg': true,
    });
    expect(await checkAvailableFilenames(images)).toMatchObject([
      { imageId: 'a', code: 'filename-unavailable', severity: 'error' },
      { imageId: 'c', code: 'filename-check-failed', severity: 'warning' },
    ]);
  });

  it('reports failed verification instead of giving an all-clear', async () => {
    vi.mocked(checkFileNamesAvailable).mockRejectedValue(new Error('Offline'));
    const issues = await checkAvailableFilenames(images);
    expect(issues).toHaveLength(3);
    expect(issues.every((issue) => issue.code === 'filename-check-failed')).toBe(true);
    expect(checkUniqueFilenames(images)).toHaveLength(2);
  });

  it('does not request Commons for an empty batch', async () => {
    expect(await checkAvailableFilenames([])).toEqual([]);
    expect(checkFileNamesAvailable).not.toHaveBeenCalled();
  });
});
