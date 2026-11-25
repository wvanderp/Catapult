import { useEffect, useState } from "react";

/**
Observe an element and report when it enters the viewport.
 
 * @param options IntersectionObserver configuration.
 * @returns A ref callback and whether its element is visible.
 */
export function useInViewport<T extends Element>(options: IntersectionObserverInit = {}): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [isInViewport, setIsInViewport] = useState(false);
  const { root, rootMargin, threshold } = options;
  useEffect(() => {
    if (!node || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setIsInViewport(Boolean(entry?.isIntersecting)), { root, rootMargin, threshold });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, root, rootMargin, threshold]);
  return [setNode, typeof IntersectionObserver === "undefined" || isInViewport];
}
