import { normalizeMediaWikiFilename } from '../../mediawikiUtils';
import { checkFileNamesAvailable } from '../../wikimediaApi';
import type { AsyncLintRule, LintIssue, RenderedText } from '../types';

/**
 * Finds collisions using the same filename normalization as uploading.
 *
 * @param images - Images with generated upload titles.
 * @returns An error for every image involved in a collision.
 */
export function checkUniqueFilenames(images: RenderedText[]): LintIssue[] {
  const groups = Map.groupBy(
    images.filter((image) => image.title !== undefined),
    (image) => normalizeMediaWikiFilename(image.title!),
  );
  return [...groups].flatMap(([title, group]) => group.length > 1
    ? group.map(({ id }) => ({
      imageId: id,
      severity: 'error' as const,
      code: 'duplicate-filename',
      message: `The upload name "${title}" is used by ${group.length} images in this batch. Give each image a unique name.`,
    }))
    : []);
}

/**
 * Checks generated names on Commons, reporting uncertainty on API failures.
 *
 * @param images - Images with generated upload titles.
 * @returns Per-image availability errors or verification warnings.
 */
export const checkAvailableFilenames: AsyncLintRule = async (images) => {
  const namedImages = images.filter((image) => image.title !== undefined);
  if (namedImages.length === 0) return [];
  let availability: Record<string, boolean> = {};
  try {
    availability = await checkFileNamesAvailable(namedImages.map((image) => image.title!));
  } catch {
    // Missing results remain unknown, never implicitly available.
  }
  return namedImages.flatMap(({ id, title }) => {
    const available = availability[title!];
    if (available === true) return [];
    return [{
      imageId: id,
      severity: available === false ? 'error' as const : 'warning' as const,
      code: available === false ? 'filename-unavailable' : 'filename-check-failed',
      message: available === false
        ? `The upload name "${title}" is already taken on Commons or is invalid. Choose another name.`
        : `Could not verify whether "${title}" is available on Commons. Try checking again.`,
    }];
  });
};
