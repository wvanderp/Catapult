// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backfillLargeOriginalFlags, getBase64ByteLength, useImageSetStore } from "./imageSetStore";
import { getImageBlob, storeImageBlob } from "../utils/imageBlobStorage";
import { forgetPackageWhenUnused, type ImportedPhoto } from "../utils/companion";
import { LARGE_ORIGINAL_BYTES } from "../utils/companion";

vi.mock("../utils/companion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/companion")>();
  return { ...actual, forgetPackageWhenUnused: vi.fn().mockResolvedValue(undefined) };
});

const photo = (packageId: string, photoId: string): ImportedPhoto => ({ packageId, photoId, name: `${photoId}.jpg`, mimeType: "image/jpeg", sha256: "abc", size: 10 });

afterEach(async () => {
  await useImageSetStore.getState().clearAllImages();
  vi.mocked(forgetPackageWhenUnused).mockClear();
});

describe("image set companion state", () => {
  it("counts base64 padding exactly at the 100 MiB warning boundary", () => {
    const size = LARGE_ORIGINAL_BYTES;
    const paddedTwo = "A".repeat(Math.ceil(size / 3) * 4 - 2) + "==";
    const paddedOneSize = size - 2;
    const paddedOne = "A".repeat(Math.ceil(paddedOneSize / 3) * 4 - 1) + "=";
    expect(getBase64ByteLength(paddedTwo)).toBe(size);
    expect(getBase64ByteLength(paddedOne)).toBe(paddedOneSize);
    expect(getBase64ByteLength("AAAA")).toBe(3);
  });

  it("backfills large-original flags using exact stored byte sizes", async () => {
    const threshold = LARGE_ORIGINAL_BYTES;
    const images = {
      exact: { id: "exact", name: "exact.jpg", mimeType: "image/jpeg", keys: {}, reviewed: false, largeOriginal: true },
      over: { id: "over", name: "over.jpg", mimeType: "image/jpeg", keys: {}, reviewed: false, largeOriginal: false },
    };
    useImageSetStore.setState((state) => ({ imageSet: { ...state.imageSet, images } }));
    const getBlob = vi.spyOn(await import("../utils/imageBlobStorage"), "getImageBlob").mockImplementation(async (id) => {
      const blob = new Blob(["x"]);
      Object.defineProperty(blob, "size", { value: id === "exact" ? threshold : threshold + 1 });
      return { id, blob, mimeType: "image/jpeg" };
    });
    await backfillLargeOriginalFlags();
    expect(useImageSetStore.getState().imageSet.images.exact?.largeOriginal).toBe(false);
    expect(useImageSetStore.getState().imageSet.images.over?.largeOriginal).toBe(true);
    getBlob.mockRestore();
  });

  it("adds a batch of companion images with one store update", async () => {
    let updates = 0;
    const unsubscribe = useImageSetStore.subscribe(() => { updates++; });
    const ids = await useImageSetStore.getState().addCompanionImages([photo("pkg", "one"), photo("pkg", "two")]);
    unsubscribe();
    expect(ids).toHaveLength(2);
    expect(updates).toBe(1);
    expect(useImageSetStore.getState().imageSet.imageOrder).toEqual(ids);
  });

  it("waits for blob cleanup and removes a package only after its last image", async () => {
    const blob = new Blob(["image"]);
    await storeImageBlob("loose", blob, "image/jpeg");
    const { promise: pending, resolve: release } = Promise.withResolvers<void>();
    const cleanup = vi.spyOn(await import("../utils/imageBlobStorage"), "removeImageBlob").mockReturnValueOnce(pending);
    const loose = { id: "loose", name: "loose.jpg", mimeType: "image/jpeg", keys: {}, reviewed: false };
    useImageSetStore.setState((state) => ({ imageSet: { ...state.imageSet, images: { ...state.imageSet.images, loose } } }));
    let done = false;
    const removal = useImageSetStore.getState().removeImage("loose").then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    release();
    await removal;
    expect(cleanup).toHaveBeenCalledWith("loose");
    expect(await getImageBlob("loose")).toBeDefined();
    cleanup.mockRestore();

    const [first, second] = await useImageSetStore.getState().addCompanionImages([photo("pkg", "one"), photo("pkg", "two")]);
    await useImageSetStore.getState().removeImage(first!);
    expect(forgetPackageWhenUnused).not.toHaveBeenCalledWith("pkg", []);
    await useImageSetStore.getState().removeImage(second!);
    expect(forgetPackageWhenUnused).toHaveBeenCalledWith("pkg", []);
  });

  it("waits for clear cleanup and removes package records", async () => {
    const [id] = await useImageSetStore.getState().addCompanionImages([photo("pkg", "one")]);
    const { promise: pending, resolve: release } = Promise.withResolvers<void>();
    vi.mocked(forgetPackageWhenUnused).mockReturnValueOnce(pending);
    let done = false;
    const clearing = useImageSetStore.getState().clearAllImages().then(() => { done = true; });
    await Promise.resolve();
    expect(useImageSetStore.getState().imageSet.images[id!]).toBeDefined();
    expect(done).toBe(false);
    release();
    await clearing;
    expect(useImageSetStore.getState().imageSet.imageOrder).toEqual([]);
    expect(forgetPackageWhenUnused).toHaveBeenCalledWith("pkg", []);
  });

  it("rehydrates old persisted image metadata and JSON round trips new fields", async () => {
    const storage = await import("../utils/indexedDbStorage");
    const oldState = { state: { imageSet: { template: "old", titleTemplate: "title", globalVariables: {}, images: { old: { id: "old", name: "old.jpg", mimeType: "image/jpeg", keys: {}, reviewed: false } }, imageOrder: ["old"] } }, version: 0 };
    await storage.indexedDBStorage.setItem("image-set-storage", JSON.stringify(oldState));
    await useImageSetStore.persist.rehydrate();
    expect(useImageSetStore.getState().imageSet.images.old).toMatchObject({ id: "old", reviewed: false });
    const modern = { ...useImageSetStore.getState().imageSet.images.old!, largeOriginal: true, sha256: "hash", exifStatus: "complete" as const };
    // eslint-disable-next-line unicorn/prefer-structured-clone -- This explicitly tests JSON serialization compatibility.
    expect(JSON.parse(JSON.stringify(modern))).toEqual(modern);
  });
});
