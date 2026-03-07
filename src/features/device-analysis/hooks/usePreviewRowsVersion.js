import { useCallback, useRef } from "react";

export const usePreviewRowsVersion = () => {
  const previewRowsVersionRef = useRef(0);
  const previewRowsSubscribersRef = useRef(new Set());
  const previewRowsNotifyRafRef = useRef(0);

  const getPreviewRowsVersion = useCallback(
    () => previewRowsVersionRef.current,
    [],
  );

  const subscribePreviewRowsVersion = useCallback((callback) => {
    const subscribers = previewRowsSubscribersRef.current;
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  }, []);

  const cancelPreviewRowsVersionNotification = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!previewRowsNotifyRafRef.current) return;

    cancelAnimationFrame(previewRowsNotifyRafRef.current);
    previewRowsNotifyRafRef.current = 0;
  }, []);

  const notifyPreviewRowsVersion = useCallback(() => {
    if (typeof window === "undefined") return;
    if (previewRowsNotifyRafRef.current) return;

    previewRowsNotifyRafRef.current = requestAnimationFrame(() => {
      previewRowsNotifyRafRef.current = 0;
      previewRowsVersionRef.current += 1;

      for (const callback of Array.from(previewRowsSubscribersRef.current)) {
        try {
          callback();
        } catch {
          // ignore subscriber errors
        }
      }
    });
  }, []);

  return {
    cancelPreviewRowsVersionNotification,
    getPreviewRowsVersion,
    notifyPreviewRowsVersion,
    subscribePreviewRowsVersion,
  };
};
