import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  DA_PREVIEW_MAX_CACHED_FILES,
  DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
  DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
} from "../lib/deviceAnalysisPreviewLimits";
import { usePreviewRowsVersion } from "./usePreviewRowsVersion";

const PREVIEW_STATUS_IDLE = { state: "idle", message: "" };
const DA_PREVIEW_MAX_CACHED_UI_CHUNKS_PER_FILE = Math.max(
  1,
  Math.ceil(
    DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE / DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
  ),
);

export const useDeviceAnalysisPreview = ({
  rawData = [],
  selectedPreviewFileId = null,
  setSelectedPreviewFileId = () => {},
  previewFile = null,
  setPreviewFile = () => {},
  setPreviewStatus = () => {},
  previewWorkerRef = { current: null },
  previewRequestIdRef = { current: 0 },
  previewRowsRequestIdRef = { current: 0 },
  previewRowsRequestsRef = { current: new Map() },
  previewRowsCacheByFileIdRef = { current: new Map() },
  previewLoadedChunksByFileIdRef = { current: new Map() },
  previewRowsCacheRef = { current: new Map() },
  previewLoadedChunksRef = { current: new Set() },
  previewCacheFileIdRef = { current: null },
  previewCacheFileLruRef = { current: new Set() },
  t,
}) => {
  const {
    cancelPreviewRowsVersionNotification,
    getPreviewRowsVersion,
    notifyPreviewRowsVersion,
    subscribePreviewRowsVersion,
  } = usePreviewRowsVersion();

  const deferredSelectedPreviewFileId = useDeferredValue(selectedPreviewFileId);

  const rawDataById = useMemo(() => {
    const map = new Map();

    for (const entry of Array.isArray(rawData) ? rawData : []) {
      const fileId = entry?.fileId;
      if (typeof fileId !== "string") continue;
      map.set(fileId, entry);
    }

    return map;
  }, [rawData]);

  const rawDataByIdRef = useRef(new Map());

  useEffect(() => {
    rawDataByIdRef.current = rawDataById;
  }, [rawDataById]);

  const cancelPendingPreviewRowRequests = useCallback(() => {
    const pendingRequests = previewRowsRequestsRef.current;
    for (const request of pendingRequests.values()) {
      try {
        request?.resolve?.([]);
      } catch {
        // ignore
      }
    }

    pendingRequests.clear();
  }, [previewRowsRequestsRef]);

  const notifyPreviewRowsCacheChanged = useCallback(() => {
    cancelPreviewRowsVersionNotification();
    notifyPreviewRowsVersion();
  }, [cancelPreviewRowsVersionNotification, notifyPreviewRowsVersion]);

  const assignCurrentPreviewCache = useCallback(
    ({ fileId = null, loadedChunks = new Set(), rowCache = new Map() } = {}) => {
      previewCacheFileIdRef.current = fileId;
      previewRowsCacheRef.current = rowCache;
      previewLoadedChunksRef.current = loadedChunks;
    },
    [previewCacheFileIdRef, previewLoadedChunksRef, previewRowsCacheRef],
  );

  const postPreviewDispose = useCallback(
    (fileId) => {
      if (typeof fileId !== "string" || !fileId) return;

      previewWorkerRef.current?.postMessage({
        type: "previewDispose",
        payload: { fileId },
      });
    },
    [previewWorkerRef],
  );

  const resetCurrentPreviewCache = useCallback(() => {
    assignCurrentPreviewCache();
    notifyPreviewRowsCacheChanged();
  }, [assignCurrentPreviewCache, notifyPreviewRowsCacheChanged]);

  const clearAllPreviewCaches = useCallback(() => {
    previewRowsCacheByFileIdRef.current = new Map();
    previewLoadedChunksByFileIdRef.current = new Map();
    previewCacheFileLruRef.current = new Set();
    assignCurrentPreviewCache();
    notifyPreviewRowsCacheChanged();
  }, [
    assignCurrentPreviewCache,
    notifyPreviewRowsCacheChanged,
    previewCacheFileLruRef,
    previewLoadedChunksByFileIdRef,
    previewRowsCacheByFileIdRef,
  ]);

  const invalidatePreviewRequests = useCallback(() => {
    previewRequestIdRef.current += 1;
    cancelPendingPreviewRowRequests();
  }, [cancelPendingPreviewRowRequests, previewRequestIdRef]);

  const clearPreviewState = useCallback(
    ({ clearSelection = false } = {}) => {
      setPreviewFile(null);
      setPreviewStatus(PREVIEW_STATUS_IDLE);

      if (clearSelection) {
        setSelectedPreviewFileId(null);
      }

      clearAllPreviewCaches();
    },
    [
      clearAllPreviewCaches,
      setPreviewFile,
      setPreviewStatus,
      setSelectedPreviewFileId,
    ],
  );

  const disposePreviewFileCache = useCallback(
    (fileId) => {
      if (typeof fileId !== "string" || !fileId) return;

      previewRowsCacheByFileIdRef.current.delete(fileId);
      previewLoadedChunksByFileIdRef.current.delete(fileId);
      previewCacheFileLruRef.current.delete(fileId);

      if (previewCacheFileIdRef.current === fileId) {
        resetCurrentPreviewCache();
      }

      postPreviewDispose(fileId);
    },
    [
      previewCacheFileIdRef,
      previewCacheFileLruRef,
      previewLoadedChunksByFileIdRef,
      postPreviewDispose,
      previewRowsCacheByFileIdRef,
      resetCurrentPreviewCache,
    ],
  );

  const activatePreviewFileCache = useCallback(
    (fileId) => {
      if (!fileId) {
        previewCacheFileLruRef.current = new Set();
        assignCurrentPreviewCache();
        return;
      }

      const cacheByFileId = previewRowsCacheByFileIdRef.current;
      const chunksByFileId = previewLoadedChunksByFileIdRef.current;

      let rowCache = cacheByFileId.get(fileId);
      if (!rowCache) {
        rowCache = new Map();
        cacheByFileId.set(fileId, rowCache);
      }

      let loadedChunks = chunksByFileId.get(fileId);
      if (!loadedChunks) {
        loadedChunks = new Set();
        chunksByFileId.set(fileId, loadedChunks);
      }

      assignCurrentPreviewCache({ fileId, loadedChunks, rowCache });

      const fileLru = previewCacheFileLruRef.current;
      fileLru.delete(fileId);
      fileLru.add(fileId);

      while (fileLru.size > DA_PREVIEW_MAX_CACHED_FILES) {
        const oldestFileId = fileLru.values().next().value;
        if (!oldestFileId || oldestFileId === fileId) break;

        disposePreviewFileCache(oldestFileId);
      }
    },
    [
      assignCurrentPreviewCache,
      disposePreviewFileCache,
      previewCacheFileLruRef,
      previewLoadedChunksByFileIdRef,
      previewRowsCacheByFileIdRef,
    ],
  );

  const handlePreviewWorkerMessage = useCallback(
    (event) => {
      const { type, payload } = event.data ?? {};

      if (type === "previewResult") {
        if (payload?.requestId !== previewRequestIdRef.current) return;

        const fileId = payload.fileId ?? null;
        activatePreviewFileCache(fileId);

        startTransition(() => {
          setPreviewFile({
            fileId,
            fileName: payload.fileName,
            rowCount: payload.rowCount,
            columnCount: payload.columnCount,
            maxCellLengths: payload.maxCellLengths,
          });
          setPreviewStatus({ state: "ready", message: "" });
        });
        return;
      }

      if (type === "previewRowsResult") {
        const requestId = payload?.requestId ?? null;
        const pendingRequest = previewRowsRequestsRef.current.get(requestId);
        if (!pendingRequest) return;

        previewRowsRequestsRef.current.delete(requestId);

        const { reject, resolve } = pendingRequest;

        try {
          const fileId = payload?.fileId ?? null;
          const startRow = Number(payload?.startRow) || 0;
          const rows = Array.isArray(payload?.rows) ? payload.rows : [];

          if (fileId && previewCacheFileIdRef.current !== fileId) {
            resolve([]);
            return;
          }

          for (let index = 0; index < rows.length; index += 1) {
            previewRowsCacheRef.current.set(startRow + index, rows[index]);
          }

          notifyPreviewRowsVersion();
          resolve(rows);
        } catch (error) {
          reject(error);
        }

        return;
      }

      if (type === "workerError") {
        const requestId = payload?.requestId;

        if (
          requestId !== previewRequestIdRef.current &&
          !previewRowsRequestsRef.current.has(requestId)
        ) {
          return;
        }

        if (previewRowsRequestsRef.current.has(requestId)) {
          const pendingRequest = previewRowsRequestsRef.current.get(requestId);
          previewRowsRequestsRef.current.delete(requestId);
          pendingRequest?.reject?.(
            new Error(payload?.message || "Unknown worker error"),
          );
          return;
        }

        console.error("Preview worker error:", payload?.message);
        startTransition(() => {
          setPreviewStatus({
            state: "error",
            message: payload?.message ?? "Preview worker error",
          });
        });
      }
    },
    [
      activatePreviewFileCache,
      notifyPreviewRowsVersion,
      previewCacheFileIdRef,
      previewRowsRequestsRef,
      previewRequestIdRef,
      previewRowsCacheRef,
      setPreviewFile,
      setPreviewStatus,
    ],
  );

  const createPreviewWorker = useCallback(() => {
    const worker = new Worker(
      new URL("../workers/deviceAnalysis.worker.js", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = handlePreviewWorkerMessage;
    previewWorkerRef.current = worker;
    return worker;
  }, [handlePreviewWorkerMessage, previewWorkerRef]);

  const resetPreviewWorker = useCallback(() => {
    cancelPendingPreviewRowRequests();

    if (previewWorkerRef.current) {
      previewWorkerRef.current.terminate();
      previewWorkerRef.current = null;
    }

    createPreviewWorker();
  }, [cancelPendingPreviewRowRequests, createPreviewWorker, previewWorkerRef]);

  useEffect(() => {
    if (previewWorkerRef.current) return undefined;

    createPreviewWorker();

    return undefined;
  }, [createPreviewWorker, previewWorkerRef]);

  useEffect(() => {
    if (!rawData.length) {
      invalidatePreviewRequests();
      clearPreviewState({ clearSelection: true });
      return;
    }

    const effectiveFileId =
      deferredSelectedPreviewFileId && rawDataById.has(deferredSelectedPreviewFileId)
        ? deferredSelectedPreviewFileId
        : rawData[0]?.fileId ?? null;

    const targetFile = rawDataById.get(effectiveFileId) ?? null;
    if (!targetFile?.file || !targetFile?.fileId) return;
    if (previewFile?.fileId === targetFile.fileId) return;

    const worker = previewWorkerRef.current;
    if (!worker) return;

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;

    startTransition(() => {
      setPreviewStatus({ state: "loading", message: t("da_preview_loading") });
    });

    worker.postMessage({
      type: "preview",
      payload: {
        requestId,
        fileId: targetFile.fileId,
        file: targetFile.file,
        maxPreviewRows: DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
      },
    });
  }, [
    clearPreviewState,
    deferredSelectedPreviewFileId,
    invalidatePreviewRequests,
    previewFile?.fileId,
    previewRequestIdRef,
    previewWorkerRef,
    rawData,
    rawDataById,
    setPreviewStatus,
    t,
  ]);

  const getPreviewRow = useCallback(
    (rowIndex) => {
      const normalizedIndex = Number(rowIndex);
      if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) return null;
      return previewRowsCacheRef.current.get(normalizedIndex) ?? null;
    },
    [previewRowsCacheRef],
  );

  const requestPreviewRowsRange = useCallback(
    (fileId, startRow, endRow) => {
      const worker = previewWorkerRef.current;
      if (!worker || !fileId) return Promise.resolve([]);

      const requestId = previewRowsRequestIdRef.current + 1;
      previewRowsRequestIdRef.current = requestId;

      const start = Math.max(0, Math.floor(Number(startRow) || 0));
      const end = Math.max(start, Math.floor(Number(endRow) || start));

      return new Promise((resolve, reject) => {
        previewRowsRequestsRef.current.set(requestId, { resolve, reject });
        worker.postMessage({
          type: "previewRows",
          payload: {
            requestId,
            fileId,
            startRow: start,
            endRow: end,
          },
        });
      });
    },
    [previewRowsRequestIdRef, previewRowsRequestsRef, previewWorkerRef],
  );

  const ensurePreviewRows = useCallback(
    async (fileId, startRow, endRow) => {
      if (!previewFile?.rowCount || !Number.isFinite(previewFile.rowCount)) return;
      if (!fileId) return;

      const totalRows = Math.max(0, Math.floor(previewFile.rowCount));
      const start = Math.max(0, Math.min(totalRows, Math.floor(startRow || 0)));
      const end = Math.max(start, Math.min(totalRows, Math.floor(endRow || 0)));
      if (start >= end) return;

      const firstChunkStart =
        Math.floor(start / DA_PREVIEW_UI_CHUNK_SIZE_ROWS) *
        DA_PREVIEW_UI_CHUNK_SIZE_ROWS;
      const lastChunkStart =
        Math.floor((end - 1) / DA_PREVIEW_UI_CHUNK_SIZE_ROWS) *
        DA_PREVIEW_UI_CHUNK_SIZE_ROWS;

      const requests = [];

      for (
        let chunkStart = firstChunkStart;
        chunkStart <= lastChunkStart;
        chunkStart += DA_PREVIEW_UI_CHUNK_SIZE_ROWS
      ) {
        if (previewLoadedChunksRef.current.has(chunkStart)) {
          // Touch existing chunk so LRU eviction keeps recently revisited windows.
          previewLoadedChunksRef.current.delete(chunkStart);
          previewLoadedChunksRef.current.add(chunkStart);
          continue;
        }

        previewLoadedChunksRef.current.add(chunkStart);

        while (
          previewLoadedChunksRef.current.size >
          DA_PREVIEW_MAX_CACHED_UI_CHUNKS_PER_FILE
        ) {
          const evictChunkStart = previewLoadedChunksRef.current.values().next()
            .value;
          if (evictChunkStart === undefined) break;

          previewLoadedChunksRef.current.delete(evictChunkStart);
          for (
            let rowIndex = evictChunkStart;
            rowIndex < evictChunkStart + DA_PREVIEW_UI_CHUNK_SIZE_ROWS;
            rowIndex += 1
          ) {
            previewRowsCacheRef.current.delete(rowIndex);
          }
        }

        const chunkEnd = Math.min(
          totalRows,
          chunkStart + DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
        );

        const nextRequest = requestPreviewRowsRange(fileId, chunkStart, chunkEnd).catch(
          (error) => {
            previewLoadedChunksRef.current.delete(chunkStart);
            throw error;
          },
        );

        requests.push(nextRequest);
      }

      if (!requests.length) return;
      await Promise.all(requests);
    },
    [
      previewFile,
      previewLoadedChunksRef,
      previewRowsCacheRef,
      requestPreviewRowsRange,
    ],
  );

  const handlePreviewFileSelected = useCallback(
    (fileId) => {
      const nextFileId = typeof fileId === "string" ? fileId : null;
      if (!nextFileId || !rawDataById.has(nextFileId)) return;
      setSelectedPreviewFileId(nextFileId);
    },
    [rawDataById, setSelectedPreviewFileId],
  );

  return {
    cancelPendingPreviewRowRequests,
    clearPreviewState,
    disposePreviewFileCache,
    ensurePreviewRows,
    getPreviewRow,
    getPreviewRowsVersion,
    handlePreviewFileSelected,
    invalidatePreviewRequests,
    rawDataById,
    rawDataByIdRef,
    resetPreviewWorker,
    subscribePreviewRowsVersion,
  };
};
