// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInViewport } from "./useInViewport";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("useInViewport", () => {
  it("observes a node, reports intersection, and disconnects on cleanup", () => {
    let callback: IntersectionObserverCallback | undefined;
    const observerObserve = vi.fn();
    const observerDisconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      observe = observerObserve;
      disconnect = observerDisconnect;
      unobserve = vi.fn();
      takeRecords = () => [];
      root = null;
      rootMargin = "0px";
      thresholds = [0];
      constructor(observer: IntersectionObserverCallback) { callback = observer; }
    });
    const node = document.createElement("div");
    const { result, unmount } = renderHook(() => useInViewport<HTMLDivElement>({ rootMargin: "10px" }));
    act(() => result.current[0](node));
    expect(observerObserve).toHaveBeenCalledWith(node);
    expect(result.current[1]).toBe(false);
    act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(result.current[1]).toBe(true);
    unmount();
    expect(observerDisconnect).toHaveBeenCalledOnce();
  });

  it("uses the visible fallback when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { result } = renderHook(() => useInViewport<HTMLDivElement>());
    expect(result.current[1]).toBe(true);
  });
});
