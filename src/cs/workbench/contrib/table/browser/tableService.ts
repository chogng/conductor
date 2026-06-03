import { localize } from "src/cs/nls";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { MutableState } from "src/cs/workbench/contrib/session/browser/sessionContext";
import type {
  SessionFile,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  ITableService,
  type ITableService as ITableServiceType,
  type TableCell,
  type TableFile,
  type TableHighlight,
  type TableInput,
  type TableLoadState,
  type TableModel,
  type TableRange,
  type TableRowsRequest,
  type TableSelection,
  type TableSource,
  type TableState,
  toTableSourceKey,
} from "src/cs/workbench/contrib/table/common/tableService";
import {
  DA_PREVIEW_MAX_CACHED_FILES,
  DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
  DA_PREVIEW_UI_CHUNK_SIZE_ROWS,
} from "src/cs/workbench/contrib/table/browser/rows/rowLimits";
import {
  collectMissingChunkRanges,
  clearChunkRows,
  hasChunkRowsInCache,
  isPreviewRowsResultForRequest,
  mergeChunkRangeRows,
  sanitizePreviewRows,
} from "src/cs/workbench/contrib/table/browser/rows/rowChunk";
import {
  buildRustPreviewCellRequests,
  rowsFromRustPreviewCells,
  type RustPreviewCellRequest,
} from "src/cs/workbench/contrib/table/browser/rows/rustCells";
import { useRowsVersion } from "src/cs/workbench/contrib/table/browser/rows/rowsVersion";
import { loadConvertedCsvFile } from "src/cs/workbench/services/import/browser/importPipeline";
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

class TableStateScope extends Disposable {
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

let activeTableStateScope: TableStateScope | null = null;
const tableStateScopes = new WeakMap<object, TableStateScope>();
const defaultTableStateScopeKey = {};

const getTableStateScope = (key: object): TableStateScope => {
  let scope = tableStateScopes.get(key);
  if (!scope) {
    scope = new TableStateScope();
    tableStateScopes.set(key, scope);
  }
  return scope;
};

const getActiveTableStateScope = (): TableStateScope => {
  if (!activeTableStateScope) {
    throw new Error("Preview hook scope is not active");
  }
  return activeTableStateScope;
};

const runWithTableStateScope = <T,>(
  scope: TableStateScope,
  callback: () => T,
): T => {
  const previousScope = activeTableStateScope;
  activeTableStateScope = scope;
  scope.begin();

  try {
    const result = callback();
    scope.flushEffects();
    return result;
  } finally {
    activeTableStateScope = previousScope;
  }
};

const normalizeTableCell = (cell: TableCell | null | undefined): TableCell | null => {
  if (!cell) return null;
  const rowIndex = Math.floor(Number(cell.rowIndex));
  const colIndex = Math.floor(Number(cell.colIndex));
  if (!Number.isInteger(rowIndex) || rowIndex < 0) return null;
  if (!Number.isInteger(colIndex) || colIndex < 0) return null;

  return {
    fileId: typeof cell.fileId === "string" ? cell.fileId : null,
    sheetId: typeof cell.sheetId === "string" ? cell.sheetId : null,
    rowIndex,
    colIndex,
  };
};

const normalizeColumnIndexes = (columnIndexes: readonly number[] | undefined): number[] =>
  Array.from(new Set(
    (Array.isArray(columnIndexes) ? columnIndexes : [])
      .map((columnIndex) => Math.floor(Number(columnIndex)))
      .filter((columnIndex) => Number.isInteger(columnIndex) && columnIndex >= 0),
  )).sort((a, b) => a - b);

const normalizeTableSelection = (
  selection: TableSelection | null | undefined,
): TableSelection => ({
  activeCell: normalizeTableCell(selection?.activeCell),
  selectedColumns: normalizeColumnIndexes(selection?.selectedColumns),
  ranges: Array.isArray(selection?.ranges)
    ? selection.ranges
        .map((range): TableRange | null => {
          const startRow = Math.floor(Number(range.startRow));
          const endRow = Math.floor(Number(range.endRow));
          const startCol = Math.floor(Number(range.startCol));
          const endCol = Math.floor(Number(range.endCol));
          if (
            !Number.isInteger(startRow) ||
            !Number.isInteger(endRow) ||
            !Number.isInteger(startCol) ||
            !Number.isInteger(endCol)
          ) {
            return null;
          }

          const normalizedRange: TableRange = {
            fileId: typeof range.fileId === "string" ? range.fileId : null,
            sheetId: typeof range.sheetId === "string" ? range.sheetId : null,
            startRow: Math.max(0, Math.min(startRow, endRow)),
            endRow: Math.max(0, Math.max(startRow, endRow)),
            startCol: Math.max(0, Math.min(startCol, endCol)),
            endCol: Math.max(0, Math.max(startCol, endCol)),
          };
          return normalizedRange;
        })
        .filter((range): range is TableRange => Boolean(range))
    : [],
});

const runImmediately = (callback: () => void): void => callback();
const memoCallback = <T extends (...args: any[]) => any>(
  callback: T,
  deps?: unknown[],
): T => getActiveTableStateScope().memoValue(() => callback, deps);
const readImmediateValue = <T,>(value: T): T => value;
const runEffect = (
  effect: () => void | (() => void),
  deps?: unknown[],
): void => getActiveTableStateScope().runEffect(effect, deps);
const memoValue = <T,>(factory: () => T, deps?: unknown[]): T =>
  getActiveTableStateScope().memoValue(factory, deps);
const getMutableState = <T,>(current: T): MutableState<T> =>
  getActiveTableStateScope().getMutableState(current);

const formatTableFileName = (fileName: string | null | undefined): string =>
  fileName ? String(fileName).replace(/\.csv$/i, "") : "";

type TableSourceEntry = {
  readonly entry: SessionFile;
  readonly source: TableSource;
  readonly sourceKey: string;
  readonly sheetName: string | null;
};

const readEntryString = (entry: SessionFile | null | undefined, key: string): string | null => {
  const value = entry?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const getEntrySheetName = (entry: SessionFile | null | undefined): string | null =>
  readEntryString(entry, "sheetName") ??
  readEntryString(entry, "worksheetName");

const getEntrySheetId = (entry: SessionFile | null | undefined): string | null =>
  readEntryString(entry, "sheetId") ??
  readEntryString(entry, "worksheetId") ??
  getEntrySheetName(entry);

const createTableSourceEntry = (entry: SessionFile): TableSourceEntry | null => {
  const fileId = readEntryString(entry, "fileId");
  if (!fileId) {
    return null;
  }

  const sheetId = getEntrySheetId(entry);
  const source: TableSource = {
    fileId,
    sheetId,
  };

  return {
    entry,
    sheetName: getEntrySheetName(entry),
    source,
    sourceKey: toTableSourceKey(source),
  };
};

const isTableFileForSource = (
  file: TableFile | null | undefined,
  sourceKey: string | null | undefined,
): boolean => Boolean(file?.sourceKey && sourceKey && file.sourceKey === sourceKey);

type PreviewResultPayload = {
  requestId: number;
  fileId: string;
  fileName: string;
  sheetId?: string | null;
  sheetName?: string | null;
  sourceKey?: string;
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
  seedRows?: unknown[][];
  seedStartRow?: number;
};

type PreviewRowsResultPayload = {
  requestId: number;
  fileId: string;
  sourceKey?: string;
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

type UseTableOptions = TableInput;
type CreateTableOptions = {
  sourceFiles?: SessionFile[];
  selectedFileId?: string | null;
  selectedSheetId?: string | null;
  setSelectedFileId?: Dispatch<SetStateAction<string | null>>;
  setSelectedSheetId?: Dispatch<SetStateAction<string | null>>;
  file?: TableFile | null;
  loadState?: TableLoadState;
  setFile?: Dispatch<SetStateAction<TableFile | null>>;
  setLoadState?: Dispatch<SetStateAction<TableLoadState>>;
  workerRef?: MutableState<Worker | null>;
  requestIdRef?: MutableState<number>;
  rowsRequestIdRef?: MutableState<number>;
  rowsRequestsRef?: MutableState<Map<number, TableRowsRequest>>;
  rowsCacheByFileIdRef?: MutableState<Map<string, Map<number, unknown[]>>>;
  loadedChunksByFileIdRef?: MutableState<Map<string, Set<number>>>;
  rowsCacheRef?: MutableState<Map<number, unknown[]>>;
  loadedChunksRef?: MutableState<Set<number>>;
  cacheFileIdRef?: MutableState<string | null>;
  cacheFileLruRef?: MutableState<Set<string>>;
};

const TABLE_LOAD_STATE_IDLE: TableLoadState = { state: "idle", message: "" };
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

const createTableModel = ({
  sourceFiles = [],
  selectedFileId = null,
  selectedSheetId = null,
  setSelectedFileId = () => {},
  setSelectedSheetId = () => {},
  file = null,
  setFile = () => {},
  setLoadState = () => {},
  workerRef = { current: null },
  requestIdRef = { current: 0 },
  loadState = TABLE_LOAD_STATE_IDLE,
  rowsRequestIdRef = { current: 0 },
  rowsRequestsRef = { current: new Map() },
  rowsCacheByFileIdRef = { current: new Map() },
  loadedChunksByFileIdRef = { current: new Map() },
  rowsCacheRef = { current: new Map() },
  loadedChunksRef = { current: new Set() },
  cacheFileIdRef = { current: null },
  cacheFileLruRef = { current: new Set() },
}: CreateTableOptions) => {
  const selectedPreviewFileId = selectedFileId;
  const selectedPreviewSheetId = selectedSheetId;
  const setSelectedPreviewFileId = setSelectedFileId;
  const setSelectedPreviewSheetId = setSelectedSheetId;
  const previewFile = file;
  const setPreviewFile = setFile;
  const setPreviewStatus = setLoadState;
  const previewWorkerRef = workerRef;
  const previewRequestIdRef = requestIdRef;
  const previewStatus = loadState;
  const previewRowsRequestIdRef = rowsRequestIdRef;
  const previewRowsRequestsRef = rowsRequestsRef;
  const previewRowsCacheByFileIdRef = rowsCacheByFileIdRef;
  const previewLoadedChunksByFileIdRef = loadedChunksByFileIdRef;
  const previewRowsCacheRef = rowsCacheRef;
  const previewLoadedChunksRef = loadedChunksRef;
  const previewCacheFileIdRef = cacheFileIdRef;
  const previewCacheFileLruRef = cacheFileLruRef;
  const {
    cancelRowsVersionNotification,
    getRowsVersion,
    notifyRowsVersion,
    subscribeRowsVersion,
  } = memoValue(() => useRowsVersion(), []);
  const selectionRef = getMutableState<TableSelection>(normalizeTableSelection(null));
  const highlightRef = getMutableState<TableHighlight>({});
  const revealCellRef = getMutableState<TableCell | null>(null);
  const selectionSubscribersRef = getMutableState(new Set<(selection: TableSelection) => void>());

  const deferredSelectedPreviewFileId = readImmediateValue(selectedPreviewFileId);
  const deferredSelectedPreviewSheetId = readImmediateValue(selectedPreviewSheetId);
  const previewStatusRef = getMutableState<TableLoadState>(previewStatus);
  const previewFileRef = getMutableState<TableFile | null>(previewFile);
  const previewPendingChunksByFileIdRef = getMutableState<Map<string, Set<number>>>(
    new Map(),
  );
  const rustPreviewFileIdsRef = getMutableState<Set<string>>(new Set());
  const pendingPreviewFileIdRef = getMutableState<string | null>(null);

  const sourceEntries = memoValue(() => {
    const entries: TableSourceEntry[] = [];

    for (const entry of Array.isArray(sourceFiles) ? sourceFiles : []) {
      const sourceEntry = createTableSourceEntry(entry);
      if (!sourceEntry) continue;
      entries.push(sourceEntry);
    }

    return entries;
  }, [sourceFiles]);

  const sourcesByKey = memoValue(() => {
    const map = new Map<string, TableSourceEntry>();
    for (const sourceEntry of sourceEntries) {
      map.set(sourceEntry.sourceKey, sourceEntry);
    }
    return map;
  }, [sourceEntries]);

  const sourcesByFileId = memoValue(() => {
    const map = new Map<string, TableSourceEntry[]>();
    for (const sourceEntry of sourceEntries) {
      const fileSources = map.get(sourceEntry.source.fileId) ?? [];
      fileSources.push(sourceEntry);
      map.set(sourceEntry.source.fileId, fileSources);
    }
    return map;
  }, [sourceEntries]);

  const selectedSource = memoValue((): TableSourceEntry | null => {
    if (!deferredSelectedPreviewFileId) {
      return null;
    }

    const fileSources = sourcesByFileId.get(deferredSelectedPreviewFileId);
    if (!fileSources?.length) {
      return null;
    }

    if (deferredSelectedPreviewSheetId) {
      const selectedSheetSource = fileSources.find(
        (sourceEntry) => sourceEntry.source.sheetId === deferredSelectedPreviewSheetId,
      );
      if (selectedSheetSource) {
        return selectedSheetSource;
      }
    }

    return fileSources[0] ?? null;
  }, [
    deferredSelectedPreviewFileId,
    deferredSelectedPreviewSheetId,
    sourcesByFileId,
  ]);

  const selectedPreviewSourceKey = selectedSource?.sourceKey ?? null;
  const sourcesByKeyRef = getMutableState(new Map<string, TableSourceEntry>());
  const sourcesByFileIdRef = getMutableState(new Map<string, TableSourceEntry[]>());

  runEffect(() => {
    sourcesByKeyRef.current = sourcesByKey;
  }, [sourcesByKey]);

  runEffect(() => {
    sourcesByFileIdRef.current = sourcesByFileId;
  }, [sourcesByFileId]);

  runEffect(() => {
    previewStatusRef.current = previewStatus;
    previewFileRef.current = previewFile;
  }, [previewStatus, previewFile]);

  runEffect(() => {
    const clearedSelection = normalizeTableSelection(null);
    selectionRef.current = clearedSelection;
    highlightRef.current = {};
    revealCellRef.current = null;
    for (const callback of Array.from(selectionSubscribersRef.current)) {
      try {
        callback(clearedSelection);
      } catch {
        // A broken consumer must not prevent table state from following the file.
      }
    }
  }, [selectedPreviewSourceKey]);

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
    cancelRowsVersionNotification();
    notifyRowsVersion();
  }, [cancelRowsVersionNotification, notifyRowsVersion]);

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
      setPreviewStatus(TABLE_LOAD_STATE_IDLE);
      pendingPreviewFileIdRef.current = null;

      if (clearSelection) {
        setSelectedPreviewFileId(null);
        setSelectedPreviewSheetId(null);
      }

      clearAllPreviewCaches();
    },
    [
      clearAllPreviewCaches,
      setPreviewFile,
      setPreviewStatus,
      setSelectedPreviewFileId,
      setSelectedPreviewSheetId,
    ],
  );

  const disposePreviewSourceCache = memoCallback(
    (sourceKey: string) => {
      if (typeof sourceKey !== "string" || !sourceKey) return;

      previewRowsCacheByFileIdRef.current.delete(sourceKey);
      previewLoadedChunksByFileIdRef.current.delete(sourceKey);
      previewCacheFileLruRef.current.delete(sourceKey);
      previewPendingChunksByFileIdRef.current.delete(sourceKey);

      if (previewCacheFileIdRef.current === sourceKey) {
        resetCurrentPreviewCache();
      }

      postPreviewDispose(sourceKey);
    },
    [
      postPreviewDispose,
      previewCacheFileIdRef,
      previewCacheFileLruRef,
      previewLoadedChunksByFileIdRef,
      previewPendingChunksByFileIdRef,
      previewRowsCacheByFileIdRef,
      resetCurrentPreviewCache,
    ],
  );

  const disposePreviewFileCache = memoCallback(
    (fileId: string) => {
      if (typeof fileId !== "string" || !fileId) return;

      const sourceKeys = new Set<string>([toTableSourceKey({ fileId })]);
      const fileSources = sourcesByFileIdRef.current.get(fileId) ?? [];
      for (const sourceEntry of fileSources) {
        sourceKeys.add(sourceEntry.sourceKey);
      }

      for (const sourceKey of sourceKeys) {
        disposePreviewSourceCache(sourceKey);
      }
    },
    [
      disposePreviewSourceCache,
      sourcesByFileIdRef,
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

        disposePreviewSourceCache(oldestFileId);
      }
    },
    [
      assignCurrentPreviewCache,
      disposePreviewSourceCache,
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

        const sourceKey =
          typeof previewPayload.sourceKey === "string" && previewPayload.sourceKey
            ? previewPayload.sourceKey
            : typeof previewPayload.fileId === "string"
              ? previewPayload.fileId
              : null;
        const sourceEntry = sourceKey ? sourcesByKeyRef.current.get(sourceKey) : null;
        const maxCellLengths = Array.isArray(previewPayload.maxCellLengths)
          ? previewPayload.maxCellLengths.map((n) => Number(n) || 0)
          : [];
        const nextPreviewFile: TableFile = {
          fileId: sourceEntry?.source.fileId ?? String(previewPayload.fileId || ""),
          fileName: String(previewPayload.fileName || ""),
          sheetId: sourceEntry?.source.sheetId ?? previewPayload.sheetId ?? null,
          sheetName: sourceEntry?.sheetName ?? previewPayload.sheetName ?? null,
          sourceKey: sourceKey ?? undefined,
          rowCount: Number(previewPayload.rowCount) || 0,
          columnCount: Number(previewPayload.columnCount) || 0,
          maxCellLengths,
        };
        const currentPreviewFile = previewFileRef.current;
        const hasSamePreviewFile =
          isTableFileForSource(currentPreviewFile, sourceKey) &&
          currentPreviewFile?.fileId === nextPreviewFile.fileId &&
          currentPreviewFile?.fileName === nextPreviewFile.fileName &&
          currentPreviewFile?.sheetId === nextPreviewFile.sheetId &&
          currentPreviewFile?.sheetName === nextPreviewFile.sheetName &&
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

        activatePreviewFileCache(sourceKey);
        if (sourceKey) {
          mergePreviewSeedRows(
            sourceKey,
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
          clearPreviewState();
        });
      }
    },
    [
      activatePreviewFileCache,
      clearPreviewState,
      mergePreviewSeedRows,
      previewRowsRequestsRef,
      previewRequestIdRef,
      setPreviewFile,
      clearPendingPreviewRequest,
      sourcesByKeyRef,
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
    if (!sourceFiles.length) {
      invalidatePreviewRequests();
      clearPreviewState({ clearSelection: true });
      return;
    }

    const targetSource = selectedSource;
    const targetFile = targetSource?.entry ?? null;
    const targetSourceKey = targetSource?.sourceKey ?? null;
    if (!targetSource || !targetFile?.file || !targetFile?.fileId || !targetSourceKey) return;
    if (isTableFileForSource(previewFile, targetSourceKey)) return;
    if (pendingPreviewFileIdRef.current === targetSourceKey) return;

    const previewTargetSource = targetSource;
    const previewTargetFile = targetFile;
    const previewTargetSourceKey = targetSourceKey;
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    pendingPreviewFileIdRef.current = previewTargetSourceKey;

    runImmediately(() => {
      setPreviewStatus({ state: "loading", message: localize("preview_loading", "Loading preview...") });
    });

    const postWorkerPreview = async () => {
      const worker = getOrCreatePreviewWorker();
      if (!worker) return;
      const fallbackFile =
        (await loadConvertedCsvFile({
          fallbackFile: previewTargetFile.file,
          fileName: previewTargetFile.fileName,
          lastModified:
            previewTargetFile.file instanceof File ? previewTargetFile.file.lastModified : null,
          normalizedCsvPath: previewTargetFile.normalizedCsvPath,
        })) ?? previewTargetFile.file;

      worker.postMessage({
        type: "preview",
        payload: {
          requestId,
          fileId: previewTargetSourceKey,
          sourceKey: previewTargetSourceKey,
          physicalFileId: previewTargetSource.source.fileId,
          sheetId: previewTargetSource.source.sheetId ?? null,
          sheetName: previewTargetSource.sheetName,
          file: fallbackFile,
          maxPreviewRows: DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
        },
      });
    };

    const rustInputPath =
      typeof previewTargetFile.normalizedCsvPath === "string" &&
      previewTargetFile.normalizedCsvPath.trim()
        ? previewTargetFile.normalizedCsvPath.trim()
        : typeof previewTargetFile.sourcePath === "string" &&
            previewTargetFile.sourcePath.trim().toLowerCase().endsWith(".csv")
          ? previewTargetFile.sourcePath.trim()
          : null;
    if (rustInputPath && importService.canOpenFile()) {
      void importService
      .openFile({
          fileId: previewTargetSourceKey,
          fileName: previewTargetFile.fileName ?? "",
          path: rustInputPath,
          seedRows: DA_PREVIEW_MAX_CACHED_UI_ROWS_PER_FILE,
          sheetId: previewTargetSource.source.sheetId ?? null,
          sheetName: previewTargetSource.sheetName,
          sourceKey: previewTargetSourceKey,
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
          const sourceKey =
            typeof previewPayload.sourceKey === "string" && previewPayload.sourceKey
              ? previewPayload.sourceKey
              : typeof previewPayload.fileId === "string"
                ? previewPayload.fileId
                : previewTargetSourceKey;
          const nextPreviewFile: TableFile = {
            fileId: previewTargetSource.source.fileId,
            fileName: String(previewPayload.fileName || ""),
            sheetId: previewTargetSource.source.sheetId ?? previewPayload.sheetId ?? null,
            sheetName: previewTargetSource.sheetName ?? previewPayload.sheetName ?? null,
            sourceKey,
            rowCount: Number(previewPayload.rowCount) || 0,
            columnCount: Number(previewPayload.columnCount) || 0,
            maxCellLengths,
          };

          if (sourceKey) {
            const currentPreviewFile = previewFileRef.current;
            const hasSamePreviewFile =
              isTableFileForSource(currentPreviewFile, sourceKey) &&
              currentPreviewFile?.fileId === nextPreviewFile.fileId &&
              currentPreviewFile?.fileName === nextPreviewFile.fileName &&
              currentPreviewFile?.sheetId === nextPreviewFile.sheetId &&
              currentPreviewFile?.sheetName === nextPreviewFile.sheetName &&
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

          if (sourceKey) {
            rustPreviewFileIdsRef.current.add(sourceKey);
            touchPreviewFileCache({ fileId: sourceKey });
            mergePreviewSeedRows(
              sourceKey,
              Number(previewPayload.seedStartRow) || 0,
              Array.isArray(previewPayload.seedRows)
                ? previewPayload.seedRows
                : [],
            );
          }
          if (requestId !== previewRequestIdRef.current) {
            return;
          }

          activatePreviewFileCache(sourceKey);

          runImmediately(() => {
            if (
              !(
                isTableFileForSource(previewFileRef.current, sourceKey) &&
                previewFileRef.current?.fileId === nextPreviewFile.fileId &&
                previewFileRef.current?.fileName === nextPreviewFile.fileName &&
                previewFileRef.current?.sheetId === nextPreviewFile.sheetId &&
                previewFileRef.current?.sheetName === nextPreviewFile.sheetName &&
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
    deferredSelectedPreviewSheetId,
    getOrCreatePreviewWorker,
    invalidatePreviewRequests,
    mergePreviewSeedRows,
    previewFile?.sourceKey,
    previewRequestIdRef,
    sourceFiles,
    selectedSource,
    setPreviewStatus,
    touchPreviewFileCache,
  ]);

  const getTableRow = memoCallback(
    (rowIndex: number): unknown[] | null => {
      const normalizedIndex = Number(rowIndex);
      if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) return null;
      return previewRowsCacheRef.current.get(normalizedIndex) ?? null;
    },
    [previewRowsCacheRef],
  );

  const resolveRequestSourceKey = memoCallback(
    (fileId: string): string | null => {
      const currentFile = previewFileRef.current;
      if (
        currentFile?.sourceKey &&
        (fileId === currentFile.fileId || fileId === currentFile.sourceKey)
      ) {
        return currentFile.sourceKey;
      }

      return fileId || null;
    },
    [previewFileRef],
  );

  const requestPreviewRowsRange = memoCallback(
    (fileId: string, startRow: number, endRow: number): Promise<unknown[][]> => {
      const sourceKey = resolveRequestSourceKey(fileId);
      if (!sourceKey) return Promise.resolve([]);

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
            fileId: sourceKey,
            reject,
            resolve,
            sourceKey,
            startRow: start,
          });
          worker.postMessage({
            type: "previewRows",
            payload: {
              requestId,
              fileId: sourceKey,
              sourceKey,
              startRow: start,
              endRow: end,
            },
          });
        });
      };

      if (
        rustPreviewFileIdsRef.current.has(sourceKey) &&
        importService.canGetPreviewRows()
      ) {
        return importService
          .getPreviewRows({
            endRow: end,
            fileId: sourceKey,
            sourceKey,
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
              requestFileId: sourceKey,
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
      resolveRequestSourceKey,
    ],
  );

  const ensureTableCells = memoCallback(
    async (fileId: string, cells: RustPreviewCellRequest[]) => {
      const sourceKey = resolveRequestSourceKey(fileId);
      if (!sourceKey || !Array.isArray(cells) || !cells.length) return;
      if (!previewFile?.rowCount || !Number.isFinite(previewFile.rowCount)) return;

      const totalRows = Math.max(0, Math.floor(previewFile.rowCount));
      const columnCount = Math.max(
        0,
        Math.floor(Number(previewFile.columnCount) || 0),
      );
      if (totalRows <= 0 || columnCount <= 0) return;

      const { rowCache } = getOrCreatePreviewFileCaches(sourceKey);
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
        rustPreviewFileIdsRef.current.has(sourceKey) &&
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
              fileId: sourceKey,
              sourceKey,
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
                if (previewCacheFileIdRef.current === sourceKey) {
                  notifyRowsVersion();
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
        const rows = await requestPreviewRowsRange(sourceKey, rangeStart, rangeEnd);
        for (let index = 0; index < rows.length; index += 1) {
          rowCache.set(rangeStart + index, rows[index]);
          changed = true;
        }
      }

      if (changed && previewCacheFileIdRef.current === sourceKey) {
        notifyRowsVersion();
      }
    },
    [
      getOrCreatePreviewFileCaches,
      notifyRowsVersion,
      previewCacheFileIdRef,
      previewFile?.columnCount,
      previewFile?.rowCount,
      requestPreviewRowsRange,
      resolveRequestSourceKey,
    ],
  );

  const ensureTableRows = memoCallback(
    async (fileId: string, startRow: number, endRow: number) => {
      if (!previewFile?.rowCount || !Number.isFinite(previewFile.rowCount)) return;
      const sourceKey = resolveRequestSourceKey(fileId);
      if (!sourceKey) return;

      const { loadedChunks, rowCache } = getOrCreatePreviewFileCaches(sourceKey);
      const pendingChunks = getOrCreatePendingChunks(sourceKey);
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
            rows = await requestPreviewRowsRange(sourceKey, rangeStart, rangeEnd);
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
            previewCacheFileIdRef.current === sourceKey &&
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
        notifyRowsVersion();
      }
    },
    [
      getOrCreatePendingChunks,
      getOrCreatePreviewFileCaches,
      notifyRowsVersion,
      previewCacheFileIdRef,
      previewFile,
      requestPreviewRowsRange,
      resolveRequestSourceKey,
    ],
  );

  const getSelection = memoCallback(
    (): TableSelection => selectionRef.current,
    [selectionRef],
  );

  const onDidChangeSelection = memoCallback(
    (callback: (selection: TableSelection) => void): (() => void) => {
      selectionSubscribersRef.current.add(callback);
      return () => selectionSubscribersRef.current.delete(callback);
    },
    [selectionSubscribersRef],
  );

  const setSelection = memoCallback(
    (selection: TableSelection | null): void => {
      const normalizedSelection = normalizeTableSelection(selection);
      selectionRef.current = normalizedSelection;
      for (const callback of Array.from(selectionSubscribersRef.current)) {
        try {
          callback(normalizedSelection);
        } catch {
          // A broken consumer must not prevent table selection from updating.
        }
      }
    },
    [selectionRef, selectionSubscribersRef],
  );

  const getHighlight = memoCallback(
    (): TableHighlight => highlightRef.current,
    [highlightRef],
  );

  const highlightColumns = memoCallback(
    (columnIndexes: readonly number[]): void => {
      highlightRef.current = {
        columns: normalizeColumnIndexes(columnIndexes),
      };
    },
    [highlightRef],
  );

  const clearHighlight = memoCallback(
    (): void => {
      highlightRef.current = {};
    },
    [highlightRef],
  );

  const revealCell = memoCallback(
    (cell: TableCell | null): void => {
      revealCellRef.current = normalizeTableCell(cell);
    },
    [revealCellRef],
  );

  const getRevealCell = memoCallback(
    (): TableCell | null => revealCellRef.current,
    [revealCellRef],
  );

  const getState = memoCallback(
    (): TableState => {
      const currentFile = previewFileRef.current;
      const selectedFileSources =
        sourcesByFileIdRef.current.get(String(selectedPreviewFileId ?? "")) ?? [];
      const selectedSourceForName = selectedPreviewSheetId
        ? selectedFileSources.find(
            (sourceEntry) => sourceEntry.source.sheetId === selectedPreviewSheetId,
          ) ?? selectedFileSources[0] ?? null
        : selectedFileSources[0] ?? null;
      const selectedFileName = selectedSourceForName?.entry.fileName ?? "";
      const selectedSheetName = selectedSourceForName?.sheetName ?? null;
      const currentFileName = currentFile?.sheetName
        ? `${currentFile.fileName} / ${currentFile.sheetName}`
        : currentFile?.fileName;
      const selectedDisplayName = selectedSheetName
        ? `${selectedFileName} / ${selectedSheetName}`
        : selectedFileName;
      const hasCurrentSource = isTableFileForSource(currentFile, selectedPreviewSourceKey);
      const fileName = formatTableFileName(
        hasCurrentSource ? currentFileName : selectedDisplayName,
      );
      const dimensions = hasCurrentSource && currentFile
        ? `${Math.max(0, Number(currentFile.rowCount) || 0)} × ${Math.max(0, Number(currentFile.columnCount) || 0)}`
        : undefined;

      return {
        dimensions,
        file: hasCurrentSource ? currentFile : null,
        fileName,
        loadState: previewStatusRef.current,
        selectedFileId: selectedPreviewFileId ?? null,
        selectedSheetId: selectedPreviewSheetId ?? null,
        source: selectedSource?.source ?? null,
        sourceKey: selectedPreviewSourceKey,
      };
    },
    [
      previewFileRef,
      previewStatusRef,
      selectedPreviewFileId,
      selectedPreviewSheetId,
      selectedPreviewSourceKey,
      selectedSource,
      sourcesByFileIdRef,
    ],
  );

  const hasSourceFile = memoCallback(
    (fileId: string | null | undefined): boolean =>
      Boolean(fileId && sourcesByFileIdRef.current.has(fileId)),
    [sourcesByFileIdRef],
  );

  return {
    cancelPendingRowRequests: cancelPendingPreviewRowRequests,
    clearHighlight,
    clearState: clearPreviewState,
    disposeFileCache: disposePreviewFileCache,
    ensureCells: ensureTableCells,
    ensureRows: ensureTableRows,
    getHighlight,
    getRow: getTableRow,
    getRowsVersion,
    getRevealCell,
    getSelection,
    getState,
    hasSourceFile,
    invalidateRequests: invalidatePreviewRequests,
    onDidChangeSelection,
    revealCell,
    resetWorker: resetPreviewWorker,
    setSelection,
    highlightColumns,
    subscribeRowsVersion,
  };
};

export const createTableModelWithScope = (
  options: TableInput,
): TableModel => {
  const scope = getTableStateScope(
    options.workerRef ?? defaultTableStateScopeKey,
  );
  return runWithTableStateScope(scope, () => createTableModel(options));
};

export class TableService extends Disposable implements ITableServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly scope = this._register(new TableStateScope());

  public update(options: TableInput): TableModel {
    return runWithTableStateScope(this.scope, () => createTableModel(options));
  }
}

export const createTableModelForInput = (options: UseTableOptions): TableModel => {
  return createTableModelWithScope(options);
};

registerSingleton(ITableService, TableService, InstantiationType.Delayed);
