// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useImageSetStore } from "../store/imageSetStore";
import { getImageAsFile } from "../utils/imageBlobStorage";
import { clearCompanionDatabase, inspectCompanion, removePackage } from "../utils/companion";
import { archive } from "../utils/companion/testFixtures";
import { useImageFile } from "./useImageData";

afterEach(async () => {
  cleanup();
  await useImageSetStore.getState().clearAllImages();
  await clearCompanionDatabase();
});

describe("companion image file loading", () => {
  it("returns a verified named File and base64 from the companion original", async () => {
    const imported = await inspectCompanion(await archive([{ id: "photo", filename: "camera.jpg", bytes: "original bytes" }]));
    const [id] = await useImageSetStore.getState().addCompanionImages(imported.photos);
    const { result } = renderHook(() => useImageFile(id, "upload.jpg"));
    const file = await result.current.getFile();
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe("camera.jpg");
    expect(file?.type).toBe("image/jpeg");
    expect(await file?.text()).toBe("original bytes");
    expect(await result.current.getBase64()).toBe(btoa("original bytes"));
  });

  it("propagates missing package and verification errors", async () => {
    const imported = await inspectCompanion(await archive([{ id: "gone", filename: "gone.jpg" }]));
    const [id] = await useImageSetStore.getState().addCompanionImages(imported.photos);
    await removePackage(imported.record.id);
    const { result } = renderHook(() => useImageFile(id, "gone.jpg"));
    await expect(result.current.getFile()).rejects.toThrow(/not present/);
    await expect(getImageAsFile(id!, "gone.jpg", imported.photos[0])).rejects.toThrow(/not present/);
  });

  it("returns undefined when no image is selected", async () => {
    const { result } = renderHook(() => useImageFile(undefined, "unused.jpg"));
    await expect(result.current.getFile()).resolves.toBeUndefined();
    await expect(result.current.getBase64()).resolves.toBeUndefined();
  });
});
