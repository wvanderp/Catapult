// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useImageSetStore } from "../store/imageSetStore";
import { useImageUrl } from "./useImageData";

const packages = vi.hoisted(() => ({ snapshot: { packages: {}, states: {} } as { packages: Record<string, never>; states: Record<string, string> }, listeners: new Set<() => void>() }));
const getObjectUrl = vi.hoisted(() => vi.fn());
vi.mock("../utils/companion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/companion")>();
  return { ...actual, getSnapshot: () => packages.snapshot, subscribe: (listener: () => void) => { packages.listeners.add(listener); return () => packages.listeners.delete(listener); } };
});
vi.mock("../utils/imageBlobStorage", () => ({
  getImageObjectUrl: getObjectUrl,
  getImageAsFile: vi.fn(),
  getImageBase64: vi.fn(),
}));

afterEach(() => {
  cleanup();
  useImageSetStore.setState((state) => ({ imageSet: { ...state.imageSet, images: {} } }));
  packages.snapshot = { packages: {}, states: {} };
  packages.listeners.clear();
  getObjectUrl.mockReset();
  vi.restoreAllMocks();
});

describe("useImageUrl", () => {
  it("revokes its URL on unmount and on image switch", async () => {
    getObjectUrl.mockResolvedValueOnce("blob:first").mockResolvedValueOnce("blob:second");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const { rerender, unmount } = renderHook(({ id }) => useImageUrl(id), { initialProps: { id: "first" } });
    await waitFor(() => expect(revoke).not.toHaveBeenCalled());
    rerender({ id: "second" });
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:first"));
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:second");
  });

  it("revokes a URL that resolves after unmount and aborts the request", async () => {
    const { promise, resolve } = Promise.withResolvers<string>();
    getObjectUrl.mockImplementation((_id: string, _companion: unknown, _size: string, signal: AbortSignal) => { expect(signal).toBeInstanceOf(AbortSignal); return promise; });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const { unmount } = renderHook(() => useImageUrl("late"));
    const signal = getObjectUrl.mock.calls[0]?.[3] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve("blob:late"); await promise; });
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:late"));
  });

  it("loads nothing when disabled", async () => {
    const { result } = renderHook(() => useImageUrl("disabled", "thumbnail", false));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getObjectUrl).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it("reports unavailable companion packages and reloads when availability returns", async () => {
    const id = "companion";
    useImageSetStore.setState((state) => ({ imageSet: { ...state.imageSet, images: { ...state.imageSet.images, [id]: { id, name: "photo.jpg", mimeType: "image/jpeg", keys: {}, reviewed: false, companion: { packageId: "pkg", photoId: "photo", name: "photo.jpg", mimeType: "image/jpeg", sha256: "hash", size: 1 } } } } }));
    packages.snapshot = { packages: {}, states: { pkg: "unselected" } };
    const { result } = renderHook(() => useImageUrl(id));
    await waitFor(() => expect(result.current.error).toMatch(/unavailable/));
    expect(getObjectUrl).not.toHaveBeenCalled();
    getObjectUrl.mockResolvedValue("blob:reloaded");
    await act(async () => {
      packages.snapshot = { packages: {}, states: { pkg: "available" } };
      for (const listener of packages.listeners) listener();
    });
    await waitFor(() => expect(result.current.imageUrl).toBe("blob:reloaded"));
  });

  it("does not restart previews when an unrelated package publish occurs", async () => {
    const id = "companion";
    useImageSetStore.setState((state) => ({ imageSet: { ...state.imageSet, images: { ...state.imageSet.images, [id]: { id, name: "photo.jpg", mimeType: "image/jpeg", keys: {}, reviewed: false, companion: { packageId: "pkg", photoId: "photo", name: "photo.jpg", mimeType: "image/jpeg", sha256: "hash", size: 1 } } } } }));
    packages.snapshot = { packages: {}, states: { pkg: "available" } };
    getObjectUrl.mockResolvedValue("blob:preview");
    renderHook(() => useImageUrl(id));
    await waitFor(() => expect(getObjectUrl).toHaveBeenCalledTimes(1));

    await act(async () => {
      packages.snapshot = { packages: {} as Record<string, never>, states: { pkg: "available", unrelated: "available" } };
      for (const listener of packages.listeners) listener();
    });

    expect(getObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable image data", async () => {
    getObjectUrl.mockResolvedValue(undefined);
    const { result } = renderHook(() => useImageUrl("missing"));
    await waitFor(() => expect(result.current.error).toBe("Image data is unavailable"));
  });
});
