import { useCallback, useEffect, useState } from "react";

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const STORAGE_KEY = "da-sidebar-width";

export const useResizableSidebar = () => {
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const savedWidth = localStorage.getItem(STORAGE_KEY);
      if (savedWidth) {
        const parsed = Number.parseInt(savedWidth, 10);
        if (Number.isFinite(parsed)) return parsed;
      }
    }

    return DEFAULT_WIDTH;
  });

  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);

    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, sidebarWidth.toString());
    }
  }, [sidebarWidth]);

  const resize = useCallback(
    (event: MouseEvent) => {
      if (!isResizing) return;

      const nextWidth = event.clientX;
      if (nextWidth >= MIN_WIDTH && nextWidth <= MAX_WIDTH) {
        setSidebarWidth(nextWidth);
      }
    },
    [isResizing],
  );

  useEffect(() => {
    if (!isResizing) return undefined;

    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return {
    isResizing,
    sidebarWidth,
    startResizing,
  };
};
