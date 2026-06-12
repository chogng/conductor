/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type {
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import {
  ITableService,
  ITableBackendService,
  TABLE_DEFAULT_ZOOM_PERCENT,
  TABLE_MAX_ZOOM_PERCENT,
  TABLE_MIN_ZOOM_PERCENT,
  TABLE_ZOOM_STEP_PERCENT,
  TableCommandId,
  type TableCell,
  type TableCellReadRequest,
  type TableFile,
  type TableHighlight,
  type TableInput,
  type TableViewInput,
  type TableLoadState,
  type TableModel,
  type TableRange,
  type TableRevealOptions,
  type TableRevealTarget,
  type TableRevealMode,
  type TableSelection,
  type TableSelectionTarget,
  type TableSource,
  type TableState,
  toTableSourceKey,
} from "src/cs/workbench/services/table/common/table";
import {
  areTableSelectionsEqual,
  normalizeColumnIndexes,
  normalizeTableCell,
  normalizeTableSelection,
} from "src/cs/workbench/services/table/common/selection";
import {
  collectMissingChunkRanges,
  clearChunkRows,
  hasChunkRowsInCache,
  isTableRowBatchResultForRequest,
  mergeChunkRangeRows,
  sanitizeTableRowBatch,
  TABLE_MAX_CACHED_FILES,
  TABLE_MAX_CACHED_UI_ROWS_PER_FILE,
  TABLE_UI_CHUNK_SIZE_ROWS,
  createTableRowCacheVersion,
} from "src/cs/workbench/services/table/browser/tableRowCacheModel";
import {
  buildTableCellReadRequests,
  rowsFromTableCellReads,
} from "src/cs/workbench/services/table/browser/tableCellReadModel";
import { loadConvertedCsvFile } from "src/cs/workbench/services/files/browser/fileConverter";
type SetStateAction<T> = T | ((previous: T) => T);
type Dispatch<T> = (value: T) => void;

type TableMutableRef<T> = {
  current: T;
};

type TableRowsRequest = {
  fileId: string;
  sheetId?: string | null;
  sourceKey?: string;
  startRow: number;
  endRow: number;
  reject: (error: unknown) => void;
  resolve: (rows: unknown[][]) => void;
};

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
  private readonly refs: Array<TableMutableRef<unknown> | undefined> = [];

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

  public createRef<T>(current: T): TableMutableRef<T> {
    const index = this.hookIndex;
    this.hookIndex += 1;

    const previous = this.refs[index] as TableMutableRef<T> | undefined;
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
const createTableRef = <T,>(current: T): TableMutableRef<T> =>
  getActiveTableStateScope().createRef(current);

const formatTableFileName = (fileName: string | null | undefined): string =>
  fileName ? String(fileName).replace(/\.csv$/i, "") : "";

type TableSourceEntry = {
  readonly entry: SessionFile;
  readonly source: TableSource;
  readonly sourceKey: string;
  readonly sourceVersion: number;
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
    sourceVersion: normalizeSourceVersion(entry.sourceVersion),
    sourceKey: readEntryString(entry, "sourceKey") ?? toTableSourceKey(source),
  };
};

const isTableFileForSource = (
  file: TableFile | null | undefined,
  sourceKey: string | null | undefined,
): boolean => Boolean(file?.sourceKey && sourceKey && file.sourceKey === sourceKey);

const isTableFileForSourceEntry = (
  file: TableFile | null | undefined,
  source: TableSourceEntry | null | undefined,
): boolean =>
  Boolean(source) &&
  isTableFileForSource(file, source?.sourceKey) &&
  normalizeSourceVersion(file?.sourceVersion) === normalizeSourceVersion(source?.sourceVersion);

const areTableFilesEqual = (
  current: TableFile | null | undefined,
  next: TableFile,
): boolean =>
  current?.fileId === next.fileId &&
  current?.fileName === next.fileName &&
  current?.sheetId === next.sheetId &&
  current?.sheetName === next.sheetName &&
  current?.sourceKey === next.sourceKey &&
  normalizeSourceVersion(current?.sourceVersion) === normalizeSourceVersion(next.sourceVersion) &&
  current?.rowCount === next.rowCount &&
  current?.columnCount === next.columnCount &&
  current?.maxCellLengths.length === next.maxCellLengths.length &&
  (current?.maxCellLengths.every(
    (cellLength, index) => cellLength === next.maxCellLengths[index],
  ) ?? false);

const normalizeSourceVersion = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

type TablePreviewResultPayload = {
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

type TableRowsResultPayload = {
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
  | { type: "tablePreviewResult"; payload: TablePreviewResultPayload }
  | { type: "tableRowsResult"; payload: TableRowsResultPayload }
  | { type: "workerError"; payload: WorkerErrorPayload }
  | { type?: string; payload?: Record<string, unknown> | null };

export type CreateTableModelWithScopeOptions = TableInput & {
  file?: TableFile | null;
  loadState?: TableLoadState;
  setFile?: Dispatch<SetStateAction<TableFile | null>>;
  setLoadState?: Dispatch<SetStateAction<TableLoadState>>;
  workerRef?: TableMutableRef<unknown | null>;
  requestIdRef?: TableMutableRef<number>;
  rowsRequestIdRef?: TableMutableRef<number>;
  rowsRequestsRef?: TableMutableRef<Map<number, TableRowsRequest>>;
  rowsCacheByFileIdRef?: TableMutableRef<Map<string, Map<number, unknown[]>>>;
  loadedChunksByFileIdRef?: TableMutableRef<Map<string, Set<number>>>;
  rowsCacheRef?: TableMutableRef<Map<number, unknown[]>>;
  loadedChunksRef?: TableMutableRef<Set<number>>;
  cacheFileIdRef?: TableMutableRef<string | null>;
  cacheFileLruRef?: TableMutableRef<Set<string>>;
};

type UseTableOptions = Omit<CreateTableModelWithScopeOptions, "workerRef"> & {
  workerRef?: TableMutableRef<Worker | null>;
};
type CreateTableOptions = UseTableOptions;

const TABLE_LOAD_STATE_IDLE: TableLoadState = { state: "idle", message: "" };
const areTableLoadStatesEqual = (
  current: TableLoadState,
  next: TableLoadState,
): boolean =>
  current.state === next.state &&
  current.message === next.message;
const clampTableZoomPercent = (value: number): number =>
  Math.min(
    TABLE_MAX_ZOOM_PERCENT,
    Math.max(TABLE_MIN_ZOOM_PERCENT, Math.floor(Number(value) || 0)),
  );
const resolveStateAction = <T,>(value: SetStateAction<T>, previous: T): T =>
  typeof value === "function"
    ? (value as (previous: T) => T)(previous)
    : value;
const TABLE_MAX_CACHED_UI_CHUNKS_PER_FILE = Math.max(
  1,
  Math.ceil(
    TABLE_MAX_CACHED_UI_ROWS_PER_FILE / TABLE_UI_CHUNK_SIZE_ROWS,
  ),
);
const PREVIEW_ROWS_FETCH_MAX_ATTEMPTS = 2;
const PREVIEW_ROWS_MAX_MERGED_REQUEST_ROWS = Math.max(
  TABLE_UI_CHUNK_SIZE_ROWS * 8,
  400,
);

const createTableModel = ({
  tableBackendService,
  rawFiles = [],
  source = null,
  file,
  setFile,
  setLoadState,
  workerRef,
  requestIdRef,
  loadState,
  rowsRequestIdRef,
  rowsRequestsRef,
  rowsCacheByFileIdRef,
  loadedChunksByFileIdRef,
  rowsCacheRef,
  loadedChunksRef,
  cacheFileIdRef,
  cacheFileLruRef,
}: CreateTableOptions) => {
  if (!tableBackendService) {
    throw new Error("Table model requires ITableBackendService.");
  }

  const activeFileId = source?.fileId ?? null;
  const activeSheetId = source?.sheetId ?? null;
  const hasControlledPreviewFile = file !== undefined;
  const hasControlledPreviewStatus = loadState !== undefined;
  const previewFile = file ?? null;
  const previewStatus = loadState ?? TABLE_LOAD_STATE_IDLE;
  const ownedPreviewWorkerRef = createTableRef<Worker | null>(null);
  const ownedPreviewRequestIdRef = createTableRef(0);
  const ownedTableRowsRequestIdRef = createTableRef(0);
  const ownedTableRowsRequestsRef = createTableRef(new Map<number, TableRowsRequest>());
  const ownedTableRowsCacheByFileIdRef = createTableRef(new Map<string, Map<number, unknown[]>>());
  const ownedPreviewLoadedChunksByFileIdRef = createTableRef(new Map<string, Set<number>>());
  const ownedTableRowsCacheRef = createTableRef(new Map<number, unknown[]>());
  const ownedPreviewLoadedChunksRef = createTableRef(new Set<number>());
  const ownedPreviewCacheFileIdRef = createTableRef<string | null>(null);
  const ownedPreviewCacheFileLruRef = createTableRef(new Set<string>());
  const previewWorkerRef = workerRef ?? ownedPreviewWorkerRef;
  const previewRequestIdRef = requestIdRef ?? ownedPreviewRequestIdRef;
  const tableRowsRequestIdRef = rowsRequestIdRef ?? ownedTableRowsRequestIdRef;
  const tableRowsRequestsRef = rowsRequestsRef ?? ownedTableRowsRequestsRef;
  const tableRowsCacheByFileIdRef = rowsCacheByFileIdRef ?? ownedTableRowsCacheByFileIdRef;
  const previewLoadedChunksByFileIdRef = loadedChunksByFileIdRef ?? ownedPreviewLoadedChunksByFileIdRef;
  const tableRowsCacheRef = rowsCacheRef ?? ownedTableRowsCacheRef;
  const previewLoadedChunksRef = loadedChunksRef ?? ownedPreviewLoadedChunksRef;
  const previewCacheFileIdRef = cacheFileIdRef ?? ownedPreviewCacheFileIdRef;
  const previewCacheFileLruRef = cacheFileLruRef ?? ownedPreviewCacheFileLruRef;
  const {
    cancelRowsVersionNotification,
    getRowsVersion,
    notifyRowsVersion,
    subscribeRowsVersion,
  } = memoValue(() => createTableRowCacheVersion(), []);
  const selectionRef = createTableRef<TableSelection>(
    normalizeTableSelection(null),
  );
  const highlightRef = createTableRef<TableHighlight>({});
  const revealCellRef = createTableRef<TableCell | null>(null);
  const zoomPercentRef = createTableRef(TABLE_DEFAULT_ZOOM_PERCENT);
  const selectionSubscribersRef = createTableRef(new Set<(selection: TableSelection) => void>());
  const stateSubscribersRef = createTableRef(new Set<() => void>());

  const deferredActiveFileId = readImmediateValue(activeFileId);
  const deferredActiveSheetId = readImmediateValue(activeSheetId);
  const previewStatusRef = createTableRef<TableLoadState>(previewStatus);
  const previewFileRef = createTableRef<TableFile | null>(previewFile);
  const previewPendingChunksByFileIdRef = createTableRef<Map<string, Set<number>>>(
    new Map(),
  );
  const backendOpenedSourceKeysRef = createTableRef<Set<string>>(new Set());
  const pendingPreviewFileIdRef = createTableRef<string | null>(null);

  const notifyStateChanged = memoCallback(
    (): void => {
      for (const callback of Array.from(stateSubscribersRef.current)) {
        try {
          callback();
        } catch {
          // A broken consumer must not prevent table preview state from updating.
        }
      }
    },
    [stateSubscribersRef],
  );

  const setPreviewFile = memoCallback(
    (value: SetStateAction<TableFile | null>): void => {
      const current = previewFileRef.current;
      const next = resolveStateAction(value, current);
      if (Object.is(current, next)) {
        return;
      }

      previewFileRef.current = next;
      setFile?.(next);
      notifyStateChanged();
    },
    [notifyStateChanged, previewFileRef, setFile],
  );

  const setPreviewStatus = memoCallback(
    (value: SetStateAction<TableLoadState>): void => {
      const current = previewStatusRef.current;
      const next = resolveStateAction(value, current);
      if (areTableLoadStatesEqual(current, next)) {
        return;
      }

      previewStatusRef.current = next;
      setLoadState?.(next);
      notifyStateChanged();
    },
    [notifyStateChanged, previewStatusRef, setLoadState],
  );

  const sourceEntries = memoValue(() => {
    const entries: TableSourceEntry[] = [];

    for (const entry of Array.isArray(rawFiles) ? rawFiles : []) {
      const sourceEntry = createTableSourceEntry(entry);
      if (!sourceEntry) continue;
      entries.push(sourceEntry);
    }

    return entries;
  }, [rawFiles]);

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
    if (!deferredActiveFileId) {
      return null;
    }

    const fileSources = sourcesByFileId.get(deferredActiveFileId);
    if (!fileSources?.length) {
      return null;
    }

    if (deferredActiveSheetId) {
      const selectedSheetSource = fileSources.find(
        (sourceEntry) => sourceEntry.source.sheetId === deferredActiveSheetId,
      );
      if (selectedSheetSource) {
        return selectedSheetSource;
      }
    }

    return fileSources[0] ?? null;
  }, [
    deferredActiveFileId,
    deferredActiveSheetId,
    sourcesByFileId,
  ]);

  const activeSourceKey = selectedSource?.sourceKey ?? null;
  const activeSourceSignature = selectedSource
    ? `${selectedSource.sourceKey}:${selectedSource.sourceVersion}`
    : null;
  const sourcesByKeyRef = createTableRef(new Map<string, TableSourceEntry>());
  const sourcesByFileIdRef = createTableRef(new Map<string, TableSourceEntry[]>());
  const activeSourceKeyRef = createTableRef<string | null>(activeSourceKey);

  runEffect(() => {
    sourcesByKeyRef.current = sourcesByKey;
  }, [sourcesByKey]);

  runEffect(() => {
    sourcesByFileIdRef.current = sourcesByFileId;
  }, [sourcesByFileId]);

  runEffect(() => {
    activeSourceKeyRef.current = activeSourceKey;
  }, [activeSourceKey]);

  runEffect(() => {
    let changed = false;
    if (hasControlledPreviewStatus && !areTableLoadStatesEqual(previewStatusRef.current, previewStatus)) {
      previewStatusRef.current = previewStatus;
      changed = true;
    }
    if (hasControlledPreviewFile && !Object.is(previewFileRef.current, previewFile)) {
      previewFileRef.current = previewFile;
      changed = true;
    }
    if (changed) {
      notifyStateChanged();
    }
  }, [
    hasControlledPreviewFile,
    hasControlledPreviewStatus,
    notifyStateChanged,
    previewFile,
    previewStatus,
  ]);

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
  }, [activeSourceSignature]);

  const clearPendingPreviewRequest = memoCallback((requestId: number) => {
    if (requestId === previewRequestIdRef.current) {
      pendingPreviewFileIdRef.current = null;
    }
  }, [previewRequestIdRef]);

  const getOrCreatePreviewFileCaches = memoCallback(
    (fileId: string) => {
      const cacheByFileId = tableRowsCacheByFileIdRef.current;
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
    [previewLoadedChunksByFileIdRef, tableRowsCacheByFileIdRef],
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
      const safeRows = sanitizeTableRowBatch(rows);
      if (!safeRows.length) return false;

      const { loadedChunks, rowCache } = getOrCreatePreviewFileCaches(fileId);
      const safeStart = Math.max(0, Math.floor(Number(startRow) || 0));
      const merged = mergeChunkRangeRows({
        rowCache,
        loadedChunks,
        rangeStart: safeStart,
        rangeEnd: safeStart + safeRows.length,
        rows: safeRows,
        chunkSize: TABLE_UI_CHUNK_SIZE_ROWS,
        maxChunks: TABLE_MAX_CACHED_UI_CHUNKS_PER_FILE,
      });
      return merged.complete;
    },
    [getOrCreatePreviewFileCaches],
  );

  const cancelPendingTableRowRequests = memoCallback(() => {
    const pendingRequests = tableRowsRequestsRef.current;
    for (const request of pendingRequests.values()) {
      try {
        request?.resolve?.([]);
      } catch {
        // ignore
      }
    }

    pendingRequests.clear();
    previewPendingChunksByFileIdRef.current = new Map();
  }, [tableRowsRequestsRef]);

  const notifyTableRowsCacheChanged = memoCallback(() => {
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
      tableRowsCacheRef.current = rowCache;
      previewLoadedChunksRef.current = loadedChunks;
    },
    [previewCacheFileIdRef, previewLoadedChunksRef, tableRowsCacheRef],
  );

  const postPreviewDispose = memoCallback(
    (fileId: string) => {
      if (typeof fileId !== "string" || !fileId) return;

      previewWorkerRef.current?.postMessage({
        type: "tableDispose",
        payload: { fileId },
      });
      backendOpenedSourceKeysRef.current.delete(fileId);
      if (tableBackendService.canDisposeFile()) {
        void tableBackendService.disposeFile({ fileId });
      }
    },
    [backendOpenedSourceKeysRef, previewWorkerRef, tableBackendService],
  );

  const resetCurrentPreviewCache = memoCallback(() => {
    assignCurrentPreviewCache();
    notifyTableRowsCacheChanged();
  }, [assignCurrentPreviewCache, notifyTableRowsCacheChanged]);

  const clearAllPreviewCaches = memoCallback(() => {
    previewWorkerRef.current?.postMessage({
      type: "tableDispose",
      payload: { clear: true },
    });
    tableRowsCacheByFileIdRef.current = new Map();
    previewLoadedChunksByFileIdRef.current = new Map();
    previewCacheFileLruRef.current = new Set();
    previewPendingChunksByFileIdRef.current = new Map();
    backendOpenedSourceKeysRef.current = new Set();
    if (tableBackendService.canDisposeFile()) {
      void tableBackendService.disposeFile({ clear: true });
    }
    assignCurrentPreviewCache();
    notifyTableRowsCacheChanged();
  }, [
    assignCurrentPreviewCache,
    notifyTableRowsCacheChanged,
    backendOpenedSourceKeysRef,
    previewCacheFileLruRef,
    previewLoadedChunksByFileIdRef,
    tableRowsCacheByFileIdRef,
    previewWorkerRef,
    tableBackendService,
  ]);

  const invalidatePreviewRequests = memoCallback(() => {
    previewRequestIdRef.current += 1;
    cancelPendingTableRowRequests();
    pendingPreviewFileIdRef.current = null;
    previewPendingChunksByFileIdRef.current = new Map();
  }, [cancelPendingTableRowRequests, previewRequestIdRef]);

  const clearPreviewState = memoCallback(
    ({ clearSelection = false }: { clearSelection?: boolean } = {}) => {
      setPreviewFile(null);
      setPreviewStatus(TABLE_LOAD_STATE_IDLE);
      pendingPreviewFileIdRef.current = null;

      if (clearSelection) {
        const clearedSelection = normalizeTableSelection(null);
        if (!areTableSelectionsEqual(selectionRef.current, clearedSelection)) {
          selectionRef.current = clearedSelection;
          for (const callback of Array.from(selectionSubscribersRef.current)) {
            try {
              callback(clearedSelection);
            } catch {
              // A broken consumer must not prevent table selection from clearing.
            }
          }
        }
      }

      clearAllPreviewCaches();
    },
    [
      clearAllPreviewCaches,
      selectionRef,
      selectionSubscribersRef,
      setPreviewFile,
      setPreviewStatus,
    ],
  );

  runEffect(() => {
    invalidatePreviewRequests();

    if (!selectedSource || !isTableFileForSourceEntry(previewFileRef.current, selectedSource)) {
      clearPreviewState();
    }
  }, [
    activeSourceSignature,
    clearPreviewState,
    invalidatePreviewRequests,
    previewFileRef,
  ]);

  const disposePreviewSourceCache = memoCallback(
    (sourceKey: string) => {
      if (typeof sourceKey !== "string" || !sourceKey) return;

      tableRowsCacheByFileIdRef.current.delete(sourceKey);
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
      tableRowsCacheByFileIdRef,
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

      while (fileLru.size > TABLE_MAX_CACHED_FILES) {
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

      if (type === "tablePreviewResult" && payload) {
        const previewPayload = payload as TablePreviewResultPayload;
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
          sourceVersion: sourceEntry?.sourceVersion,
          rowCount: Number(previewPayload.rowCount) || 0,
          columnCount: Number(previewPayload.columnCount) || 0,
          maxCellLengths,
        };
        const currentPreviewFile = previewFileRef.current;
        const hasSamePreviewFile =
          isTableFileForSource(currentPreviewFile, sourceKey) &&
          areTableFilesEqual(currentPreviewFile, nextPreviewFile);
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

      if (type === "tableRowsResult" && payload) {
        const rowsPayload = payload as TableRowsResultPayload;
        const requestId = Number(rowsPayload.requestId);
        if (!Number.isFinite(requestId)) return;

        const pendingRequest = tableRowsRequestsRef.current.get(requestId);
        if (!pendingRequest) return;

        tableRowsRequestsRef.current.delete(requestId);

        const { reject, resolve } = pendingRequest;

        try {
          const fileId =
            typeof rowsPayload.fileId === "string" ? rowsPayload.fileId : "";
          const startRow = Math.max(
            0,
            Math.floor(Number(rowsPayload.startRow) || 0),
          );
          const rows = sanitizeTableRowBatch(rowsPayload.rows);

          const isMatched = isTableRowBatchResultForRequest({
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
        const workerMessage =
          typeof errorPayload.message === "string" && errorPayload.message
            ? errorPayload.message
            : "Unknown worker error";
        const errorMessage = localize(
          "table.preview.workerFailed",
          "Preview worker failed.",
        );

        if (
          requestId !== previewRequestIdRef.current &&
          !tableRowsRequestsRef.current.has(requestId)
        ) {
          return;
        }

        if (tableRowsRequestsRef.current.has(requestId)) {
          const pendingRequest = tableRowsRequestsRef.current.get(requestId);
          tableRowsRequestsRef.current.delete(requestId);
          pendingRequest?.reject?.(new Error(errorMessage));
          return;
        }

        console.error("Preview worker error:", workerMessage);
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
      tableRowsRequestsRef,
      previewRequestIdRef,
      setPreviewFile,
      clearPendingPreviewRequest,
      sourcesByKeyRef,
    ],
  );

  const createPreviewWorker = memoCallback(() => {
    const worker = new Worker(
      new URL("./tableRowReadWorker.ts", import.meta.url),
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
    cancelPendingTableRowRequests();

    if (previewWorkerRef.current) {
      previewWorkerRef.current.terminate();
      previewWorkerRef.current = null;
    }
  }, [cancelPendingTableRowRequests, previewWorkerRef]);

  runEffect(() => {
    return () => {
      invalidatePreviewRequests();
      clearAllPreviewCaches();
      resetPreviewWorker();
    };
  }, [clearAllPreviewCaches, invalidatePreviewRequests, resetPreviewWorker]);

  runEffect(() => {
    const targetSource = selectedSource;
    const targetFile = targetSource?.entry ?? null;
    const targetSourceKey = targetSource?.sourceKey ?? null;
    const targetSourceSignature = activeSourceSignature;
    if (!targetSource || !targetFile?.file || !targetFile?.fileId || !targetSourceKey) return;
    if (isTableFileForSourceEntry(previewFileRef.current, targetSource)) return;
    if (pendingPreviewFileIdRef.current === targetSourceSignature) return;

    const previewTargetSource = targetSource;
    const previewTargetFile = targetFile;
    const previewTargetSourceKey = targetSourceKey;
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    pendingPreviewFileIdRef.current = targetSourceSignature;

    runImmediately(() => {
      setPreviewStatus({ state: "loading", message: localize("table.preview.loadingTitle", "Loading preview...") });
    });

    const postWorkerPreview = async () => {
      const worker = getOrCreatePreviewWorker();
      if (!worker) return;
      const fallbackFile =
        (await loadConvertedCsvFile({
          convertedCsvReaderService: tableBackendService,
          fallbackFile: previewTargetFile.file,
          fileName: previewTargetFile.fileName,
          lastModified:
            previewTargetFile.file instanceof File ? previewTargetFile.file.lastModified : null,
          normalizedCsvPath: previewTargetFile.normalizedCsvPath,
        })) ?? previewTargetFile.file;
      if (requestId !== previewRequestIdRef.current) {
        return;
      }

      worker.postMessage({
        type: "tablePreview",
        payload: {
          requestId,
          fileId: previewTargetSourceKey,
          sourceKey: previewTargetSourceKey,
          physicalFileId: previewTargetSource.source.fileId,
          sheetId: previewTargetSource.source.sheetId ?? null,
          sheetName: previewTargetSource.sheetName,
          file: fallbackFile,
          maxSeedRows: TABLE_MAX_CACHED_UI_ROWS_PER_FILE,
        },
      });
    };

    const backendInputPath =
      typeof previewTargetFile.normalizedCsvPath === "string" &&
      previewTargetFile.normalizedCsvPath.trim()
        ? previewTargetFile.normalizedCsvPath.trim()
        : typeof previewTargetFile.sourcePath === "string" &&
            previewTargetFile.sourcePath.trim().toLowerCase().endsWith(".csv")
          ? previewTargetFile.sourcePath.trim()
          : null;
    if (backendInputPath && tableBackendService.canOpenFile()) {
      void tableBackendService
        .openFile({
          fileId: previewTargetSourceKey,
          fileName: previewTargetFile.fileName ?? "",
          path: backendInputPath,
          seedRows: TABLE_MAX_CACHED_UI_ROWS_PER_FILE,
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

          const previewPayload = response.result as TablePreviewResultPayload;
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
            sourceVersion: previewTargetSource.sourceVersion,
            rowCount: Number(previewPayload.rowCount) || 0,
            columnCount: Number(previewPayload.columnCount) || 0,
            maxCellLengths,
          };

          if (requestId !== previewRequestIdRef.current) {
            if (sourceKey && sourceKey !== activeSourceKeyRef.current) {
              postPreviewDispose(sourceKey);
            }
            return;
          }

          if (sourceKey) {
            const currentPreviewFile = previewFileRef.current;
            const hasSamePreviewFile =
              isTableFileForSource(currentPreviewFile, sourceKey) &&
              areTableFilesEqual(currentPreviewFile, nextPreviewFile);
            const shouldUpdatePreviewStatus =
              previewStatusRef.current.state !== "ready" ||
              previewStatusRef.current.message !== "";

            if (hasSamePreviewFile && !shouldUpdatePreviewStatus) return;
          }

          if (sourceKey) {
            backendOpenedSourceKeysRef.current.add(sourceKey);
            touchPreviewFileCache({ fileId: sourceKey });
            mergePreviewSeedRows(
              sourceKey,
              Number(previewPayload.seedStartRow) || 0,
              Array.isArray(previewPayload.seedRows)
                ? previewPayload.seedRows
                : [],
            );
          }

          activatePreviewFileCache(sourceKey);

          runImmediately(() => {
            if (
              !(
                isTableFileForSource(previewFileRef.current, sourceKey) &&
                areTableFilesEqual(previewFileRef.current, nextPreviewFile)
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
    activeSourceSignature,
    activeSourceKeyRef,
    backendOpenedSourceKeysRef,
    deferredActiveFileId,
    deferredActiveSheetId,
    getOrCreatePreviewWorker,
    mergePreviewSeedRows,
    postPreviewDispose,
    previewFileRef,
    previewRequestIdRef,
    setPreviewStatus,
    touchPreviewFileCache,
  ]);

  const getTableRow = memoCallback(
    (rowIndex: number): unknown[] | null => {
      const normalizedIndex = Number(rowIndex);
      if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) return null;
      return tableRowsCacheRef.current.get(normalizedIndex) ?? null;
    },
    [tableRowsCacheRef],
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

  const requestTableRowsRange = memoCallback(
    (fileId: string, startRow: number, endRow: number): Promise<unknown[][]> => {
      const sourceKey = resolveRequestSourceKey(fileId);
      if (!sourceKey) return Promise.resolve([]);

      const requestId = tableRowsRequestIdRef.current + 1;
      tableRowsRequestIdRef.current = requestId;

      const start = Math.max(0, Math.floor(Number(startRow) || 0));
      const end = Math.max(start, Math.floor(Number(endRow) || start));

      const requestRowsWithWorker = () => {
        const worker = getOrCreatePreviewWorker();
        if (!worker) return Promise.resolve([]);

        return new Promise<unknown[][]>((resolve, reject) => {
          tableRowsRequestsRef.current.set(requestId, {
            endRow: end,
            fileId: sourceKey,
            reject,
            resolve,
            sourceKey,
            startRow: start,
          });
          worker.postMessage({
            type: "tableRows",
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
        backendOpenedSourceKeysRef.current.has(sourceKey) &&
        tableBackendService.canGetPreviewRows()
      ) {
        return tableBackendService
          .getPreviewRows({
            endRow: end,
            fileId: sourceKey,
            sourceKey,
            startRow: start,
          })
          .then((response: any) => {
            if (!response?.ok || !response?.result) return [];
            const rowsPayload = response.result as TableRowsResultPayload;
            const rows = sanitizeTableRowBatch(rowsPayload.rows);
            const payloadFileId =
              typeof rowsPayload.fileId === "string" ? rowsPayload.fileId : "";
            const payloadStartRow = Math.max(
              0,
              Math.floor(Number(rowsPayload.startRow) || 0),
            );
            const isMatched = isTableRowBatchResultForRequest({
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
      tableRowsRequestIdRef,
      tableRowsRequestsRef,
      resolveRequestSourceKey,
    ],
  );

  const ensureTableCells = memoCallback(
    async (fileId: string, cells: TableCellReadRequest[]) => {
      const sourceKey = resolveRequestSourceKey(fileId);
      if (!sourceKey || !Array.isArray(cells) || !cells.length) return;
      const currentPreviewFile = previewFileRef.current;
      if (!currentPreviewFile?.rowCount || !Number.isFinite(currentPreviewFile.rowCount)) return;

      const totalRows = Math.max(0, Math.floor(currentPreviewFile.rowCount));
      const columnCount = Math.max(
        0,
        Math.floor(Number(currentPreviewFile.columnCount) || 0),
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
        backendOpenedSourceKeysRef.current.has(sourceKey) &&
        tableBackendService.canReadCells()
      ) {
        const requestCells = buildTableCellReadRequests({
          columnCount,
          rowIndices: requestedRows,
        });
        if (requestCells.length > 0) {
          try {
            const response = await tableBackendService.readCells({
              cells: requestCells,
              fileId: sourceKey,
              sourceKey,
            });
            if (response?.ok && response?.result) {
              const result = response.result as { cells?: unknown };
              const rowsByIndex = rowsFromTableCellReads({
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
            // Fall through to the existing table-row path.
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
        const rows = await requestTableRowsRange(sourceKey, rangeStart, rangeEnd);
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
      previewFileRef,
      requestTableRowsRange,
      resolveRequestSourceKey,
    ],
  );

  const ensureTableRows = memoCallback(
    async (fileId: string, startRow: number, endRow: number) => {
      const currentPreviewFile = previewFileRef.current;
      if (!currentPreviewFile?.rowCount || !Number.isFinite(currentPreviewFile.rowCount)) return;
      const sourceKey = resolveRequestSourceKey(fileId);
      if (!sourceKey) return;

      const { loadedChunks, rowCache } = getOrCreatePreviewFileCaches(sourceKey);
      const pendingChunks = getOrCreatePendingChunks(sourceKey);
      const totalRows = Math.max(0, Math.floor(currentPreviewFile.rowCount));
      const start = Math.max(0, Math.min(totalRows, Math.floor(startRow || 0)));
      const end = Math.max(start, Math.min(totalRows, Math.floor(endRow || 0)));
      if (start >= end) return;

      const firstChunkStart =
        Math.floor(start / TABLE_UI_CHUNK_SIZE_ROWS) *
        TABLE_UI_CHUNK_SIZE_ROWS;
      const lastChunkStart =
        Math.floor((end - 1) / TABLE_UI_CHUNK_SIZE_ROWS) *
        TABLE_UI_CHUNK_SIZE_ROWS;

      for (
        let chunkStart = firstChunkStart;
        chunkStart <= lastChunkStart;
        chunkStart += TABLE_UI_CHUNK_SIZE_ROWS
      ) {
        const chunkEnd = Math.min(
          totalRows,
          chunkStart + TABLE_UI_CHUNK_SIZE_ROWS,
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
        chunkSize: TABLE_UI_CHUNK_SIZE_ROWS,
        maxRangeRows: PREVIEW_ROWS_MAX_MERGED_REQUEST_ROWS,
      });

      let shouldNotifyTableRows = false;
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
            rows = await requestTableRowsRange(sourceKey, rangeStart, rangeEnd);
            if (rows.length === expectedRows) break;
          }

          const merged = mergeChunkRangeRows({
            rowCache,
            loadedChunks,
            rangeStart,
            rangeEnd,
            rows,
            chunkSize: TABLE_UI_CHUNK_SIZE_ROWS,
            maxChunks: TABLE_MAX_CACHED_UI_CHUNKS_PER_FILE,
          });
          if (!merged.complete) return;

          if (
            previewCacheFileIdRef.current === sourceKey &&
            merged.mergedChunkStarts.length > 0
          ) {
            shouldNotifyTableRows = true;
          }
        })()
          .catch(() => {
            for (const chunkStart of chunkStarts) {
              clearChunkRows(
                rowCache,
                chunkStart,
                chunkStart + TABLE_UI_CHUNK_SIZE_ROWS,
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

      if (shouldNotifyTableRows) {
        notifyRowsVersion();
      }
    },
    [
      getOrCreatePendingChunks,
      getOrCreatePreviewFileCaches,
      notifyRowsVersion,
      previewCacheFileIdRef,
      previewFileRef,
      requestTableRowsRange,
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

  const onDidChangeState = memoCallback(
    (callback: () => void): (() => void) => {
      stateSubscribersRef.current.add(callback);
      return () => stateSubscribersRef.current.delete(callback);
    },
    [stateSubscribersRef],
  );

  const setSelection = memoCallback(
    (selection: TableSelection | null): void => {
      const normalizedSelection = normalizeTableSelection(selection);
      if (areTableSelectionsEqual(selectionRef.current, normalizedSelection)) {
        return;
      }

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

  const clearSelection = memoCallback(
    (): boolean => {
      setSelection(null);
      return true;
    },
    [setSelection],
  );

  const selectAllColumns = memoCallback(
    (): boolean => {
      const currentFile = previewFileRef.current;
      if (!isTableFileForSourceEntry(currentFile, selectedSource)) {
        return false;
      }

      const columnCount = Math.max(0, Math.floor(Number(currentFile?.columnCount) || 0));
      if (columnCount === 0) {
        return false;
      }

      const selectedColumns: number[] = [];
      for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
        selectedColumns.push(colIndex);
      }

      setSelection({
        ...selectionRef.current,
        selectedColumns,
      });
      return true;
    },
    [previewFileRef, selectedSource, selectionRef, setSelection],
  );

  const setZoomPercent = memoCallback(
    (zoomPercent: number): boolean => {
      const nextZoomPercent = clampTableZoomPercent(zoomPercent);
      if (nextZoomPercent === zoomPercentRef.current) {
        return false;
      }

      zoomPercentRef.current = nextZoomPercent;
      notifyStateChanged();
      return true;
    },
    [notifyStateChanged, zoomPercentRef],
  );

  const zoomIn = memoCallback(
    (): boolean => setZoomPercent(zoomPercentRef.current + TABLE_ZOOM_STEP_PERCENT),
    [setZoomPercent, zoomPercentRef],
  );

  const zoomOut = memoCallback(
    (): boolean => setZoomPercent(zoomPercentRef.current - TABLE_ZOOM_STEP_PERCENT),
    [setZoomPercent, zoomPercentRef],
  );

  const resetZoom = memoCallback(
    (): boolean => setZoomPercent(TABLE_DEFAULT_ZOOM_PERCENT),
    [setZoomPercent],
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
        sourcesByFileIdRef.current.get(String(activeFileId ?? "")) ?? [];
      const selectedSourceForName = activeSheetId
        ? selectedFileSources.find(
            (sourceEntry) => sourceEntry.source.sheetId === activeSheetId,
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
      const hasCurrentSource = isTableFileForSourceEntry(currentFile, selectedSource);
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
        selectedFileId: activeFileId ?? null,
        selectedSheetId: activeSheetId ?? null,
        source: selectedSource?.source ?? null,
        sourceKey: activeSourceKey,
        zoomPercent: zoomPercentRef.current,
      };
    },
    [
      previewFileRef,
      previewStatusRef,
      activeFileId,
      activeSheetId,
      activeSourceKey,
      selectedSource,
      sourcesByFileIdRef,
      zoomPercentRef,
    ],
  );

  const hasSourceFile = memoCallback(
    (fileId: string | null | undefined): boolean =>
      Boolean(fileId && sourcesByFileIdRef.current.has(fileId)),
    [sourcesByFileIdRef],
  );

  return {
    cancelPendingRowRequests: cancelPendingTableRowRequests,
    clearHighlight,
    clearSelection,
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
    onDidChangeState,
    onDidChangeSelection,
    revealCell,
    resetZoom,
    resetWorker: resetPreviewWorker,
    selectAllColumns,
    setSelection,
    setZoomPercent,
    highlightColumns,
    subscribeRowsVersion,
    zoomIn,
    zoomOut,
  };
};

const toBrowserTableOptions = (options: CreateTableModelWithScopeOptions): UseTableOptions => ({
  ...options,
  workerRef: asBrowserWorkerRef(options.workerRef),
});

const asBrowserWorkerRef = (
  workerRef: CreateTableModelWithScopeOptions["workerRef"],
): TableMutableRef<Worker | null> | undefined => {
  if (!workerRef || typeof workerRef !== "object" || !("current" in workerRef)) {
    return undefined;
  }

  return workerRef as TableMutableRef<Worker | null>;
};

type TableTargetContext = {
  readonly columnCount: number;
  readonly file: TableFile;
  readonly fileIds: ReadonlySet<string>;
  readonly rowCount: number;
  readonly sheetId: string | null;
};

const getTableTargetContext = (tableModel: TableModel): TableTargetContext | null => {
  const state = tableModel.getState();
  const file = state.file;
  if (!file) {
    return null;
  }

  const rowCount = Math.max(0, Math.floor(Number(file.rowCount) || 0));
  const columnCount = Math.max(0, Math.floor(Number(file.columnCount) || 0));
  const fileIds = new Set<string>();
  for (const value of [
    file.fileId,
    file.sourceKey,
    state.selectedFileId,
    state.source?.fileId,
    state.sourceKey,
  ]) {
    if (typeof value === "string" && value) {
      fileIds.add(value);
    }
  }

  const sheetId = firstString(file.sheetId, state.selectedSheetId, state.source?.sheetId);

  return {
    columnCount,
    file,
    fileIds,
    rowCount,
    sheetId,
  };
};

const firstString = (...values: readonly unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return null;
};

const acceptsTargetFile = (
  context: TableTargetContext,
  fileId: string | null | undefined,
): boolean =>
  !fileId ||
  context.fileIds.size === 0 ||
  context.fileIds.has(fileId);

const acceptsTargetSheet = (
  context: TableTargetContext,
  sheetId: string | null | undefined,
): boolean =>
  !sheetId ||
  !context.sheetId ||
  sheetId === context.sheetId;

const normalizeTargetCell = (
  tableModel: TableModel,
  cell: TableCell,
): TableCell | null => {
  const context = getTableTargetContext(tableModel);
  const normalizedCell = normalizeTableCell(cell);
  if (!context || !normalizedCell) {
    return null;
  }

  if (
    context.rowCount <= 0 ||
    context.columnCount <= 0 ||
    normalizedCell.rowIndex >= context.rowCount ||
    normalizedCell.colIndex >= context.columnCount ||
    !acceptsTargetFile(context, normalizedCell.fileId) ||
    !acceptsTargetSheet(context, normalizedCell.sheetId)
  ) {
    return null;
  }

  return {
    ...normalizedCell,
    fileId: context.file.fileId,
    sheetId: context.sheetId,
  };
};

const normalizeTargetRange = (
  tableModel: TableModel,
  range: TableRange,
): TableRange | null => {
  const context = getTableTargetContext(tableModel);
  const normalizedRange = normalizeTableSelection({ ranges: [range] }).ranges?.[0];
  if (!context || !normalizedRange) {
    return null;
  }

  if (
    context.rowCount <= 0 ||
    context.columnCount <= 0 ||
    normalizedRange.startRow >= context.rowCount ||
    normalizedRange.startCol >= context.columnCount ||
    !acceptsTargetFile(context, normalizedRange.fileId) ||
    !acceptsTargetSheet(context, normalizedRange.sheetId)
  ) {
    return null;
  }

  const endRow = Math.min(normalizedRange.endRow, context.rowCount - 1);
  const endCol = Math.min(normalizedRange.endCol, context.columnCount - 1);
  if (endRow < normalizedRange.startRow || endCol < normalizedRange.startCol) {
    return null;
  }

  return {
    ...normalizedRange,
    endCol,
    endRow,
    fileId: context.file.fileId,
    sheetId: context.sheetId,
  };
};

const normalizeTargetColumns = (
  tableModel: TableModel,
  columns: readonly number[],
): number[] | null => {
  const context = getTableTargetContext(tableModel);
  if (!context || context.columnCount <= 0) {
    return null;
  }

  const normalizedColumns = normalizeColumnIndexes(columns);
  if (normalizedColumns.some((columnIndex) => columnIndex >= context.columnCount)) {
    return null;
  }

  return normalizedColumns;
};

const resolveSelectionForTarget = (
  tableModel: TableModel,
  target: TableSelectionTarget,
): TableSelection | null => {
  const selection = tableModel.getSelection();

  switch (target.kind) {
    case "cell": {
      if (!target.cell) {
        return {
          ...selection,
          activeCell: null,
        };
      }
      const activeCell = normalizeTargetCell(tableModel, target.cell);
      return activeCell
        ? {
            activeCell,
            selectedColumns: selection.selectedColumns ?? [],
          }
        : null;
    }
    case "range": {
      const range = normalizeTargetRange(tableModel, target.range);
      return range
        ? {
            activeCell: {
              colIndex: range.startCol,
              fileId: range.fileId,
              rowIndex: range.startRow,
              sheetId: range.sheetId,
            },
            ranges: [range],
            selectedColumns: selection.selectedColumns ?? [],
          }
        : null;
    }
    case "columns": {
      const selectedColumns = normalizeTargetColumns(tableModel, target.columns);
      return selectedColumns
        ? {
            ...selection,
            selectedColumns,
          }
        : null;
    }
  }
};

const resolveRevealCellForTarget = (
  tableModel: TableModel,
  target: TableRevealTarget,
): TableCell | null => {
  switch (target.kind) {
    case "cell":
      return normalizeTargetCell(tableModel, target.cell);
    case "range": {
      const range = normalizeTargetRange(tableModel, target.range);
      return range
        ? {
            colIndex: range.startCol,
            fileId: range.fileId,
            rowIndex: range.startRow,
            sheetId: range.sheetId,
          }
        : null;
    }
  }
};

export const createTableModelWithScope = (
  options: CreateTableModelWithScopeOptions,
): TableModel => {
  const browserOptions = toBrowserTableOptions(options);
  const scope = getTableStateScope(
    browserOptions.workerRef ?? defaultTableStateScopeKey,
  );
  return runWithTableStateScope(scope, () => createTableModel(browserOptions));
};

export class TableService extends Disposable implements ITableService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeSelectionEmitter =
    this._register(new Emitter<TableSelection>());
  public readonly onDidChangeSelection =
    this.onDidChangeSelectionEmitter.event;

  private readonly onDidChangeTableViewInputEmitter =
    this._register(new Emitter<void>());
  public readonly onDidChangeTableViewInput =
    this.onDidChangeTableViewInputEmitter.event;

  private readonly scope = this._register(new TableStateScope());
  private tableModel: TableModel | null = null;
  private viewInput: TableViewInput | null = null;
  private selectionTableModel: TableModel | null = null;
  private tableModelSelectionListener: (() => void) | null = null;

  public constructor(
    @ITableBackendService private readonly tableBackendService: ITableBackendService,
  ) {
    super();
  }

  public update(options: TableInput): TableModel {
    const tableModel = runWithTableStateScope(this.scope, () => createTableModel({
      ...toBrowserTableOptions(options),
      tableBackendService: options.tableBackendService ?? this.tableBackendService,
    }));
    this.bindActiveTableModel(tableModel);
    return tableModel;
  }

  public override dispose(): void {
    this.tableModelSelectionListener?.();
    this.tableModelSelectionListener = null;
    this.selectionTableModel = null;
    this.tableModel = null;

    if (this.viewInput) {
      this.viewInput = null;
      this.onDidChangeTableViewInputEmitter.fire(undefined);
    }

    super.dispose();
  }

  public getViewInput(): TableViewInput | null {
    return this.viewInput;
  }

  public getSelection(): TableSelection {
    return this.getActiveTableModel()?.getSelection() ?? normalizeTableSelection(null);
  }

  public clearHighlight(): void {
    this.getActiveTableModel()?.clearHighlight();
  }

  public select(
    target: TableSelectionTarget | null,
    reveal?: TableRevealMode,
  ): boolean {
    const tableModel = this.getActiveTableModel();
    if (!tableModel) {
      return false;
    }

    if (!target) {
      return tableModel.clearSelection();
    }

    const selection = resolveSelectionForTarget(tableModel, target);
    if (!selection) {
      return false;
    }

    tableModel.setSelection(selection);
    if (reveal && target.kind === "range") {
      this.revealTarget(tableModel, target);
    } else if (reveal && target.kind === "cell" && target.cell) {
      this.revealTarget(tableModel, {
        kind: "cell",
        cell: target.cell,
      });
    }
    return true;
  }

  public reveal(
    target: TableRevealTarget | null,
    _options: TableRevealOptions = {},
  ): boolean {
    const tableModel = this.getActiveTableModel();
    if (!tableModel) {
      return false;
    }

    if (!target) {
      tableModel.revealCell(null);
      return true;
    }

    return this.revealTarget(tableModel, target);
  }

  public executeCommand(commandId: TableCommandId): boolean {
    const tableModel = this.getActiveTableModel();
    if (!tableModel) {
      return false;
    }

    switch (commandId) {
      case TableCommandId.clearSelection:
        return tableModel.clearSelection();
      case TableCommandId.resetZoom:
        return tableModel.resetZoom();
      case TableCommandId.selectAllColumns:
        return tableModel.selectAllColumns();
      case TableCommandId.zoomIn:
        return tableModel.zoomIn();
      case TableCommandId.zoomOut:
        return tableModel.zoomOut();
    }

    return false;
  }

  public updateViewInput(input: TableViewInput): void {
    if (this.viewInput && isSameTableViewInput(this.viewInput, input)) {
      return;
    }

    this.viewInput = input;
    this.bindActiveTableModel(input.tableModel);
    this.onDidChangeTableViewInputEmitter.fire(undefined);
  }

  private getActiveTableModel(): TableModel | null {
    return this.tableModel ?? this.viewInput?.tableModel ?? null;
  }

  private revealTarget(
    tableModel: TableModel,
    target: TableRevealTarget,
  ): boolean {
    const cell = resolveRevealCellForTarget(tableModel, target);
    if (!cell) {
      return false;
    }

    tableModel.revealCell(cell);
    return true;
  }

  private bindActiveTableModel(tableModel: TableModel): void {
    this.tableModel = tableModel;
    if (this.selectionTableModel === tableModel) {
      return;
    }

    this.tableModelSelectionListener?.();
    this.selectionTableModel = tableModel;
    this.tableModelSelectionListener = tableModel.onDidChangeSelection((selection) => {
      this.onDidChangeSelectionEmitter.fire(selection);
    });
  }
}

export const createTableModelForInput = (options: UseTableOptions): TableModel => {
  return createTableModelWithScope(options);
};

registerSingleton(ITableService, TableService, InstantiationType.Delayed);

const isSameTableViewInput = (
  current: TableViewInput,
  next: TableViewInput,
): boolean =>
  current.tableModel === next.tableModel &&
  isSameTableState(current.tableState, next.tableState);

const isSameTableState = (
  current: TableState,
  next: TableState,
): boolean =>
  current.selectedFileId === next.selectedFileId &&
  current.selectedSheetId === next.selectedSheetId &&
  current.sourceKey === next.sourceKey &&
  current.fileName === next.fileName &&
  current.dimensions === next.dimensions &&
  current.zoomPercent === next.zoomPercent &&
  isSameTableSource(current.source, next.source) &&
  areNullableTableFilesEqual(current.file, next.file) &&
  areTableLoadStatesEqual(current.loadState, next.loadState);

const isSameTableSource = (
  current: TableSource | null | undefined,
  next: TableSource | null | undefined,
): boolean =>
  current?.fileId === next?.fileId &&
  current?.sheetId === next?.sheetId;

const areNullableTableFilesEqual = (
  current: TableFile | null | undefined,
  next: TableFile | null | undefined,
): boolean => {
  if (!current || !next) {
    return current === next;
  }

  return areTableFilesEqual(current, next);
};
