import type { Image } from "../store/imageSetStore";
import { formatExifDateOnly, formatExifDateTime } from "./exifUtils";

/**
 * Create utility context object for template substitution
 * 
 * @param image - The image to create utility context for
 * @param index - The index of the image in the set (0-based input)
 * @returns Utility context object with extension, 1-based index, date, and dateTime
 */
export function createUtilityContext(image: Image, index: number) {
  const dotIndex = image.name.lastIndexOf(".");
  const extension = dotIndex === -1 ? "" : image.name.slice(dotIndex + 1).toLowerCase();

  const dateValue =
    image.exifData?.DateTimeOriginal ?? image.exifData?.CreateDate;
  const date = formatExifDateOnly(dateValue);
  const dateTime = formatExifDateTime(dateValue);

  const incrementedIndex = index + 1;

  return {
    extension,
    index: incrementedIndex,
    date,
    dateTime,
  };
}
