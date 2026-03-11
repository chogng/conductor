import { useEffect, useState, type RefObject } from "react";

export const useContainerSizeReady = (
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean = true,
): boolean => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let rafId = 0;

    const scheduleReset = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        setReady((prev) => (prev ? false : prev));
      });
    };

    if (!enabled) {
      scheduleReset();
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
      };
    }

    const element = containerRef.current;
    if (!element) {
      scheduleReset();
      return () => {
        if (rafId) cancelAnimationFrame(rafId);
      };
    }

    const commit = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(element.clientWidth || rect.width || 0);
      const height = Math.round(element.clientHeight || rect.height || 0);
      const nextReady = width > 0 && height > 0;
      setReady((prev) => (prev === nextReady ? prev : nextReady));
    };

    const scheduleCommit = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        commit();
      });
    };

    scheduleCommit();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => scheduleCommit());
      ro.observe(element);
    }

    window.addEventListener("resize", scheduleCommit);
    return () => {
      window.removeEventListener("resize", scheduleCommit);
      if (ro) ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [containerRef, enabled]);

  return enabled && ready;
};
