import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { indexedDBStorage } from '../utils/indexedDBStorage';

export interface Image {
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
    /*
     * Whether the image has been reviewed and marked as ready for upload
    */
    reviewed: boolean;
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
}

export type TabId = 'upload' | 'variables' | 'fillout' | 'review';

interface StateStore {
    currentTab: TabId;
    setCurrentTab: (tab: TabId) => void;
    imageSet: ImageSet;
    setTitleTemplate: (titleTemplate: string) => void;
    setTemplate: (template: string) => void;
    setGlobalVariable: (key: string, value: string) => void;
    addImage: (image: Omit<Image, 'reviewed'>) => void;
    removeImage: (imageId: string) => void;
    updateImageKeys: (imageId: string, keys: Record<string, string>) => void;
    setImageReviewed: (imageId: string, reviewed: boolean) => void;
    clearAllImages: () => void;
}

export const useImageSetStore = create<StateStore>()(
    persist(
        (set) => ({
            currentTab: 'upload' as TabId,
            setCurrentTab: (tab: TabId) => set({ currentTab: tab }),
            imageSet: {
                template: `=={{int:filedesc}}==
{{Information
|description={{en|1={{{description}}}}}
|date={{{date}}}
|source={{own}}
|author=[[User:YourUsername|YourUsername]]
}}

=={{int:license-header}}==
{{self|cc-by-sa-4.0}}

[[Category:{{{category}}}]]`,
                titleTemplate: '{{{location}}} - {{{subject}}} ({{{date}}}).jpg',
                globalVariables: {},
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
            addImage: (image: Omit<Image, 'reviewed'>) =>
                set((state) => {
                    const id = crypto.randomUUID();
                    return {
                        imageSet: {
                            ...state.imageSet,
                            images: {
                                ...state.imageSet.images,
                                [id]: { ...image, reviewed: false },
                            },
                        },
                    };
                }),
            removeImage: (imageId: string) =>
                set((state) => {
                    const { [imageId]: _, ...rest } = state.imageSet.images;
                    return {
                        imageSet: {
                            ...state.imageSet,
                            images: rest,
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
            clearAllImages: () =>
                set((state) => ({
                    imageSet: {
                        ...state.imageSet,
                        images: {},
                    },
                })),
        }),
        {
            name: 'image-set-storage',
            storage: createJSONStorage(() => indexedDBStorage)
        }
    )
);
