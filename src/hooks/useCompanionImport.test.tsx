// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanionImport } from "./useCompanionImport";
import { archive } from "../utils/companion/testFixtures";
import { clearCompanionDatabase, getSnapshot, getPackageRecord, reselect, restoreAll } from "../utils/companion";
import { useImageSetStore } from "../store/imageSetStore";
import { clearAllImageBlobs } from "../utils/imageBlobStorage";

const exifSpy = vi.hoisted(() => vi.fn());
vi.mock("../utils/exifUtils", async (importOriginal) => ({ ...await importOriginal<typeof import("../utils/exifUtils")>(), extractCompanionExif: exifSpy }));

/**
 * Click a button by its accessible label.
 *
 * @param label Button label to activate.
 */
async function choose(label: string) {
  await act(async () => { screen.getByRole("button", { name: label }).click(); });
}
/**
 * Mount the prompt returned by the hook after it becomes available.
 *
 * @param getPrompt Read the current hook prompt.
 */
async function showPrompt(getPrompt: () => ReactNode | null) {
  await waitFor(() => expect(getPrompt()).toBeTruthy());
  render(getPrompt());
}

beforeEach(async () => {
  exifSpy.mockClear();
  await clearCompanionDatabase();
  await clearAllImageBlobs();
  useImageSetStore.setState((state) => ({ imageSet: { ...state.imageSet, images: {}, imageOrder: [] } }));
});
afterEach(async () => { cleanup(); await clearCompanionDatabase(); await clearAllImageBlobs(); });

describe("useCompanionImport", () => {
  it("imports a real package into the image store", async () => {
    const { result } = renderHook(() => useCompanionImport());
    const file = await archive();
    await act(() => result.current.importPackage(file));
    expect(Object.values(useImageSetStore.getState().imageSet.images).map((image) => image.name)).toEqual(["photo.jpg"]);
    expect(Object.keys(getSnapshot().packages)).toHaveLength(1);
    expect(exifSpy).toHaveBeenCalledTimes(1);
    expect(exifSpy).toHaveBeenCalledWith(useImageSetStore.getState().imageSet.imageOrder);
  });

  it("reconnects matching identity without adding images and preserves edits", async () => {
    const { result } = renderHook(() => useCompanionImport());
    const file = await archive();
    await act(() => result.current.importPackage(file));
    const [id] = useImageSetStore.getState().imageSet.imageOrder;
    useImageSetStore.getState().updateImageKeys(id!, { Description: "kept" });
    let promise!: Promise<void>;
    await act(async () => { promise = result.current.importPackage(file); });
    await showPrompt(() => result.current.prompt);
    await choose("Reconnect");
    await act(() => promise);
    expect(useImageSetStore.getState().imageSet.imageOrder).toEqual([id]);
    expect(useImageSetStore.getState().imageSet.images[id!]?.keys).toEqual({ Description: "kept" });
    expect(Object.keys(getSnapshot().packages)).toHaveLength(1);
    expect(Object.values(getSnapshot().states)).toEqual(["available"]);
  });

  it("imports a matching package as a separate readable copy", async () => {
    const { result } = renderHook(() => useCompanionImport());
    const file = await archive();
    await act(() => result.current.importPackage(file));
    let promise!: Promise<void>;
    await act(async () => { promise = result.current.importPackage(file); });
    await showPrompt(() => result.current.prompt);
    await choose("Import as new copy");
    await showPrompt(() => result.current.prompt);
    await choose("Import anyway");
    await act(() => promise);
    const images = Object.values(useImageSetStore.getState().imageSet.images);
    expect(images).toHaveLength(2);
    await expect(getPackageRecord(images[0]!.companion!.packageId)).resolves.toBeTruthy();
    await expect(getPackageRecord(images[1]!.companion!.packageId)).resolves.toBeTruthy();
  });

  it("imports changed originals as a separate package identity", async () => {
    const { result } = renderHook(() => useCompanionImport());
    const file = await archive();
    await act(() => result.current.importPackage(file));
    const changed = await archive([{ id: "photo-1", filename: "photo.jpg", bytes: "changed" }]);
    let promise!: Promise<void>;
    await act(async () => { promise = result.current.importPackage(changed); });
    await act(() => promise);
    expect(result.current.error).toBe("");
    expect(Object.keys(getSnapshot().packages)).toHaveLength(2);
  });

  it("skips duplicate companion, loose-image SHA, and within-package images", async () => {
    const { result } = renderHook(() => useCompanionImport());
    const duplicateBundle = await archive([{ id: "a", filename: "a.jpg", bytes: "same" }, { id: "b", filename: "b.jpg", bytes: "same" }]);
    let promise!: Promise<void>;
    await act(async () => { promise = result.current.importPackage(duplicateBundle); });
    await showPrompt(() => result.current.prompt);
    await choose("Skip duplicates");
    await act(() => promise);
    expect(useImageSetStore.getState().imageSet.imageOrder).toHaveLength(1);
    expect(Object.values(useImageSetStore.getState().imageSet.images)[0]?.name).toBe("a.jpg");
  });

  it.each(["Cancel import", "Import anyway"])("handles duplicate choice %s", async (choice) => {
    const { result } = renderHook(() => useCompanionImport());
    const f = await archive([{ id: "a", filename: "a.jpg", bytes: "same" }, { id: "b", filename: "b.jpg", bytes: "same" }]);
    let promise!: Promise<void>;
    await act(async () => { promise = result.current.importPackage(f); });
    await showPrompt(() => result.current.prompt);
    await choose(choice);
    await act(() => promise);
    expect(useImageSetStore.getState().imageSet.imageOrder).toHaveLength(choice === "Cancel import" ? 0 : 2);
    if (choice === "Cancel import") expect(Object.keys(getSnapshot().packages)).toHaveLength(0);
  });

  it("leaves persisted records and image data unchanged for invalid ZIPs", async () => {
    const { result } = renderHook(() => useCompanionImport());
    const file = await archive();
    await act(() => result.current.importPackage(file));
    const beforeImages = useImageSetStore.getState().imageSet.imageOrder;
    await act(() => result.current.importPackage(new File(["invalid"], "broken.zip")));
    expect(result.current.error).toBeTruthy();
    expect(Object.keys(getSnapshot().packages)).toHaveLength(1);
    expect(useImageSetStore.getState().imageSet.imageOrder).toEqual(beforeImages);
  });

  it("serializes two imports started in quick succession", async () => {
    const { result } = renderHook(() => useCompanionImport());
    const file = await archive([{ id: "a", filename: "a.jpg" }, { id: "b", filename: "b.jpg" }]);
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => { first = result.current.importPackage(file); second = result.current.importPackage(file); });
    await showPrompt(() => result.current.prompt);
    await choose("Reconnect");
    await act(async () => Promise.all([first, second]));
    expect(useImageSetStore.getState().imageSet.imageOrder).toHaveLength(2);
    expect(Object.keys(getSnapshot().packages)).toHaveLength(1);
  });

  it("reopens packages and retains availability for EXIF resume", async () => {
    const { result } = renderHook(() => useCompanionImport());
    const file = await archive();
    await act(() => result.current.importPackage(file));
    const packageId = Object.values(useImageSetStore.getState().imageSet.images)[0]!.companion!.packageId;
    await restoreAll();
    expect(getSnapshot().states[packageId]).toBe("available");
    await reselect(packageId, file);
    expect(getSnapshot().states[packageId]).toBe("available");
  });
});
