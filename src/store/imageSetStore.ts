import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { indexedDBStorage } from '../utils/indexedDBStorage';

interface Image {
    /*
    * base64 encoded image data, without any prefixes like data:image/png;base64, etc.
    */
    file: string;
    name: string;
    mimeType: string;
    /*
     * The metadata keys for the image for template substitution
    */
    keys: Record<string, string>;
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
     * The images in the set, keyed by a unique ID
    */
    images: Record<string, Image>;
}

interface StateStore {
    imageSet: ImageSet;
    setTitleTemplate: (titleTemplate: string) => void;
    setTemplate: (template: string) => void;
    addImage: (image: Image) => void;
    updateImageKeys: (imageId: string, keys: Record<string, string>) => void;
}

export const useImageSetStore = create<StateStore>()(
    persist(
        (set) => ({
            imageSet: {
                template: '',
                titleTemplate: '',
                images: {},
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
            addImage: (image: Image) =>
                set((state) => {
                    const id = crypto.randomUUID();
                    return {
                        imageSet: {
                            ...state.imageSet,
                            images: {
                                ...state.imageSet.images,
                                [id]: image,
                            },
                        },
                    };
                }),
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
        }),
        {
            name: 'image-set-storage',
            storage: createJSONStorage(() => indexedDBStorage)
        }
    )
);
