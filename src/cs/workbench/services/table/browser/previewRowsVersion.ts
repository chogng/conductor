/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const createRowsVersion = () => {
  let rowsVersion = 0;
  let rowsNotifyRaf = 0;
  const rowsSubscribers = new Set<() => void>();

  const getRowsVersion = () => rowsVersion;

  const subscribeRowsVersion = (callback: () => void) => {
    rowsSubscribers.add(callback);
    return () => rowsSubscribers.delete(callback);
  };

  const cancelRowsVersionNotification = () => {
    if (typeof window === "undefined") return;
    if (!rowsNotifyRaf) return;

    cancelAnimationFrame(rowsNotifyRaf);
    rowsNotifyRaf = 0;
  };

  const notifyRowsVersion = () => {
    if (typeof window === "undefined") return;
    if (rowsNotifyRaf) return;

    rowsNotifyRaf = requestAnimationFrame(() => {
      rowsNotifyRaf = 0;
      rowsVersion += 1;

      for (const callback of Array.from(rowsSubscribers)) {
        try {
          callback();
        } catch {
          // A broken listener must not prevent the row cache from advancing.
        }
      }
    });
  };

  return {
    cancelRowsVersionNotification,
    getRowsVersion,
    notifyRowsVersion,
    subscribeRowsVersion,
  };
};

export const useRowsVersion = createRowsVersion;
