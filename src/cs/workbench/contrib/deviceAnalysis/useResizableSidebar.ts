import { useCallback, useEffect, useState } from "react";
import { addDisposableListener, combinedDisposable, EventType } from "src/cs/base/browser/event";
import {
  DEFAULT_SIDEBAR_WIDTH_PX,
  MAX_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX,
  MIN_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX,
} from "./layout";

export const useResizableSidebar = () => {
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    DEFAULT_SIDEBAR_WIDTH_PX,
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

    return combinedDisposable(
      addDisposableListener(window, EventType.MOUSE_MOVE, resize),
      addDisposableListener(window, EventType.MOUSE_UP, stopResizing),
    ).dispose;
  }, [isResizing, resize, stopResizing]);

  return {
    isResizing,
    sidebarWidth,
    startResizing,
  };
};
