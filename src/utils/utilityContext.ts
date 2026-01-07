import type { Image } from "../store/imageSetStore";
import { formatExifDate } from "./exifUtils";

/**
 * Create utility context object for template substitution
 *
 * @param image - The image to create utility context for
 * @param index - The index of the image in the set (0-based)
 * @returns Utility context object with extension, index, and formatted date
 */
export function createUtilityContext(image: Image, index: number) {
  const extension = image.name.includes(".")
    ? image.name.split(".").pop()?.toLowerCase() ?? ""
    : "";

  const date = formatExifDate(
    image.exifData?.DateTimeOriginal ?? image.exifData?.CreateDate
  );

  return {
    extension,
    index,
    date,
  };
}
