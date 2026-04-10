import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX,
  MAX_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX,
  MIN_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX,
} from "./deviceAnalysisLayout";

export const useResizableSidebar = () => {
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    DEFAULT_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX,
  );

  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (event: MouseEvent) => {
      if (!isResizing) return;

      const nextWidth = event.clientX;
      if (
        nextWidth >= MIN_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX &&
        nextWidth <= MAX_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX
      ) {
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
