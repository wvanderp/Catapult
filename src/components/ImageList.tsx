import { useImageSetStore } from '../store/imageSetStore';
import { ImageItem } from './ImageItem';

/**
 * ImageList displays all uploaded images in a vertical list.
 * Each image is rendered using the ImageItem component.
 * Returns nothing if no images are uploaded.
 *
 * @returns The image list component or undefined
 */
export function ImageList() {
  const images = useImageSetStore((state) => state.imageSet.images);
  const imageIds = Object.keys(images);

  if (imageIds.length === 0) {
    return;
  }

  return (
    <section className="flex flex-col gap-6">
      {imageIds.map((id) => (
        <ImageItem key={id} id={id} />
      ))}
    </section>
  );
}
