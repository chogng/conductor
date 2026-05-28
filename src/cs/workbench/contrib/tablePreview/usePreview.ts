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
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { PreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import {
  DA_PREVIEW_MAX_CACHED_FILES,
  DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
  DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
} from "./preview/previewLimits";
import type {
  PreviewFile,
  PreviewRowsRequest,
  RawDataEntry,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import {
  collectMissingChunkRanges,
  clearChunkRows,
  hasChunkRowsInCache,
  isPreviewRowsResultForRequest,
  mergeChunkRangeRows,
  sanitizePreviewRows,
} from "./preview/previewRowChunk";
import {
  buildRustPreviewCellRequests,
  rowsFromRustPreviewCells,
  type RustPreviewCellRequest,
} from "./preview/rustPreviewCells";
import { usePreviewRowsVersion } from "./usePreviewRowsVersion";
import { loadConvertedCsvFile } from "src/cs/workbench/contrib/import/browser/rustClient";

type PreviewResultPayload = {
  requestId: number;
  fileId: string;
  fileName: string;
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
  seedRows?: unknown[][];
  seedStartRow?: number;
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

type UsePreviewOptions = {
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
const PREVIEW_ROWS_FETCH_MAX_ATTEMPTS = 2;
const PREVIEW_ROWS_MAX_MERGED_REQUEST_ROWS = Math.max(
  DA_PREVIEW_UI_CHUNK_SIZE_ROWS * 8,
  400,
);

export const usePreview = ({
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
}: UsePreviewOptions) => {
  const {
    cancelPreviewRowsVersionNotification,
    getPreviewRowsVersion,
    notifyPreviewRowsVersion,
    subscribePreviewRowsVersion,
  } = usePreviewRowsVersion();

  const deferredSelectedPreviewFileId = useDeferredValue(selectedPreviewFileId);
  const previewPendingChunksByFileIdRef = useRef<Map<string, Set<number>>>(
    new Map(),
  );
  const rustPreviewFileIdsRef = useRef<Set<string>>(new Set());

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

  const getOrCreatePreviewFileCaches = useCallback(
    (fileId: string) => {
      const cacheByFileId = previewRowsCacheByFileIdRef.current;
      const chunksByFileId = previewLoadedChunksByFileIdRef.current;

      let rowCache = cacheByFileId.get(fileId);
      if (!rowCache) {
        rowCache = new Map<number, unknown[]>();
        cacheByFileId.set(fileId, rowCache);
      }

      let loadedChunks = chunksByFileId.get(fileId);
      if (!loadedChunks) {
        loadedChunks = new Set<number>();
        chunksByFileId.set(fileId, loadedChunks);
      }

      return { loadedChunks, rowCache };
    },
    [previewLoadedChunksByFileIdRef, previewRowsCacheByFileIdRef],
  );

  const getOrCreatePendingChunks = useCallback((fileId: string) => {
    const pendingByFileId = previewPendingChunksByFileIdRef.current;
    let pendingChunks = pendingByFileId.get(fileId);
    if (!pendingChunks) {
      pendingChunks = new Set<number>();
      pendingByFileId.set(fileId, pendingChunks);
    }
    return pendingChunks;
  }, []);

  const mergePreviewSeedRows = useCallback(
    (fileId: string, startRow: number, rows: unknown[][]) => {
      if (!fileId) return false;
      const safeRows = sanitizePreviewRows(rows);
      if (!safeRows.length) return false;

      const { loadedChunks, rowCache } = getOrCreatePreviewFileCaches(fileId);
      const safeStart = Math.max(0, Math.floor(Number(startRow) || 0));
      const merged = mergeChunkRangeRows({
        rowCache,
        loadedChunks,
        rangeStart: safeStart,
        rangeEnd: safeStart + safeRows.length,
        rows: safeRows,
        chunkSize: DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
        maxChunks: DA_PREVIEW_MAX_CACHED_UI_CHUNKS_PER_FILE,
      });
      return merged.complete;
    },
    [getOrCreatePreviewFileCaches],
  );

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
    previewPendingChunksByFileIdRef.current = new Map();
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
      rustPreviewFileIdsRef.current.delete(fileId);
      void (globalThis.window as any)?.desktopImport?.disposeDeviceAnalysisFileWithRust?.({
        fileId,
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
    previewPendingChunksByFileIdRef.current = new Map();
    rustPreviewFileIdsRef.current = new Set();
    void (globalThis.window as any)?.desktopImport?.disposeDeviceAnalysisFileWithRust?.({
      clear: true,
    });
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
    previewPendingChunksByFileIdRef.current = new Map();
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
      previewPendingChunksByFileIdRef.current.delete(fileId);

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

  const touchPreviewFileCache = useCallback(
    ({
      activateCurrent = false,
      fileId,
    }: {
      activateCurrent?: boolean;
      fileId: string | null;
    }) => {
      if (!fileId) {
        if (activateCurrent) {
          previewCacheFileLruRef.current = new Set();
          assignCurrentPreviewCache();
        }
        return;
      }

      const { loadedChunks, rowCache } = getOrCreatePreviewFileCaches(fileId);

      if (activateCurrent) {
        assignCurrentPreviewCache({ fileId, loadedChunks, rowCache });
      }

      const fileLru = previewCacheFileLruRef.current;
      fileLru.delete(fileId);
      fileLru.add(fileId);

      while (fileLru.size > DA_PREVIEW_MAX_CACHED_FILES) {
        const oldestFileId = fileLru.values().next().value as string | undefined;
        if (!oldestFileId || (activateCurrent && oldestFileId === fileId)) break;

        disposePreviewFileCache(oldestFileId);
      }
    },
    [
      assignCurrentPreviewCache,
      disposePreviewFileCache,
      getOrCreatePreviewFileCaches,
      previewCacheFileLruRef,
    ],
  );

  const activatePreviewFileCache = useCallback(
    (fileId: string | null) => {
      touchPreviewFileCache({ activateCurrent: true, fileId });
    },
    [touchPreviewFileCache],
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
        if (fileId) {
          mergePreviewSeedRows(
            fileId,
            Number(previewPayload.seedStartRow) || 0,
            Array.isArray(previewPayload.seedRows) ? previewPayload.seedRows : [],
          );
        }

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
            typeof rowsPayload.fileId === "string" ? rowsPayload.fileId : "";
          const startRow = Math.max(
            0,
            Math.floor(Number(rowsPayload.startRow) || 0),
          );
          const rows = sanitizePreviewRows(rowsPayload.rows);

          const isMatched = isPreviewRowsResultForRequest({
            requestFileId: pendingRequest.fileId,
            requestStartRow: pendingRequest.startRow,
            payloadFileId: fileId,
            payloadStartRow: startRow,
          });
          if (!isMatched) {
            resolve([]);
            return;
          }

          resolve(rows);
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
      mergePreviewSeedRows,
      previewRowsRequestsRef,
      previewRequestIdRef,
      setPreviewFile,
      setPreviewStatus,
    ],
  );

  const createPreviewWorker = useCallback(() => {
    const worker = new Worker(
      new URL("../workers/analysis.worker.ts", import.meta.url),
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
    return () => {
      invalidatePreviewRequests();
      clearAllPreviewCaches();
      resetPreviewWorker();
    };
  }, [clearAllPreviewCaches, invalidatePreviewRequests, resetPreviewWorker]);

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

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;

    startTransition(() => {
      setPreviewStatus({ state: "loading", message: t("da_preview_loading") });
    });

    const postWorkerPreview = async () => {
      const worker = getOrCreatePreviewWorker();
      if (!worker) return;
      const fallbackFile =
        (await loadConvertedCsvFile({
          fallbackFile: targetFile.file,
          fileName: targetFile.fileName,
          lastModified:
            targetFile.file instanceof File ? targetFile.file.lastModified : null,
          normalizedCsvPath: targetFile.normalizedCsvPath,
        })) ?? targetFile.file;

      worker.postMessage({
        type: "preview",
        payload: {
          requestId,
          fileId: targetFile.fileId,
          file: fallbackFile,
          maxPreviewRows: DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
        },
      });
    };

    const bridge = (globalThis.window as any)?.desktopImport;
    const rustInputPath =
      typeof targetFile.normalizedCsvPath === "string" &&
      targetFile.normalizedCsvPath.trim()
        ? targetFile.normalizedCsvPath.trim()
        : typeof targetFile.sourcePath === "string" &&
            targetFile.sourcePath.trim().toLowerCase().endsWith(".csv")
          ? targetFile.sourcePath.trim()
          : null;
    if (rustInputPath && bridge?.openDeviceAnalysisFileWithRust) {
      void bridge
        .openDeviceAnalysisFileWithRust({
          fileId: targetFile.fileId,
          fileName: targetFile.fileName ?? "",
          path: rustInputPath,
          seedRows: DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
        })
        .then((response: any) => {
          if (!response?.ok || !response?.result) {
            if (requestId === previewRequestIdRef.current) {
              void postWorkerPreview();
            }
            return;
          }

          const previewPayload = response.result as PreviewResultPayload;
          const fileId =
            typeof previewPayload.fileId === "string" ? previewPayload.fileId : null;
          if (fileId) {
            rustPreviewFileIdsRef.current.add(fileId);
            touchPreviewFileCache({ fileId });
            mergePreviewSeedRows(
              fileId,
              Number(previewPayload.seedStartRow) || 0,
              Array.isArray(previewPayload.seedRows)
                ? previewPayload.seedRows
                : [],
            );
          }
          if (requestId !== previewRequestIdRef.current) {
            return;
          }

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
        })
        .catch(() => {
          if (requestId === previewRequestIdRef.current) {
            void postWorkerPreview();
          }
        });
      return;
    }

    void postWorkerPreview();
  }, [
    activatePreviewFileCache,
    clearPreviewState,
    deferredSelectedPreviewFileId,
    getOrCreatePreviewWorker,
    invalidatePreviewRequests,
    mergePreviewSeedRows,
    previewFile?.fileId,
    previewRequestIdRef,
    rawData,
    rawDataById,
    setPreviewStatus,
    t,
    touchPreviewFileCache,
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
      if (!fileId) return Promise.resolve([]);

      const requestId = previewRowsRequestIdRef.current + 1;
      previewRowsRequestIdRef.current = requestId;

      const start = Math.max(0, Math.floor(Number(startRow) || 0));
      const end = Math.max(start, Math.floor(Number(endRow) || start));

      const bridge = (globalThis.window as any)?.desktopImport;
      const requestRowsWithWorker = () => {
        const worker = getOrCreatePreviewWorker();
        if (!worker) return Promise.resolve([]);

        return new Promise<unknown[][]>((resolve, reject) => {
          previewRowsRequestsRef.current.set(requestId, {
            endRow: end,
            fileId,
            reject,
            resolve,
            startRow: start,
          });
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
      };

      if (
        rustPreviewFileIdsRef.current.has(fileId) &&
        bridge?.getDeviceAnalysisPreviewRowsWithRust
      ) {
        return bridge
          .getDeviceAnalysisPreviewRowsWithRust({
            endRow: end,
            fileId,
            startRow: start,
          })
          .then((response: any) => {
            if (!response?.ok || !response?.result) return [];
            const rowsPayload = response.result as PreviewRowsResultPayload;
            const rows = sanitizePreviewRows(rowsPayload.rows);
            const payloadFileId =
              typeof rowsPayload.fileId === "string" ? rowsPayload.fileId : "";
            const payloadStartRow = Math.max(
              0,
              Math.floor(Number(rowsPayload.startRow) || 0),
            );
            const isMatched = isPreviewRowsResultForRequest({
              requestFileId: fileId,
              requestStartRow: start,
              payloadFileId,
              payloadStartRow,
            });
            return isMatched ? rows : requestRowsWithWorker();
          })
          .catch(() => requestRowsWithWorker());
      }

      return requestRowsWithWorker();
    },
    [
      getOrCreatePreviewWorker,
      previewRowsRequestIdRef,
      previewRowsRequestsRef,
    ],
  );

  const ensurePreviewCells = useCallback(
    async (fileId: string, cells: RustPreviewCellRequest[]) => {
      if (!fileId || !Array.isArray(cells) || !cells.length) return;
      if (!previewFile?.rowCount || !Number.isFinite(previewFile.rowCount)) return;

      const totalRows = Math.max(0, Math.floor(previewFile.rowCount));
      const columnCount = Math.max(
        0,
        Math.floor(Number(previewFile.columnCount) || 0),
      );
      if (totalRows <= 0 || columnCount <= 0) return;

      const { rowCache } = getOrCreatePreviewFileCaches(fileId);
      const requestedRows = new Set<number>();
      for (const cell of cells) {
        const rowIndex = Math.floor(Number(cell?.rowIndex));
        const colIndex = Math.floor(Number(cell?.colIndex));
        if (
          !Number.isInteger(rowIndex) ||
          rowIndex < 0 ||
          rowIndex >= totalRows ||
          !Number.isInteger(colIndex) ||
          colIndex < 0 ||
          colIndex >= columnCount
        ) {
          continue;
        }
        if (!Array.isArray(rowCache.get(rowIndex))) {
          requestedRows.add(rowIndex);
        }
      }
      if (!requestedRows.size) return;

      const bridge = (globalThis.window as any)?.desktopImport;
      if (
        rustPreviewFileIdsRef.current.has(fileId) &&
        bridge?.readDeviceAnalysisCellsWithRust
      ) {
        const requestCells = buildRustPreviewCellRequests({
          columnCount,
          rowIndices: requestedRows,
        });
        if (requestCells.length > 0) {
          try {
            const response = await bridge.readDeviceAnalysisCellsWithRust({
              cells: requestCells,
              fileId,
            });
            if (response?.ok && response?.result) {
              const rowsByIndex = rowsFromRustPreviewCells({
                cells: response.result.cells,
                columnCount,
              });
              if (rowsByIndex.size === requestedRows.size) {
                for (const [rowIndex, row] of rowsByIndex.entries()) {
                  rowCache.set(rowIndex, row);
                }
                if (previewCacheFileIdRef.current === fileId) {
                  notifyPreviewRowsVersion();
                }
                return;
              }
            }
          } catch {
            // Fall through to the existing preview-row path.
          }
        }
      }

      const sortedRows = Array.from(requestedRows).sort((a, b) => a - b);
      const ranges: Array<[number, number]> = [];
      for (const rowIndex of sortedRows) {
        const last = ranges[ranges.length - 1];
        if (last && rowIndex <= last[1]) {
          last[1] = Math.max(last[1], rowIndex + 1);
        } else {
          ranges.push([rowIndex, rowIndex + 1]);
        }
      }

      let changed = false;
      for (const [rangeStart, rangeEnd] of ranges) {
        const rows = await requestPreviewRowsRange(fileId, rangeStart, rangeEnd);
        for (let index = 0; index < rows.length; index += 1) {
          rowCache.set(rangeStart + index, rows[index]);
          changed = true;
        }
      }

      if (changed && previewCacheFileIdRef.current === fileId) {
        notifyPreviewRowsVersion();
      }
    },
    [
      getOrCreatePreviewFileCaches,
      notifyPreviewRowsVersion,
      previewCacheFileIdRef,
      previewFile?.columnCount,
      previewFile?.rowCount,
      requestPreviewRowsRange,
    ],
  );

  const ensurePreviewRows = useCallback(
    async (fileId: string, startRow: number, endRow: number) => {
      if (!previewFile?.rowCount || !Number.isFinite(previewFile.rowCount)) return;
      if (!fileId) return;

      const { loadedChunks, rowCache } = getOrCreatePreviewFileCaches(fileId);
      const pendingChunks = getOrCreatePendingChunks(fileId);
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

      for (
        let chunkStart = firstChunkStart;
        chunkStart <= lastChunkStart;
        chunkStart += DA_PREVIEW_UI_CHUNK_SIZE_ROWS
      ) {
        const chunkEnd = Math.min(
          totalRows,
          chunkStart + DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
        );
        if (!hasChunkRowsInCache(rowCache, chunkStart, chunkEnd)) continue;
        // Treat row-presence as source of truth; loadedChunks is only an LRU index.
        loadedChunks.delete(chunkStart);
        loadedChunks.add(chunkStart);
      }

      const missingRanges = collectMissingChunkRanges({
        rowCache,
        pendingChunks,
        startRow: start,
        endRow: end,
        chunkSize: DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
        maxRangeRows: PREVIEW_ROWS_MAX_MERGED_REQUEST_ROWS,
      });

      let shouldNotifyPreviewRows = false;
      const requests: Array<Promise<void>> = [];

      for (const range of missingRanges) {
        const rangeStart = Math.max(0, Math.floor(Number(range.rangeStart) || 0));
        const rangeEnd = Math.max(rangeStart, Math.floor(Number(range.rangeEnd) || rangeStart));
        const chunkStarts = Array.isArray(range.chunkStarts)
          ? range.chunkStarts.map((value: number) =>
              Math.max(0, Math.floor(Number(value) || 0)),
            )
          : [];
        if (!chunkStarts.length || rangeStart >= rangeEnd) continue;

        for (const chunkStart of chunkStarts) {
          loadedChunks.delete(chunkStart);
          pendingChunks.add(chunkStart);
        }

        const nextRequest = (async () => {
          const expectedRows = Math.max(0, rangeEnd - rangeStart);
          let rows: unknown[][] = [];

          for (
            let attempt = 1;
            attempt <= PREVIEW_ROWS_FETCH_MAX_ATTEMPTS;
            attempt += 1
          ) {
            rows = await requestPreviewRowsRange(fileId, rangeStart, rangeEnd);
            if (rows.length === expectedRows) break;
          }

          const merged = mergeChunkRangeRows({
            rowCache,
            loadedChunks,
            rangeStart,
            rangeEnd,
            rows,
            chunkSize: DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
            maxChunks: DA_PREVIEW_MAX_CACHED_UI_CHUNKS_PER_FILE,
          });
          if (!merged.complete) return;

          if (
            previewCacheFileIdRef.current === fileId &&
            merged.mergedChunkStarts.length > 0
          ) {
            shouldNotifyPreviewRows = true;
          }
        })()
          .catch(() => {
            for (const chunkStart of chunkStarts) {
              clearChunkRows(
                rowCache,
                chunkStart,
                chunkStart + DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
              );
              loadedChunks.delete(chunkStart);
            }
          })
          .finally(() => {
            for (const chunkStart of chunkStarts) {
              pendingChunks.delete(chunkStart);
            }
          });

        requests.push(nextRequest);
      }

      if (!requests.length) return;
      await Promise.all(requests);

      if (shouldNotifyPreviewRows) {
        notifyPreviewRowsVersion();
      }
    },
    [
      getOrCreatePendingChunks,
      getOrCreatePreviewFileCaches,
      notifyPreviewRowsVersion,
      previewCacheFileIdRef,
      previewFile,
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
    ensurePreviewCells,
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
