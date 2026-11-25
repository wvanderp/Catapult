// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useImageSetStore } from "../store/imageSetStore";
import { extractCompanionExif } from "./exifUtils";
import { initializeStartup } from "./startup";
import type { ImportedPhoto } from "./companion";
import { indexedDBStorage } from "./indexedDbStorage";

const control = vi.hoisted(() => ({
  snapshot: { packages: {}, states: {} } as { packages: Record<string, never>; states: Record<string, string> },
  listeners: new Set<() => void>(),
  getOriginalBlob: vi.fn(),
}));
const parseExif = vi.hoisted(() => vi.fn());
vi.mock("exifr", () => ({ default: { parse: parseExif } }));
vi.mock("./companion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./companion")>();
  return {
    ...actual,
    restoreAll: vi.fn(async () => {}),
    getOriginalBlob: control.getOriginalBlob,
    getSnapshot: () => control.snapshot,
    subscribe: (listener: () => void) => { control.listeners.add(listener); return () => control.listeners.delete(listener); },
  };
});

const photo = (id: string, packageId = "pkg", mimeType = "image/jpeg"): ImportedPhoto => ({ packageId, photoId: id, name: `${id}.jpg`, mimeType, sha256: id, size: 200 * 1024 * 1024 });
/**
Add companion fixture images to the store.
 
 * @param photos Fixture metadata.
 * @returns IDs assigned by the store.
 */
function addImages(photos: ImportedPhoto[]): Promise<string[]> { return useImageSetStore.getState().addCompanionImages(photos); }
/**
Publish a package availability change to subscribed consumers.
 
 * @param packageId Package identifier.
 * @param state Availability value.
 */
function setAvailability(packageId: string, state: string): void {
  control.snapshot = { packages: {}, states: { ...control.snapshot.states, [packageId]: state } };
  for (const listener of control.listeners) listener();
}

beforeEach(() => {
  control.snapshot = { packages: {}, states: {} };
  control.getOriginalBlob.mockReset();
  control.getOriginalBlob.mockImplementation(async () => new Blob(["tiny"]));
  parseExif.mockReset();
  parseExif.mockResolvedValue({ Make: "Camera" });
});
afterEach(async () => {
  vi.useRealTimers();
  await useImageSetStore.getState().clearAllImages();
});

describe("extractCompanionExif", () => {
  it("limits package reads to two concurrent parses", async () => {
    const ids = await addImages([photo("one"), photo("two"), photo("three")]);
    setAvailability("pkg", "available");
    let active = 0;
    let maxActive = 0;
    let callIndex = 0;
    const gates = Array.from({ length: 3 }, () => Promise.withResolvers<Record<string, unknown>>());
    parseExif.mockImplementation(async () => {
      const index = callIndex++;
      active++;
      maxActive = Math.max(maxActive, active);
      const result = await gates[index]!.promise;
      active--;
      return result;
    });
    const extraction = extractCompanionExif(ids);
    await vi.waitFor(() => expect(parseExif).toHaveBeenCalledTimes(2));
    expect(maxActive).toBe(2);
    gates[0]!.resolve({ Make: "A" });
    gates[1]!.resolve({ Make: "B" });
    await vi.waitFor(() => expect(parseExif).toHaveBeenCalledTimes(3));
    gates[2]!.resolve({ Make: "C" });
    await extraction;
    expect(maxActive).toBe(2);
    expect(ids.map((id) => useImageSetStore.getState().imageSet.images[id]?.exifStatus)).toEqual(["complete", "complete", "complete"]);
  }, 2000);

  it("persists EXIF results as one batched image-store update", async () => {
    const ids = await addImages(Array.from({ length: 5 }, (_, index) => photo(`batch-${index}`)));
    const batchUpdate = vi.spyOn(useImageSetStore.getState(), "setImagesExifData");
    setAvailability("pkg", "available");
    await extractCompanionExif(ids);
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    expect(Object.keys(batchUpdate.mock.calls[0]![0])).toHaveLength(5);
    expect(ids.map((id) => useImageSetStore.getState().imageSet.images[id]?.exifStatus)).toEqual(ids.map(() => "complete"));
    batchUpdate.mockRestore();
  }, 2000);

  it("passes large JPEG and TIFF blobs directly to the parser without reading slices", async () => {
    const photos = [photo("jpeg"), photo("tiff", "pkg", "image/tiff")];
    const ids = await addImages(photos);
    const blobs = photos.map(() => {
      const blob = new Blob(["header"]);
      Object.defineProperty(blob, "size", { value: 200 * 1024 * 1024 });
      vi.spyOn(blob, "slice");
      return blob;
    });
    control.getOriginalBlob.mockImplementation(async (_packageId: string, photoId: string) => blobs[photoId === "jpeg" ? 0 : 1]!);
    setAvailability("pkg", "available");
    await extractCompanionExif(ids);
    expect(parseExif).toHaveBeenCalledTimes(2);
    expect(parseExif).toHaveBeenCalledWith(blobs[0], expect.objectContaining({ firstChunkSize: 64 * 1024, chunkSize: 256 * 1024, chunkLimit: 64 }));
    expect(blobs.map((blob) => vi.mocked(blob.slice).mock.calls.length)).toEqual([0, 0]);
  }, 2000);

  it("resumes pending work when the package becomes available", async () => {
    const [id] = await addImages([photo("later")]);
    await extractCompanionExif([id!]);
    expect(useImageSetStore.getState().imageSet.images[id!]?.exifStatus).toBeUndefined();
    expect(parseExif).not.toHaveBeenCalled();
    setAvailability("pkg", "available");
    await vi.waitFor(() => expect(useImageSetStore.getState().imageSet.images[id!]?.exifStatus).toBe("complete"));
    expect(control.getOriginalBlob).toHaveBeenCalledTimes(1);
    expect(parseExif).toHaveBeenCalledTimes(1);
  }, 2000);

  it("ignores a removed image after its read completes", async () => {
    const [id] = await addImages([photo("remove")]);
    setAvailability("pkg", "available");
    const { promise, resolve } = Promise.withResolvers<Blob>();
    control.getOriginalBlob.mockReturnValueOnce(promise);
    const extraction = extractCompanionExif([id!]);
    await vi.waitFor(() => expect(control.getOriginalBlob).toHaveBeenCalled());
    await useImageSetStore.getState().removeImage(id!);
    resolve(new Blob(["image"]));
    await extraction;
    expect(useImageSetStore.getState().imageSet.images[id!]).toBeUndefined();
    expect(useImageSetStore.getState().imageSet.images[id!]?.exifData).toBeUndefined();
  });

  it("marks actual parse failures while leaving unavailable work pending", async () => {
    const ids = await addImages([photo("bad"), photo("pending", "other")]);
    setAvailability("pkg", "available");
    parseExif.mockRejectedValueOnce(new Error("broken image"));
    await extractCompanionExif(ids);
    expect(useImageSetStore.getState().imageSet.images[ids[0]!]?.exifStatus).toBe("failed");
    expect(parseExif).toHaveBeenCalledTimes(1);
    expect(useImageSetStore.getState().imageSet.images[ids[1]!]?.exifStatus).toBeUndefined();
    parseExif.mockResolvedValue({ Make: "Recovered" });
    setAvailability("other", "available");
    await vi.waitFor(() => expect(useImageSetStore.getState().imageSet.images[ids[1]!]?.exifStatus).toBe("complete"));
  }, 2000);

  it("returns for previously completed images and prunes removed pending images", async () => {
    const ids = await addImages([photo("done"), photo("removed")]);
    useImageSetStore.getState().setImageExifData(ids[0]!, { Make: "Already extracted" });
    setAvailability("pkg", "available");
    await extractCompanionExif([ids[0]!]);
    expect(parseExif).not.toHaveBeenCalled();
    setAvailability("pkg", "unavailable");
    await extractCompanionExif([ids[1]!]);
    await useImageSetStore.getState().removeImage(ids[1]!);
    setAvailability("pkg", "available");
    await vi.waitFor(() => expect(parseExif).not.toHaveBeenCalled());
    expect(control.getOriginalBlob).not.toHaveBeenCalled();
  }, 2000);

  it("shares one drain across repeated package publishes", async () => {
    const ids = await addImages([photo("one"), photo("two"), photo("three")]);
    const gate = Promise.withResolvers<Record<string, unknown>>();
    parseExif.mockReturnValue(gate.promise);
    const pending = extractCompanionExif(ids);
    setAvailability("pkg", "available");
    for (let index = 0; index < 100; index++) setAvailability("pkg", "available");
    await vi.waitFor(() => expect(parseExif).toHaveBeenCalledTimes(2));
    gate.resolve({});
    await vi.waitFor(() => expect(parseExif).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(ids.every((id) => useImageSetStore.getState().imageSet.images[id]?.exifStatus === "complete")).toBe(true));
    await pending;
    expect(parseExif).toHaveBeenCalledTimes(3);
  }, 2000);

  it("stores an empty result as complete", async () => {
    const [id] = await addImages([photo("empty")]);
    parseExif.mockResolvedValueOnce(undefined);
    setAvailability("pkg", "available");
    await extractCompanionExif([id!]);
    expect(useImageSetStore.getState().imageSet.images[id!]?.exifData).toEqual({});
    expect(useImageSetStore.getState().imageSet.images[id!]?.exifStatus).toBe("complete");
  }, 2000);

  it("startup re-extracts companion images left pending across a reload", async () => {
    const [id] = await addImages([photo("reload-pending")]);
    await extractCompanionExif([id!]);
    expect(useImageSetStore.getState().imageSet.images[id!]?.exifData).toBeUndefined();

    setAvailability("pkg", "available");
    await initializeStartup();

    expect(control.getOriginalBlob).toHaveBeenCalledTimes(1);
    expect(useImageSetStore.getState().imageSet.images[id!]?.exifData).toEqual({ Make: "Camera" });
    expect(useImageSetStore.getState().imageSet.images[id!]?.exifStatus).toBe("complete");
  }, 2000);

  it("recovers successful parses queued before the delayed store flush after a reload", async () => {
    const ids = await addImages([photo("queued-one"), photo("queued-two")]);
    // Let Zustand finish persisting the initial pending images before parsing begins.
    await vi.waitFor(async () => expect(await indexedDBStorage.getItem("image-set-storage")).not.toBeNull());
    const queuedGate = Promise.withResolvers<Record<string, unknown>>();
    const blockedGate = Promise.withResolvers<Record<string, unknown>>();
    const batchUpdate = vi.spyOn(useImageSetStore.getState(), "setImagesExifData");
    parseExif.mockReturnValueOnce(queuedGate.promise).mockReturnValueOnce(blockedGate.promise);
    setAvailability("pkg", "available");
    const extraction = extractCompanionExif(ids);
    await vi.waitFor(() => expect(parseExif).toHaveBeenCalledTimes(2));
    vi.useFakeTimers();
    queuedGate.resolve({ Make: "Queued camera" });
    // runJob queues its result and schedules the 250 ms timer. The extraction
    // loop itself can flush earlier than 250 ms when its job resolves, so keep
    // the second parse blocked and assert the queued state before releasing it.
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    expect(batchUpdate).not.toHaveBeenCalled();
    expect(ids.every((imageId) => useImageSetStore.getState().imageSet.images[imageId]?.exifData === undefined)).toBe(true);
    vi.clearAllTimers();
    vi.useRealTimers();
    const persistedSnapshot = await indexedDBStorage.getItem("image-set-storage");
    expect(JSON.parse(persistedSnapshot!).state.imageSet.images[ids[0]!].exifData).toBeUndefined();
    expect(batchUpdate).not.toHaveBeenCalled();
    vi.resetModules();

    const { useImageSetStore: reloadedStore } = await import("../store/imageSetStore");
    const { initializeStartup: reloadedStartup } = await import("./startup");
    parseExif.mockResolvedValue({ Make: "Camera" });
    await reloadedStartup();

    expect(ids.map((id) => reloadedStore.getState().imageSet.images[id]?.exifData)).toEqual([
      { Make: "Camera" }, { Make: "Camera" },
    ]);
    expect(ids.map((id) => reloadedStore.getState().imageSet.images[id]?.exifStatus)).toEqual(["complete", "complete"]);
    expect(control.getOriginalBlob).toHaveBeenCalledTimes(4);
    // Finish the old extraction after assertions. It only holds the old module's
    // store reference and cannot write to the reloaded store.
    blockedGate.resolve({ Make: "Old module result" });
    await extraction;
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    expect(ids.map((imageId) => reloadedStore.getState().imageSet.images[imageId]?.exifData)).toEqual([
      { Make: "Camera" }, { Make: "Camera" },
    ]);
    batchUpdate.mockRestore();
  }, 5000);
});
