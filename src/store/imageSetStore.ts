import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { indexedDBStorage } from "../utils/indexedDbStorage";
import { INITIAL_TEMPLATE, INITIAL_TITLE_TEMPLATE } from "./settingsStore";
import {
  storeImageFromBase64,
  removeImageBlob,
  removeImageBlobs,
  getImageBlob,
} from "../utils/imageBlobStorage";
import { forgetPackageWhenUnused, hashImageBlob, isLargeOriginal, type ImportedPhoto } from "../utils/companion";

/**
 * Image metadata stored in the application state.
 * The actual image data (blob) is stored separately in IndexedDB.
 */
export interface Image {
  /**
   * Unique identifier for the image, used to reference the blob in IndexedDB
   */
  id: string;
  name: string;
  mimeType: string;
  /**
   * The metadata keys for the image for template substitution
   */
  keys: Record<string, string>;
  /**
   * Whether the image has been reviewed and marked as ready for upload
   */
  reviewed: boolean;
  /**
   * Extracted EXIF data from the image, keyed by EXIF field name
   */
  exifData?: Record<string, unknown>;
  exifStatus?: "complete" | "failed";
  /**
   * Whether the image has been successfully uploaded to Wikimedia Commons
   */
  uploaded?: boolean;
  /**
   * The URL to the uploaded file on Wikimedia Commons
   */
  uploadUrl?: string;
  /**
   * Current upload status: pending, uploading, success, error, warning
   */
  uploadStatus?: "pending" | "uploading" | "success" | "error" | "warning";
  /**
   * Error message if upload failed
   */
  uploadError?: string;
  /**
  Browser package source; package bytes remain in the selected ZIP, never IndexedDB.
   */
  companion?: ImportedPhoto;
  /**
  True when the original exceeds the documented 100 MiB upload warning threshold.
   */
  largeOriginal?: boolean;
  /**
  SHA-256 hash cached after the original bytes are read.
   */
  sha256?: string;
}

/**
 * Input for adding an image - includes the base64 file data
 */
export interface ImageInput {
  /**
   * base64 encoded image data, without any prefixes like data:image/png;base64, etc.
   */
  file: string;
  name: string;
  mimeType: string;
  keys: Record<string, string>;
  exifData?: Record<string, unknown>;
}

/**
 * Return the decoded byte length represented by a base64 string.
 
 * @param base64 Encoded bytes.
 * @returns The number of decoded bytes.
 */
export function getBase64ByteLength(base64: string): number {
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.floor(base64.length * 3 / 4) - padding;
}

interface ImageSet {
  /*
   * The title template for the image set with triple curly brace variables
   */
  titleTemplate: string;

  /*
   * The template string for the images with triple curly brace variables
   */
  template: string;
  /*
   * Global variables that apply to all images
   */
  globalVariables: Record<string, string>;
  /*
   * The images in the set, keyed by a unique ID
   */
  images: Record<string, Image>;
  /*
   * The order of image IDs for display purposes
   */
  imageOrder: string[];
}

interface StateStore {
  imageSet: ImageSet;
  setTitleTemplate: (titleTemplate: string) => void;
  setTemplate: (template: string) => void;
  setGlobalVariable: (key: string, value: string) => void;
  addImage: (image: ImageInput) => Promise<string>;
  addCompanionImage: (photo: ImportedPhoto) => Promise<string>;
  addCompanionImages: (photos: ImportedPhoto[]) => Promise<string[]>;
  removeImage: (imageId: string) => Promise<void>;
  reorderImages: (fromIndex: number, toIndex: number) => void;
  setImageOrder: (order: string[]) => void;
  updateImageKeys: (imageId: string, keys: Record<string, string>) => void;
  setImageReviewed: (imageId: string, reviewed: boolean) => void;
  setImageExifData: (imageId: string, exifData: Record<string, unknown>) => void;
  setImagesExifData: (updates: Record<string, { exifData?: Record<string, unknown>; exifStatus: "complete" | "failed" }>) => void;
  setImageExifStatus: (imageId: string, status: "complete" | "failed") => void;
  setImageSha256: (imageId: string, sha256: string) => void;
  setImageLargeOriginal: (imageId: string, largeOriginal: boolean) => void;
  setImageUploaded: (
    imageId: string,
    uploaded: boolean,
    uploadUrl?: string,
  ) => void;
  setImageUploadStatus: (
    imageId: string,
    status: "pending" | "uploading" | "success" | "error" | "warning",
    error?: string,
  ) => void;
  clearAllImages: () => Promise<void>;
}

export const useImageSetStore = create<StateStore>()(
  persist(
    (set): StateStore => ({
      imageSet: {
        template: INITIAL_TEMPLATE,
        titleTemplate: INITIAL_TITLE_TEMPLATE,
        globalVariables: {},
        images: {},
        imageOrder: [],
      },
      setTitleTemplate: (titleTemplate: string) =>
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            titleTemplate,
          },
        })),
      setTemplate: (template: string) =>
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            template,
          },
        })),
      setGlobalVariable: (key: string, value: string) =>
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            globalVariables: {
              ...state.imageSet.globalVariables,
              [key]: value,
            },
          },
        })),
      addImage: async (image: ImageInput) => {
        const id = crypto.randomUUID();
        // Store the blob data separately in IndexedDB
        await storeImageFromBase64(id, image.file, image.mimeType);
        const stored = await getImageBlob(id);
        const sha256 = stored ? await hashImageBlob(stored.blob) : undefined;

        // Store only metadata in the state
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            images: {
              ...state.imageSet.images,
              [id]: {
                id,
                name: image.name,
                mimeType: image.mimeType,
                keys: image.keys,
                exifData: image.exifData,
                exifStatus: image.exifData ? "complete" : undefined,
                reviewed: false,
                largeOriginal: isLargeOriginal(getBase64ByteLength(image.file)),
                sha256,
              },
            },
            imageOrder: [...state.imageSet.imageOrder, id],
          },
        }));
        return id;
      },
      addCompanionImage: async (photo: ImportedPhoto): Promise<string> => {
        const id = crypto.randomUUID();
        set((state) => ({ imageSet: { ...state.imageSet, images: { ...state.imageSet.images, [id]: {
          id, name: photo.name, mimeType: photo.mimeType, keys: {}, reviewed: false,
          companion: photo, largeOriginal: isLargeOriginal(photo.size), sha256: photo.sha256,
        } }, imageOrder: [...state.imageSet.imageOrder, id] } }));
        return id;
      },
      addCompanionImages: async (photos: ImportedPhoto[]) => {
        performance.mark("catapult:store-images:start");
        const ids = photos.map(() => crypto.randomUUID());
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            images: {
              ...state.imageSet.images,
              ...Object.fromEntries(photos.map((photo, index) => [ids[index], {
                id: ids[index]!, name: photo.name, mimeType: photo.mimeType, keys: {}, reviewed: false,
                companion: photo, largeOriginal: isLargeOriginal(photo.size), sha256: photo.sha256,
              } satisfies Image])),
            },
            imageOrder: [...state.imageSet.imageOrder, ...ids],
          },
        }));
        performance.mark("catapult:store-images:end");
        return ids;
      },
      removeImage: async (imageId: string) => {
        let removed: Image | undefined;
        let remainingPackages: string[] = [];
        set((state) => {
          removed = state.imageSet.images[imageId];
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [imageId]: _removed, ...rest } = state.imageSet.images;
          remainingPackages = Object.values(rest).flatMap((image) => image.companion ? [image.companion.packageId] : []);
          return {
            imageSet: {
              ...state.imageSet,
              images: rest,
              imageOrder: state.imageSet.imageOrder.filter(
                (id) => id !== imageId,
              ),
            },
          };
        });
        if (!removed?.companion) await removeImageBlob(imageId);
        if (removed?.companion) await forgetPackageWhenUnused(removed.companion.packageId, remainingPackages);
      },
      reorderImages: (fromIndex: number, toIndex: number) =>
        set((state) => {
          const newOrder = [...state.imageSet.imageOrder];
          const [movedId] = newOrder.splice(fromIndex, 1);
          newOrder.splice(toIndex, 0, movedId);
          return {
            imageSet: {
              ...state.imageSet,
              imageOrder: newOrder,
            },
          };
        }),
      setImageOrder: (order: string[]) =>
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            imageOrder: order,
          },
        })),
      updateImageKeys: (imageId: string, keys: Record<string, string>) =>
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            images: {
              ...state.imageSet.images,
              [imageId]: {
                ...state.imageSet.images[imageId],
                keys,
              },
            },
          },
        })),
      setImageReviewed: (imageId: string, reviewed: boolean) =>
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            images: {
              ...state.imageSet.images,
              [imageId]: {
                ...state.imageSet.images[imageId],
                reviewed,
              },
            },
          },
        })),
      setImageExifData: (imageId: string, exifData: Record<string, unknown>) =>
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            images: { ...state.imageSet.images, [imageId]: { ...state.imageSet.images[imageId], exifData } },
          },
        })),
      setImageExifStatus: (imageId, exifStatus) => set((state) => ({ imageSet: { ...state.imageSet, images: { ...state.imageSet.images, [imageId]: { ...state.imageSet.images[imageId], exifStatus } } } })),
      setImagesExifData: (updates) => set((state) => {
        const images = { ...state.imageSet.images };
        for (const [imageId, update] of Object.entries(updates)) {
          const image = images[imageId];
          if (image) images[imageId] = { ...image, ...(update.exifData && { exifData: update.exifData }), exifStatus: update.exifStatus };
        }
        return { imageSet: { ...state.imageSet, images } };
      }),
      setImageSha256: (imageId, sha256) => set((state) => ({ imageSet: { ...state.imageSet, images: { ...state.imageSet.images, [imageId]: { ...state.imageSet.images[imageId], sha256 } } } })),
      setImageLargeOriginal: (imageId, largeOriginal) => set((state) => ({ imageSet: { ...state.imageSet, images: { ...state.imageSet.images, [imageId]: { ...state.imageSet.images[imageId], largeOriginal } } } })),
      setImageUploaded: (
        imageId: string,
        uploaded: boolean,
        uploadUrl?: string,
      ) =>
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            images: {
              ...state.imageSet.images,
              [imageId]: {
                ...state.imageSet.images[imageId],
                uploaded,
                uploadUrl,
                uploadStatus: uploaded ? "success" : undefined,
              },
            },
          },
        })),
      setImageUploadStatus: (
        imageId: string,
        status: "pending" | "uploading" | "success" | "error" | "warning",
        error?: string,
      ) =>
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            images: {
              ...state.imageSet.images,
              [imageId]: {
                ...state.imageSet.images[imageId],
                uploadStatus: status,
                uploadError: error,
              },
            },
          },
        })),
      clearAllImages: async () => {
        // Get all image IDs before clearing state
        const currentImages = useImageSetStore.getState().imageSet.images;
        const imageIds = Object.values(currentImages).filter((image) => !image.companion).map((image) => image.id);
        const packageIds = [...new Set(Object.values(currentImages).flatMap((image) => image.companion ? [image.companion.packageId] : []))];

        // Clear blobs from IndexedDB
        await removeImageBlobs(imageIds);
        await Promise.all(packageIds.map((id) => forgetPackageWhenUnused(id, [])));

        // Clear state
        set((state) => ({
          imageSet: {
            ...state.imageSet,
            images: {},
            imageOrder: [],
          },
        }));
      },
    }),
    {
      name: "image-set-storage",
      storage: createJSONStorage(() => indexedDBStorage),
    },
  ),
);

/**
Backfill exact original byte sizes for loose images already in IndexedDB.
 */
export async function backfillLargeOriginalFlags(): Promise<void> {
  const images = Object.values(useImageSetStore.getState().imageSet.images);
  await Promise.all(images.filter((image) => !image.companion).map(async (image) => {
    const stored = await getImageBlob(image.id);
    if (stored && image.largeOriginal !== isLargeOriginal(stored.blob.size)) useImageSetStore.getState().setImageLargeOriginal(image.id, isLargeOriginal(stored.blob.size));
  }));
}
