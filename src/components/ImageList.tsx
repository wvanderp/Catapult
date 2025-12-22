import { useImageSetStore } from '../store/imageSetStore';
import { ImageItem } from './ImageItem';

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
