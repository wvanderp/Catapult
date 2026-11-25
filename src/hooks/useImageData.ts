import { useEffect, useReducer, useMemo, useSyncExternalStore } from "react";
import {
  getImageObjectUrl,
  getImageAsFile,
  getImageBase64,
} from "../utils/imageBlobStorage";
import { useImageSetStore } from "../store/imageSetStore";
import { subscribe as subscribePackages, getSnapshot as getPackageSnapshot } from "../utils/companion";

interface UseImageDataResult {
  /**
  Object URL for displaying the image - automatically cleaned up when unmounted
   */
  imageUrl: string | undefined;
  /**
  Whether the image is currently loading
   */
  isLoading: boolean;
  /**
  Error message if loading failed
   */
  error: string | undefined;
}

type ImageDataState = {
  imageUrl: string | undefined;
  isLoading: boolean;
  error: string | undefined;
  imageId: string | undefined;
};

type ImageDataAction =
  | { type: "LOAD_START"; imageId: string }
  | { type: "LOAD_SUCCESS"; imageUrl: string; imageId: string }
  | { type: "LOAD_ERROR"; error: string; imageId: string }
  | { type: "RESET" };

/**
 * Reducer function that manages image data state transitions.
 * Handles loading start, success, error, and reset actions.
 *
 * @param state - Current image data state
 * @param action - Action to perform on the state
 * @returns Updated image data state
 */
function imageDataReducer(
  state: ImageDataState,
  action: ImageDataAction,
): ImageDataState {
  switch (action.type) {
    case "LOAD_START": {
      return {
        ...state,
        isLoading: true,
        error: undefined,
        imageId: action.imageId,
      };
    }
    case "LOAD_SUCCESS": {
      // Only update if this is still the current imageId being loaded
      if (state.imageId !== action.imageId) return state;
      return {
        imageUrl: action.imageUrl,
        isLoading: false,
        error: undefined,
        imageId: action.imageId,
      };
    }
    case "LOAD_ERROR": {
      // Only update if this is still the current imageId being loaded
      if (state.imageId !== action.imageId) return state;
      return {
        imageUrl: undefined,
        isLoading: false,
        error: action.error,
        imageId: action.imageId,
      };
    }
    case "RESET": {
      return {
        imageUrl: undefined,
        isLoading: false,
        error: undefined,
        imageId: undefined,
      };
    }
    default: {
      return state;
    }
  }
}

/**
 * Hook to load image data from IndexedDB for display
 * Creates an object URL for efficient rendering and cleans it up on unmount
 *
 * @param imageId The unique identifier for the image
 * @param size Preview size to load.
 * @param enabled Whether loading is enabled.
 * @returns Object containing image URL, loading state, and error state
 */
export function useImageUrl(imageId: string | undefined, size: "thumbnail" | "working" = "thumbnail", enabled = true): UseImageDataResult {
  const companion = useImageSetStore((store) => imageId ? store.imageSet.images[imageId]?.companion : undefined);
  const packageSnapshot = useSyncExternalStore(subscribePackages, getPackageSnapshot, getPackageSnapshot);
  const packageAvailability = companion ? packageSnapshot.states[companion.packageId] : "available";
  const initialState = useMemo(
    (): ImageDataState => ({
      imageUrl: undefined,
      isLoading: Boolean(imageId),
      error: undefined,
      imageId,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // Only compute initial state once
  );

  const [state, dispatch] = useReducer(imageDataReducer, initialState);

  useEffect(() => {
    if (!imageId || !enabled) {
      dispatch({ type: "RESET" });
      return;
    }

    let objectUrl: string | undefined;
    let active = true;
    const controller = new AbortController();
    dispatch({ type: "LOAD_START", imageId });

    if (companion && packageAvailability !== "available") {
      dispatch({ type: "LOAD_ERROR", error: "Package is unavailable. Select the package again.", imageId });
      return () => { active = false; controller.abort(); };
    }

    getImageObjectUrl(imageId, companion, size, controller.signal)
      .then((url) => {
        if (!active) { if (url) URL.revokeObjectURL(url); return; }
        objectUrl = url;
        if (url) dispatch({ type: "LOAD_SUCCESS", imageUrl: url, imageId });
        else dispatch({ type: "LOAD_ERROR", error: "Image data is unavailable", imageId });
      })
      .catch((error_: unknown) => {
        if (!active || controller.signal.aborted) return;
        dispatch({
          type: "LOAD_ERROR",
          error:
            error_ instanceof Error ? error_.message : "Failed to load image",
          imageId,
        });
      });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imageId, companion, size, enabled, packageAvailability]);

  return {
    imageUrl: state.imageUrl,
    isLoading: state.isLoading,
    error: state.error,
  };
}

interface UseImageFileResult {
  /**
  Get the image as a File object for upload
   */
  getFile: () => Promise<File | undefined>;
  /**
  Get the base64 string (without data URL prefix)
   */
  getBase64: () => Promise<string | undefined>;
}

/**
 * Hook to get image data for uploads - provides methods to get File or base64
 *
 * @param imageId The unique identifier for the image
 * @param filename The filename to use when creating a File
 * @returns Object with methods to get the image as a File or base64 string
 */
export function useImageFile(
  imageId: string | undefined,
  filename: string,
): UseImageFileResult {
  const companion = useImageSetStore((store) => imageId ? store.imageSet.images[imageId]?.companion : undefined);
  return {
    getFile: async () => {
      if (!imageId) return;
      return getImageAsFile(imageId, filename, companion);
    },
    getBase64: async () => {
      if (!imageId) return;
      if (companion) {
        const file = await getImageAsFile(imageId, filename, companion);
        if (!file) return;
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener('load', () => resolve(String(reader.result)));
          reader.addEventListener('error', () => reject(reader.error));
          reader.readAsDataURL(file);
        });
        return dataUrl.split(",", 2)[1];
      }
      return getImageBase64(imageId);
    },
  };
}

interface ImageUrlCache {
  [imageId: string]: {
    url: string;
    refCount: number;
  };
}

// Global cache for object URLs to avoid recreating them
const imageUrlCache: ImageUrlCache = {};

/**
 * Get a cached object URL for an image - must call releaseImageUrl when done
 * This is useful for components that need the URL synchronously
 *
 * @param imageId - The unique identifier for the image
 * @param companion Optional package source.
 * @returns Promise resolving to the object URL, or undefined if not found
 */
export async function getCachedImageUrl(
  imageId: string,
  companion?: import("../utils/companion").ImportedPhoto,
): Promise<string | undefined> {
  if (imageUrlCache[imageId]) {
    imageUrlCache[imageId].refCount++;
    return imageUrlCache[imageId].url;
  }

  const url = await getImageObjectUrl(imageId, companion);
  if (url) {
    imageUrlCache[imageId] = { url, refCount: 1 };
  }
  return url;
}

/**
 * Release a cached object URL - call when component unmounts or no longer needs the image
 *
 * @param imageId - The unique identifier for the image to release
 */
export function releaseImageUrl(imageId: string): void {
  const cached = imageUrlCache[imageId];
  if (!cached) return;

  cached.refCount--;
  if (!(cached.refCount <= 0)) {
    return;
  }

  URL.revokeObjectURL(cached.url);
  delete imageUrlCache[imageId];
}

/**
 * Clear all cached image URLs - useful when clearing all images
 */
export function clearImageUrlCache(): void {
  for (const imageId of Object.keys(imageUrlCache)) {
    URL.revokeObjectURL(imageUrlCache[imageId].url);
    delete imageUrlCache[imageId];
  }
}
