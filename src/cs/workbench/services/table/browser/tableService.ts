import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { MutableState, PreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import type {
  PreviewFile,
  PreviewRowsRequest,
  RawDataEntry,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import {
  ITableService,
  type ITableService as ITableServiceType,
  type TableBindings,
  type TableOptions,
} from "src/cs/workbench/services/table/common/table";
import {
  DA_PREVIEW_MAX_CACHED_FILES,
  DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
  DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
} from "src/cs/workbench/services/table/browser/preview/previewLimits";
import {
  collectMissingChunkRanges,
  clearChunkRows,
  hasChunkRowsInCache,
  isPreviewRowsResultForRequest,
  mergeChunkRangeRows,
  sanitizePreviewRows,
} from "src/cs/workbench/services/table/browser/preview/previewRowChunk";
import {
  buildRustPreviewCellRequests,
  rowsFromRustPreviewCells,
  type RustPreviewCellRequest,
} from "src/cs/workbench/services/table/browser/preview/rustPreviewCells";
import { usePreviewRowsVersion } from "src/cs/workbench/services/table/browser/previewRowsVersion";
import { loadConvertedCsvFile } from "src/cs/workbench/contrib/import/browser/rustClient";
import { importService } from "src/cs/workbench/services/import/browser/importService";

type SetStateAction<T> = T | ((previous: T) => T);
type Dispatch<T> = (value: T) => void;

type EffectState = {
  cleanup?: () => void;
  deps?: unknown[];
};

type PendingEffect = {
  effect: () => void | (() => void);
  index: number;
  deps?: unknown[];
};

type MemoState<T> = {
  deps?: unknown[];
  value: T;
};

const areDepsEqual = (
  previous: readonly unknown[] | undefined,
  next: readonly unknown[] | undefined,
): boolean => {
  if (!previous || !next || previous.length !== next.length) return false;

  for (let index = 0; index < previous.length; index += 1) {
    if (!Object.is(previous[index], next[index])) return false;
  }

  return true;
};

class PreviewStateScope extends Disposable {
  private hookIndex = 0;
  private readonly effects: EffectState[] = [];
  private readonly memos: Array<MemoState<unknown> | undefined> = [];
  private readonly pendingEffects: PendingEffect[] = [];
  private readonly refs: Array<MutableState<unknown> | undefined> = [];

  public begin(): void {
    this.hookIndex = 0;
    this.pendingEffects.length = 0;
  }

  public flushEffects(): void {
    const pendingEffects = this.pendingEffects.splice(0);

    for (const pending of pendingEffects) {
      const previous = this.effects[pending.index];
      previous?.cleanup?.();
      const cleanup = pending.effect();
      this.effects[pending.index] = {
        cleanup: typeof cleanup === "function" ? cleanup : undefined,
        deps: pending.deps,
      };
    }
  }

  public runEffect(
    effect: () => void | (() => void),
    deps?: unknown[],
  ): void {
    const index = this.hookIndex;
    this.hookIndex += 1;

    const previous = this.effects[index];
    if (previous && areDepsEqual(previous.deps, deps)) return;

    this.pendingEffects.push({ deps, effect, index });
  }

  public memoValue<T>(factory: () => T, deps?: unknown[]): T {
    const index = this.hookIndex;
    this.hookIndex += 1;

    const previous = this.memos[index] as MemoState<T> | undefined;
    if (previous && areDepsEqual(previous.deps, deps)) {
      return previous.value;
    }

    const value = factory();
    this.memos[index] = { deps, value };
    return value;
  }

  public getMutableState<T>(current: T): MutableState<T> {
    const index = this.hookIndex;
    this.hookIndex += 1;

    const previous = this.refs[index] as MutableState<T> | undefined;
    if (previous) return previous;

    const ref = { current };
    this.refs[index] = ref;
    return ref;
  }

  public override dispose(): void {
    for (const effect of this.effects) {
      effect?.cleanup?.();
    }
    this.effects.length = 0;
    this.memos.length = 0;
    this.pendingEffects.length = 0;
    this.refs.length = 0;
    super.dispose();
  }
}

let activePreviewStateScope: PreviewStateScope | null = null;
const previewStateScopes = new WeakMap<object, PreviewStateScope>();
const defaultPreviewStateScopeKey = {};

const getPreviewStateScope = (key: object): PreviewStateScope => {
  let scope = previewStateScopes.get(key);
  if (!scope) {
    scope = new PreviewStateScope();
    previewStateScopes.set(key, scope);
  }
  return scope;
};

const getActivePreviewStateScope = (): PreviewStateScope => {
  if (!activePreviewStateScope) {
    throw new Error("Preview hook scope is not active");
  }
  return activePreviewStateScope;
};

const runWithPreviewStateScope = <T,>(
  scope: PreviewStateScope,
  callback: () => T,
): T => {
  const previousScope = activePreviewStateScope;
  activePreviewStateScope = scope;
  scope.begin();

  try {
    const result = callback();
    scope.flushEffects();
    return result;
  } finally {
    activePreviewStateScope = previousScope;
  }
};

const runImmediately = (callback: () => void): void => callback();
const memoCallback = <T extends (...args: any[]) => any>(
  callback: T,
  deps?: unknown[],
): T => getActivePreviewStateScope().memoValue(() => callback, deps);
const readImmediateValue = <T,>(value: T): T => value;
const runEffect = (
  effect: () => void | (() => void),
  deps?: unknown[],
): void => getActivePreviewStateScope().runEffect(effect, deps);
const memoValue = <T,>(factory: () => T, deps?: unknown[]): T =>
  getActivePreviewStateScope().memoValue(factory, deps);
const getMutableState = <T,>(current: T): MutableState<T> =>
  getActivePreviewStateScope().getMutableState(current);

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

type UsePreviewOptions = TableOptions;
type CreatePreviewOptions = {
  rawData?: RawDataEntry[];
  selectedPreviewFileId?: string | null;
  setSelectedPreviewFileId?: Dispatch<SetStateAction<string | null>>;
  previewFile?: PreviewFile | null;
  previewStatus?: PreviewStatus;
  setPreviewFile?: Dispatch<SetStateAction<PreviewFile | null>>;
  setPreviewStatus?: Dispatch<SetStateAction<PreviewStatus>>;
  previewWorkerRef?: MutableState<Worker | null>;
  previewRequestIdRef?: MutableState<number>;
  previewRowsRequestIdRef?: MutableState<number>;
  previewRowsRequestsRef?: MutableState<Map<number, PreviewRowsRequest>>;
  previewRowsCacheByFileIdRef?: MutableState<Map<string, Map<number, unknown[]>>>;
  previewLoadedChunksByFileIdRef?: MutableState<Map<string, Set<number>>>;
  previewRowsCacheRef?: MutableState<Map<number, unknown[]>>;
  previewLoadedChunksRef?: MutableState<Set<number>>;
  previewCacheFileIdRef?: MutableState<string | null>;
  previewCacheFileLruRef?: MutableState<Set<string>>;
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

const createPreviewBindings = ({
  rawData = [],
  selectedPreviewFileId = null,
  setSelectedPreviewFileId = () => {},
  previewFile = null,
  setPreviewFile = () => {},
  setPreviewStatus = () => {},
  previewWorkerRef = { current: null },
  previewRequestIdRef = { current: 0 },
  previewStatus = PREVIEW_STATUS_IDLE,
  previewRowsRequestIdRef = { current: 0 },
  previewRowsRequestsRef = { current: new Map() },
  previewRowsCacheByFileIdRef = { current: new Map() },
  previewLoadedChunksByFileIdRef = { current: new Map() },
  previewRowsCacheRef = { current: new Map() },
  previewLoadedChunksRef = { current: new Set() },
  previewCacheFileIdRef = { current: null },
  previewCacheFileLruRef = { current: new Set() },
  t,
}: CreatePreviewOptions) => {
  const {
    cancelPreviewRowsVersionNotification,
    getPreviewRowsVersion,
    notifyPreviewRowsVersion,
    subscribePreviewRowsVersion,
  } = memoValue(() => usePreviewRowsVersion(), []);

  const deferredSelectedPreviewFileId = readImmediateValue(selectedPreviewFileId);
  const previewStatusRef = getMutableState<PreviewStatus>(previewStatus);
  const previewFileRef = getMutableState<PreviewFile | null>(previewFile);
  const previewPendingChunksByFileIdRef = getMutableState<Map<string, Set<number>>>(
    new Map(),
  );
  const rustPreviewFileIdsRef = getMutableState<Set<string>>(new Set());
  const pendingPreviewFileIdRef = getMutableState<string | null>(null);

  const rawDataById = memoValue(() => {
    const map = new Map<string, RawDataEntry>();

    for (const entry of Array.isArray(rawData) ? rawData : []) {
      const fileId = entry?.fileId;
      if (typeof fileId !== "string") continue;
      map.set(fileId, entry);
    }

    return map;
  }, [rawData]);

  const rawDataByIdRef = getMutableState(new Map<string, RawDataEntry>());

  runEffect(() => {
    rawDataByIdRef.current = rawDataById;
  }, [rawDataById]);

  runEffect(() => {
    previewStatusRef.current = previewStatus;
    previewFileRef.current = previewFile;
  }, [previewStatus, previewFile]);

  const clearPendingPreviewRequest = memoCallback((requestId: number) => {
    if (requestId === previewRequestIdRef.current) {
      pendingPreviewFileIdRef.current = null;
    }
  }, [previewRequestIdRef]);

  const getOrCreatePreviewFileCaches = memoCallback(
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

  const getOrCreatePendingChunks = memoCallback((fileId: string) => {
    const pendingByFileId = previewPendingChunksByFileIdRef.current;
    let pendingChunks = pendingByFileId.get(fileId);
    if (!pendingChunks) {
      pendingChunks = new Set<number>();
      pendingByFileId.set(fileId, pendingChunks);
    }
    return pendingChunks;
  }, []);

  const mergePreviewSeedRows = memoCallback(
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

  const cancelPendingPreviewRowRequests = memoCallback(() => {
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

  const notifyPreviewRowsCacheChanged = memoCallback(() => {
    cancelPreviewRowsVersionNotification();
    notifyPreviewRowsVersion();
  }, [cancelPreviewRowsVersionNotification, notifyPreviewRowsVersion]);

  const assignCurrentPreviewCache = memoCallback(
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

  const postPreviewDispose = memoCallback(
    (fileId: string) => {
      if (typeof fileId !== "string" || !fileId) return;

      previewWorkerRef.current?.postMessage({
        type: "previewDispose",
        payload: { fileId },
      });
      rustPreviewFileIdsRef.current.delete(fileId);
      if (importService.canDisposeFile()) {
        void importService.disposeFile({ fileId });
      }
    },
    [previewWorkerRef],
  );

  const resetCurrentPreviewCache = memoCallback(() => {
    assignCurrentPreviewCache();
    notifyPreviewRowsCacheChanged();
  }, [assignCurrentPreviewCache, notifyPreviewRowsCacheChanged]);

  const clearAllPreviewCaches = memoCallback(() => {
    previewRowsCacheByFileIdRef.current = new Map();
    previewLoadedChunksByFileIdRef.current = new Map();
    previewCacheFileLruRef.current = new Set();
    previewPendingChunksByFileIdRef.current = new Map();
    rustPreviewFileIdsRef.current = new Set();
    if (importService.canDisposeFile()) {
      void importService.disposeFile({ clear: true });
    }
    assignCurrentPreviewCache();
    notifyPreviewRowsCacheChanged();
  }, [
    assignCurrentPreviewCache,
    notifyPreviewRowsCacheChanged,
    previewCacheFileLruRef,
    previewLoadedChunksByFileIdRef,
    previewRowsCacheByFileIdRef,
  ]);

  const invalidatePreviewRequests = memoCallback(() => {
    previewRequestIdRef.current += 1;
    cancelPendingPreviewRowRequests();
    pendingPreviewFileIdRef.current = null;
    previewPendingChunksByFileIdRef.current = new Map();
  }, [cancelPendingPreviewRowRequests, previewRequestIdRef]);

  const clearPreviewState = memoCallback(
    ({ clearSelection = false }: { clearSelection?: boolean } = {}) => {
      setPreviewFile(null);
      setPreviewStatus(PREVIEW_STATUS_IDLE);
      pendingPreviewFileIdRef.current = null;

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

  const disposePreviewFileCache = memoCallback(
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

  const touchPreviewFileCache = memoCallback(
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

  const activatePreviewFileCache = memoCallback(
    (fileId: string | null) => {
      touchPreviewFileCache({ activateCurrent: true, fileId });
    },
    [touchPreviewFileCache],
  );

  const handlePreviewWorkerMessage = memoCallback(
    (event: MessageEvent<WorkerMessage>) => {
      const { type, payload } = event.data ?? {};

      if (type === "previewResult" && payload) {
        const previewPayload = payload as PreviewResultPayload;
        if (previewPayload.requestId !== previewRequestIdRef.current) return;
        clearPendingPreviewRequest(previewPayload.requestId);

        const fileId =
          typeof previewPayload.fileId === "string" ? previewPayload.fileId : null;
        const maxCellLengths = Array.isArray(previewPayload.maxCellLengths)
          ? previewPayload.maxCellLengths.map((n) => Number(n) || 0)
          : [];
        const nextPreviewFile: PreviewFile = {
          fileId: String(fileId || ""),
          fileName: String(previewPayload.fileName || ""),
          rowCount: Number(previewPayload.rowCount) || 0,
          columnCount: Number(previewPayload.columnCount) || 0,
          maxCellLengths,
        };
        const currentPreviewFile = previewFileRef.current;
        const hasSamePreviewFile =
          currentPreviewFile?.fileId === nextPreviewFile.fileId &&
          currentPreviewFile?.fileName === nextPreviewFile.fileName &&
          currentPreviewFile?.rowCount === nextPreviewFile.rowCount &&
          currentPreviewFile?.columnCount === nextPreviewFile.columnCount &&
          currentPreviewFile?.maxCellLengths.length ===
            nextPreviewFile.maxCellLengths.length &&
          (currentPreviewFile?.maxCellLengths.every(
            (cellLength, index) => cellLength === nextPreviewFile.maxCellLengths[index],
          ) ??
            false);
        const shouldUpdatePreviewStatus =
          previewStatusRef.current.state !== "ready" ||
          previewStatusRef.current.message !== "";

        if (hasSamePreviewFile && !shouldUpdatePreviewStatus) return;

        activatePreviewFileCache(fileId);
        if (fileId) {
          mergePreviewSeedRows(
            fileId,
            Number(previewPayload.seedStartRow) || 0,
            Array.isArray(previewPayload.seedRows) ? previewPayload.seedRows : [],
          );
        }

        runImmediately(() => {
          if (!hasSamePreviewFile) {
            setPreviewFile(nextPreviewFile);
          }
          if (shouldUpdatePreviewStatus) {
            setPreviewStatus({ state: "ready", message: "" });
          }
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
        clearPendingPreviewRequest(requestId);
        runImmediately(() => {
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
      clearPendingPreviewRequest,
    ],
  );

  const createPreviewWorker = memoCallback(() => {
    const worker = new Worker(
      new URL("../../../contrib/workers/analysis.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = handlePreviewWorkerMessage;
    previewWorkerRef.current = worker;
    return worker;
  }, [handlePreviewWorkerMessage, previewWorkerRef]);

  // Avoid paying worker startup cost on app cold start before preview is needed.
  const getOrCreatePreviewWorker = memoCallback(() => {
    if (previewWorkerRef.current) return previewWorkerRef.current;
    return createPreviewWorker();
  }, [createPreviewWorker, previewWorkerRef]);

  const resetPreviewWorker = memoCallback(() => {
    cancelPendingPreviewRowRequests();

    if (previewWorkerRef.current) {
      previewWorkerRef.current.terminate();
      previewWorkerRef.current = null;
    }
  }, [cancelPendingPreviewRowRequests, previewWorkerRef]);

  runEffect(() => {
    return () => {
      invalidatePreviewRequests();
      clearAllPreviewCaches();
      resetPreviewWorker();
    };
  }, [clearAllPreviewCaches, invalidatePreviewRequests, resetPreviewWorker]);

  runEffect(() => {
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
    if (pendingPreviewFileIdRef.current === targetFile.fileId) return;

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    pendingPreviewFileIdRef.current = targetFile.fileId;

    runImmediately(() => {
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

    const rustInputPath =
      typeof targetFile.normalizedCsvPath === "string" &&
      targetFile.normalizedCsvPath.trim()
        ? targetFile.normalizedCsvPath.trim()
        : typeof targetFile.sourcePath === "string" &&
            targetFile.sourcePath.trim().toLowerCase().endsWith(".csv")
          ? targetFile.sourcePath.trim()
          : null;
    if (rustInputPath && importService.canOpenFile()) {
      void importService
      .openFile({
          fileId: targetFile.fileId,
          fileName: targetFile.fileName ?? "",
          path: rustInputPath,
          seedRows: DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
        })
        .then((response: any) => {
          if (requestId === previewRequestIdRef.current) {
            clearPendingPreviewRequest(requestId);
          }
          if (!response?.ok || !response?.result) {
            if (requestId === previewRequestIdRef.current) {
              void postWorkerPreview();
            }
            return;
          }

          const previewPayload = response.result as PreviewResultPayload;
          const maxCellLengths = Array.isArray(previewPayload.maxCellLengths)
            ? previewPayload.maxCellLengths.map((n) => Number(n) || 0)
            : [];
          const fileId =
            typeof previewPayload.fileId === "string" ? previewPayload.fileId : null;
          const nextPreviewFile: PreviewFile = {
            fileId: String(fileId || ""),
            fileName: String(previewPayload.fileName || ""),
            rowCount: Number(previewPayload.rowCount) || 0,
            columnCount: Number(previewPayload.columnCount) || 0,
            maxCellLengths,
          };

          if (fileId) {
            const currentPreviewFile = previewFileRef.current;
            const hasSamePreviewFile =
              currentPreviewFile?.fileId === nextPreviewFile.fileId &&
              currentPreviewFile?.fileName === nextPreviewFile.fileName &&
              currentPreviewFile?.rowCount === nextPreviewFile.rowCount &&
              currentPreviewFile?.columnCount === nextPreviewFile.columnCount &&
              currentPreviewFile?.maxCellLengths.length ===
                nextPreviewFile.maxCellLengths.length &&
              (currentPreviewFile?.maxCellLengths.every(
                (cellLength, index) => cellLength === nextPreviewFile.maxCellLengths[index],
              ) ??
                false);
            const shouldUpdatePreviewStatus =
              previewStatusRef.current.state !== "ready" ||
              previewStatusRef.current.message !== "";

            if (hasSamePreviewFile && !shouldUpdatePreviewStatus) return;
          }

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

          runImmediately(() => {
            if (
              !(
                previewFileRef.current?.fileId === nextPreviewFile.fileId &&
                previewFileRef.current?.fileName === nextPreviewFile.fileName &&
                previewFileRef.current?.rowCount === nextPreviewFile.rowCount &&
                previewFileRef.current?.columnCount === nextPreviewFile.columnCount &&
                previewFileRef.current?.maxCellLengths.length ===
                  nextPreviewFile.maxCellLengths.length &&
                (previewFileRef.current?.maxCellLengths.every(
                  (cellLength, index) =>
                    cellLength === nextPreviewFile.maxCellLengths[index],
                ) ??
                  false)
              )
            ) {
              setPreviewFile(nextPreviewFile);
            }
            if (
              previewStatusRef.current.state !== "ready" ||
              previewStatusRef.current.message !== ""
            ) {
              setPreviewStatus({ state: "ready", message: "" });
            }
          });
        })
        .catch(() => {
          if (requestId === previewRequestIdRef.current) {
            clearPendingPreviewRequest(requestId);
          }
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

  const getPreviewRow = memoCallback(
    (rowIndex: number): unknown[] | null => {
      const normalizedIndex = Number(rowIndex);
      if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) return null;
      return previewRowsCacheRef.current.get(normalizedIndex) ?? null;
    },
    [previewRowsCacheRef],
  );

  const requestPreviewRowsRange = memoCallback(
    (fileId: string, startRow: number, endRow: number): Promise<unknown[][]> => {
      if (!fileId) return Promise.resolve([]);

      const requestId = previewRowsRequestIdRef.current + 1;
      previewRowsRequestIdRef.current = requestId;

      const start = Math.max(0, Math.floor(Number(startRow) || 0));
      const end = Math.max(start, Math.floor(Number(endRow) || start));

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
        importService.canGetPreviewRows()
      ) {
        return importService
          .getPreviewRows({
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

  const ensurePreviewCells = memoCallback(
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

      if (
        rustPreviewFileIdsRef.current.has(fileId) &&
        importService.canReadCells()
      ) {
        const requestCells = buildRustPreviewCellRequests({
          columnCount,
          rowIndices: requestedRows,
        });
        if (requestCells.length > 0) {
          try {
            const response = await importService.readCells({
              cells: requestCells,
              fileId,
            });
            if (response?.ok && response?.result) {
              const result = response.result as { cells?: unknown };
              const rowsByIndex = rowsFromRustPreviewCells({
                cells: result.cells,
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

  const ensurePreviewRows = memoCallback(
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

  return {
    cancelPendingPreviewRowRequests,
    clearPreviewState,
    disposePreviewFileCache,
    ensurePreviewCells,
    ensurePreviewRows,
    getPreviewRow,
    getPreviewRowsVersion,
    invalidatePreviewRequests,
    rawDataById,
    rawDataByIdRef,
    resetPreviewWorker,
    subscribePreviewRowsVersion,
  };
};

export const createTableBindings = (
  options: TableOptions,
): TableBindings => {
  const scope = getPreviewStateScope(
    options.previewWorkerRef ?? defaultPreviewStateScopeKey,
  );
  return runWithPreviewStateScope(scope, () => createPreviewBindings(options));
};

export class TableService extends Disposable implements ITableServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly scope = this._register(new PreviewStateScope());

  public update(options: TableOptions): TableBindings {
    return runWithPreviewStateScope(this.scope, () => createPreviewBindings(options));
  }
}

export const usePreview = (options: UsePreviewOptions): TableBindings => {
  return createTableBindings(options);
};

registerSingleton(ITableService, TableService, InstantiationType.Delayed);

