export const createPreviewRowsVersion = () => {
  let previewRowsVersion = 0;
  let previewRowsNotifyRaf = 0;
  const previewRowsSubscribers = new Set<() => void>();

  const getPreviewRowsVersion = () => previewRowsVersion;

  const subscribePreviewRowsVersion = (callback: () => void) => {
    previewRowsSubscribers.add(callback);
    return () => previewRowsSubscribers.delete(callback);
  };

  const cancelPreviewRowsVersionNotification = () => {
    if (typeof window === "undefined") return;
    if (!previewRowsNotifyRaf) return;

    cancelAnimationFrame(previewRowsNotifyRaf);
    previewRowsNotifyRaf = 0;
  };

  const notifyPreviewRowsVersion = () => {
    if (typeof window === "undefined") return;
    if (previewRowsNotifyRaf) return;

    previewRowsNotifyRaf = requestAnimationFrame(() => {
      previewRowsNotifyRaf = 0;
      previewRowsVersion += 1;

      for (const callback of Array.from(previewRowsSubscribers)) {
        try {
          callback();
        } catch {
          // A broken listener must not prevent the preview cache from advancing.
        }
      }
    });
  };

  return {
    cancelPreviewRowsVersionNotification,
    getPreviewRowsVersion,
    notifyPreviewRowsVersion,
    subscribePreviewRowsVersion,
  };
};

export const usePreviewRowsVersion = createPreviewRowsVersion;
