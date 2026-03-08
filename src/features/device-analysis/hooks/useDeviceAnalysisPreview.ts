import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { TranslateFn } from "../../../context/language-context";
import {
  DA_PREVIEW_MAX_CACHED_FILES,
  DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
  DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
} from "../lib/deviceAnalysisPreviewLimits";
import { usePreviewRowsVersion } from "./usePreviewRowsVersion";

type PreviewStatusState = "idle" | "loading" | "ready" | "error";

type PreviewStatus = {
  state: PreviewStatusState;
  message: string;
};

type PreviewFile = {
  fileId: string;
  fileName: string;
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
};

type RawDataEntry = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  [key: string]: unknown;
};

type PreviewRowsRequest = {
  reject: (error: unknown) => void;
  resolve: (rows: unknown[][]) => void;
};

type PreviewResultPayload = {
  requestId: number;
  fileId: string;
  fileName: string;
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
};

type PreviewRowsResultPayload = {
  requestId: number;
  fileId: string;
  startRow: number;
  rows: unknown[][];
};

type WorkerErrorPayload = {
  requestId: number;
  message: string;
};

type WorkerMessage =
  | { type: "previewResult"; payload: PreviewResultPayload }
  | { type: "previewRowsResult"; payload: PreviewRowsResultPayload }
  | { type: "workerError"; payload: WorkerErrorPayload }
  | { type?: string; payload?: Record<string, unknown> | null };

type UseDeviceAnalysisPreviewOptions = {
  rawData?: RawDataEntry[];
  selectedPreviewFileId?: string | null;
  setSelectedPreviewFileId?: Dispatch<SetStateAction<string | null>>;
  previewFile?: PreviewFile | null;
  setPreviewFile?: Dispatch<SetStateAction<PreviewFile | null>>;
  setPreviewStatus?: Dispatch<SetStateAction<PreviewStatus>>;
  previewWorkerRef?: MutableRefObject<Worker | null>;
  previewRequestIdRef?: MutableRefObject<number>;
  previewRowsRequestIdRef?: MutableRefObject<number>;
  previewRowsRequestsRef?: MutableRefObject<Map<number, PreviewRowsRequest>>;
  previewRowsCacheByFileIdRef?: MutableRefObject<Map<string, Map<number, unknown[]>>>;
  previewLoadedChunksByFileIdRef?: MutableRefObject<Map<string, Set<number>>>;
  previewRowsCacheRef?: MutableRefObject<Map<number, unknown[]>>;
  previewLoadedChunksRef?: MutableRefObject<Set<number>>;
  previewCacheFileIdRef?: MutableRefObject<string | null>;
  previewCacheFileLruRef?: MutableRefObject<Set<string>>;
  t: TranslateFn;
};

const PREVIEW_STATUS_IDLE: PreviewStatus = { state: "idle", message: "" };
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
}: UseDeviceAnalysisPreviewOptions) => {
  const {
    cancelPreviewRowsVersionNotification,
    getPreviewRowsVersion,
    notifyPreviewRowsVersion,
    subscribePreviewRowsVersion,
  } = usePreviewRowsVersion();

  const deferredSelectedPreviewFileId = useDeferredValue(selectedPreviewFileId);

  const rawDataById = useMemo(() => {
    const map = new Map<string, RawDataEntry>();

    for (const entry of Array.isArray(rawData) ? rawData : []) {
      const fileId = entry?.fileId;
      if (typeof fileId !== "string") continue;
      map.set(fileId, entry);
    }

    return map;
  }, [rawData]);

  const rawDataByIdRef = useRef(new Map<string, RawDataEntry>());

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
    ({
      fileId = null,
      loadedChunks = new Set<number>(),
      rowCache = new Map<number, unknown[]>(),
    }: {
      fileId?: string | null;
      loadedChunks?: Set<number>;
      rowCache?: Map<number, unknown[]>;
    } = {}) => {
      previewCacheFileIdRef.current = fileId;
      previewRowsCacheRef.current = rowCache;
      previewLoadedChunksRef.current = loadedChunks;
    },
    [previewCacheFileIdRef, previewLoadedChunksRef, previewRowsCacheRef],
  );

  const postPreviewDispose = useCallback(
    (fileId: string) => {
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
    ({ clearSelection = false }: { clearSelection?: boolean } = {}) => {
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
    (fileId: string) => {
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
    (fileId: string | null) => {
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
        const oldestFileId = fileLru.values().next().value as string | undefined;
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
    (event: MessageEvent<WorkerMessage>) => {
      const { type, payload } = event.data ?? {};

      if (type === "previewResult" && payload) {
        const previewPayload = payload as PreviewResultPayload;
        if (previewPayload.requestId !== previewRequestIdRef.current) return;

        const fileId =
          typeof previewPayload.fileId === "string" ? previewPayload.fileId : null;
        activatePreviewFileCache(fileId);

        startTransition(() => {
          setPreviewFile({
            fileId: String(fileId || ""),
            fileName: String(previewPayload.fileName || ""),
            rowCount: Number(previewPayload.rowCount) || 0,
            columnCount: Number(previewPayload.columnCount) || 0,
            maxCellLengths: Array.isArray(previewPayload.maxCellLengths)
              ? previewPayload.maxCellLengths.map((n) => Number(n) || 0)
              : [],
          });
          setPreviewStatus({ state: "ready", message: "" });
        });
        return;
      }

      if (type === "previewRowsResult" && payload) {
        const rowsPayload = payload as PreviewRowsResultPayload;
        const requestId = Number(rowsPayload.requestId);
        if (!Number.isFinite(requestId)) return;

        const pendingRequest = previewRowsRequestsRef.current.get(requestId);
        if (!pendingRequest) return;

        previewRowsRequestsRef.current.delete(requestId);

        const { reject, resolve } = pendingRequest;

        try {
          const fileId =
            typeof rowsPayload.fileId === "string" ? rowsPayload.fileId : null;
          const startRow = Number(rowsPayload.startRow) || 0;
          const rows = Array.isArray(rowsPayload.rows) ? rowsPayload.rows : [];

          if (fileId && previewCacheFileIdRef.current !== fileId) {
            resolve([]);
            return;
          }

          for (let index = 0; index < rows.length; index += 1) {
            const row = Array.isArray(rows[index]) ? rows[index] : [];
            previewRowsCacheRef.current.set(startRow + index, row);
          }

          notifyPreviewRowsVersion();
          resolve(rows.map((row) => (Array.isArray(row) ? row : [])));
        } catch (error) {
          reject(error);
        }

        return;
      }

      if (type === "workerError" && payload) {
        const errorPayload = payload as WorkerErrorPayload;
        const requestId = Number(errorPayload.requestId);
        if (!Number.isFinite(requestId)) return;
        const errorMessage =
          typeof errorPayload.message === "string" && errorPayload.message
            ? errorPayload.message
            : "Unknown worker error";

        if (
          requestId !== previewRequestIdRef.current &&
          !previewRowsRequestsRef.current.has(requestId)
        ) {
          return;
        }

        if (previewRowsRequestsRef.current.has(requestId)) {
          const pendingRequest = previewRowsRequestsRef.current.get(requestId);
          previewRowsRequestsRef.current.delete(requestId);
          pendingRequest?.reject?.(new Error(errorMessage));
          return;
        }

        console.error("Preview worker error:", errorMessage);
        startTransition(() => {
          setPreviewStatus({
            state: "error",
            message: errorMessage,
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
      new URL("../workers/deviceAnalysis.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = handlePreviewWorkerMessage;
    previewWorkerRef.current = worker;
    return worker;
  }, [handlePreviewWorkerMessage, previewWorkerRef]);

  // Avoid paying worker startup cost on app cold start before preview is needed.
  const getOrCreatePreviewWorker = useCallback(() => {
    if (previewWorkerRef.current) return previewWorkerRef.current;
    return createPreviewWorker();
  }, [createPreviewWorker, previewWorkerRef]);

  const resetPreviewWorker = useCallback(() => {
    cancelPendingPreviewRowRequests();

    if (previewWorkerRef.current) {
      previewWorkerRef.current.terminate();
      previewWorkerRef.current = null;
    }
  }, [cancelPendingPreviewRowRequests, previewWorkerRef]);

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

    const targetFile = rawDataById.get(String(effectiveFileId ?? "")) ?? null;
    if (!targetFile?.file || !targetFile?.fileId) return;
    if (previewFile?.fileId === targetFile.fileId) return;

    const worker = getOrCreatePreviewWorker();
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
    getOrCreatePreviewWorker,
    invalidatePreviewRequests,
    previewFile?.fileId,
    previewRequestIdRef,
    rawData,
    rawDataById,
    setPreviewStatus,
    t,
  ]);

  const getPreviewRow = useCallback(
    (rowIndex: number): unknown[] | null => {
      const normalizedIndex = Number(rowIndex);
      if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) return null;
      return previewRowsCacheRef.current.get(normalizedIndex) ?? null;
    },
    [previewRowsCacheRef],
  );

  const requestPreviewRowsRange = useCallback(
    (fileId: string, startRow: number, endRow: number): Promise<unknown[][]> => {
      const worker = getOrCreatePreviewWorker();
      if (!worker || !fileId) return Promise.resolve([]);

      const requestId = previewRowsRequestIdRef.current + 1;
      previewRowsRequestIdRef.current = requestId;

      const start = Math.max(0, Math.floor(Number(startRow) || 0));
      const end = Math.max(start, Math.floor(Number(endRow) || start));

      return new Promise<unknown[][]>((resolve, reject) => {
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
    [
      getOrCreatePreviewWorker,
      previewRowsRequestIdRef,
      previewRowsRequestsRef,
    ],
  );

  const ensurePreviewRows = useCallback(
    async (fileId: string, startRow: number, endRow: number) => {
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

      const requests: Array<Promise<unknown[][]>> = [];

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
            .value as number | undefined;
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

        const nextRequest = requestPreviewRowsRange(
          fileId,
          chunkStart,
          chunkEnd,
        ).catch((error) => {
          previewLoadedChunksRef.current.delete(chunkStart);
          throw error;
        });

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
    (fileId: unknown) => {
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
