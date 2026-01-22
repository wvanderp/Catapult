import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { indexedDBStorage } from "../utils/indexedDbStorage";
import { INITIAL_TEMPLATE, INITIAL_TITLE_TEMPLATE } from "./settingsStore";
import {
  storeImageFromBase64,
  removeImageBlob,
  removeImageBlobs,
} from "../utils/imageBlobStorage";

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
  removeImage: (imageId: string) => Promise<void>;
  reorderImages: (fromIndex: number, toIndex: number) => void;
  setImageOrder: (order: string[]) => void;
  updateImageKeys: (imageId: string, keys: Record<string, string>) => void;
  setImageReviewed: (imageId: string, reviewed: boolean) => void;
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
    (set) => ({
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
                reviewed: false,
              },
            },
            imageOrder: [...state.imageSet.imageOrder, id],
          },
        }));
        return id;
      },
      removeImage: async (imageId: string) => {
        // Remove blob from IndexedDB
        await removeImageBlob(imageId);

        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [imageId]: _removed, ...rest } = state.imageSet.images;
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
        const imageIds = Object.keys(
          useImageSetStore.getState().imageSet.images,
        );

        // Clear blobs from IndexedDB
        await removeImageBlobs(imageIds);

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
