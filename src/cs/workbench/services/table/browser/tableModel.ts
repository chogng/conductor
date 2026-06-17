/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { Disposable } from "src/cs/base/common/lifecycle";
import type {
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import {
  type TableModel,
  type TableRowsReaderProvider,
  type TableSource,
  toTableSourceKey,
} from "src/cs/workbench/services/table/common/table";
import {
  chooseColumnScaleExponentFromCells,
  parseNumericCell,
  toScaleHeaderSuffix,
} from "src/cs/workbench/services/table/common/numericFormat";
import {
  DEFAULT_TABLE_DISPLAY_SIGNIFICANT_DIGITS,
  type ColumnDisplayProfile,
  type NumericDisplayMode,
} from "src/cs/workbench/services/table/common/tableDisplayProfile";
import { loadConvertedCsvFile } from "src/cs/workbench/services/files/browser/fileConverter";

// TableModel owns the service data plane: source switching, worker lifecycle,
// row paging, cache state, and the command-visible selection/highlight/reveal
// snapshot. The pure cache/cell-read helpers live here so callers do not depend
// on small implementation files beside the model owner.

type TableCellReadRequest = Parameters<TableModel["ensureCells"]>[1][number];
type TableState = ReturnType<TableModel["getState"]>;
type TableCell = NonNullable<ReturnType<TableModel["getRevealCell"]>>;
type TableSelection = ReturnType<TableModel["getSelection"]>;
type TableRange = NonNullable<TableSelection["ranges"]>[number];
type TableFile = NonNullable<TableState["file"]>;
type TableHighlight = ReturnType<TableModel["getHighlight"]>;
type TableLoadState = TableState["loadState"];

export const TABLE_UI_CHUNK_SIZE_ROWS = 50;
export const TABLE_MAX_CACHED_UI_ROWS_PER_FILE = 5000;
export const TABLE_MAX_CACHED_FILES = 20;
const TABLE_COLUMN_NUMERIC_THRESHOLD = 0.8;
const TABLE_COLUMN_PROFILE_MAX_SAMPLE_ROWS = 5000;
const TABLE_COLUMN_PROFILE_MIN_STABLE_SAMPLE_ROWS = 20;
const TABLE_COLUMN_PROFILE_ALGORITHM_VERSION = 3;
const TABLE_COLUMN_DISPLAY_SCALE_MIN_EXPONENT = -24;
const TABLE_COLUMN_DISPLAY_SCALE_MAX_EXPONENT = 24;

type TableRowCache = Map<number, unknown[]>;
type TableLoadedChunks = Set<number>;

type TableCellReadResult = TableCellReadRequest & {
  value?: unknown;
};

export type MissingTableRowChunkRange = {
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly chunkStarts: readonly number[];
};

export type MergeTableChunkRangeResult = {
  readonly complete: boolean;
  readonly mergedChunkStarts: readonly number[];
};

const toSafeInt = (value: unknown, fallback = 0): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
};

const toSafeIndex = (value: unknown): number | null => {
  const index = Math.floor(Number(value));
  return Number.isInteger(index) && index >= 0 ? index : null;
};

export const normalizeTableCell = (cell: TableCell | null | undefined): TableCell | null => {
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

export const normalizeColumnIndexes = (columnIndexes: readonly number[] | undefined): number[] =>
  Array.from(new Set(
    (Array.isArray(columnIndexes) ? columnIndexes : [])
      .map((columnIndex) => Math.floor(Number(columnIndex)))
      .filter((columnIndex) => Number.isInteger(columnIndex) && columnIndex >= 0),
  )).sort((a, b) => a - b);

export const normalizeTableSelection = (
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

        return {
          fileId: typeof range.fileId === "string" ? range.fileId : null,
          sheetId: typeof range.sheetId === "string" ? range.sheetId : null,
          startRow: Math.max(0, Math.min(startRow, endRow)),
          endRow: Math.max(0, Math.max(startRow, endRow)),
          startCol: Math.max(0, Math.min(startCol, endCol)),
          endCol: Math.max(0, Math.max(startCol, endCol)),
        };
      })
      .filter((range): range is TableRange => Boolean(range))
    : [],
});

const areTableCellsEqual = (
  first: TableCell | null | undefined,
  second: TableCell | null | undefined,
): boolean => {
  if (!first || !second) {
    return !first && !second;
  }

  return first.fileId === second.fileId &&
    first.sheetId === second.sheetId &&
    first.rowIndex === second.rowIndex &&
    first.colIndex === second.colIndex;
};

const areColumnIndexesEqual = (
  first: readonly number[] | undefined,
  second: readonly number[] | undefined,
): boolean => {
  const left = first ?? [];
  const right = second ?? [];
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
};

const areTableRangesEqual = (
  first: readonly TableRange[] | undefined,
  second: readonly TableRange[] | undefined,
): boolean => {
  const left = first ?? [];
  const right = second ?? [];
  return left.length === right.length &&
    left.every((range, index) => {
      const next = right[index];
      if (!next) {
        return false;
      }

      return range.fileId === next.fileId &&
        range.sheetId === next.sheetId &&
        range.startRow === next.startRow &&
        range.endRow === next.endRow &&
        range.startCol === next.startCol &&
        range.endCol === next.endCol;
    });
};

export const areTableSelectionsEqual = (
  first: TableSelection,
  second: TableSelection,
): boolean =>
  areTableCellsEqual(first.activeCell, second.activeCell) &&
  areColumnIndexesEqual(first.selectedColumns, second.selectedColumns) &&
  areTableRangesEqual(first.ranges, second.ranges);

export const sanitizeTableRowBatch = (rows: unknown): unknown[][] => {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => Array.isArray(row) ? row : []);
};

export const isTableRowBatchResultForRequest = ({
  requestFileId,
  payloadSourceKey,
  requestStartRow,
  payloadFileId,
  payloadStartRow,
}: {
  readonly requestFileId: unknown;
  readonly payloadSourceKey?: unknown;
  readonly requestStartRow: unknown;
  readonly payloadFileId: unknown;
  readonly payloadStartRow: unknown;
}): boolean => {
  const expectedFileId =
    typeof requestFileId === "string" ? requestFileId : String(requestFileId || "");
  const actualFileId =
    typeof payloadFileId === "string" ? payloadFileId : String(payloadFileId || "");
  const actualSourceKey =
    typeof payloadSourceKey === "string" ? payloadSourceKey : String(payloadSourceKey || "");
  const expectedStart = Math.max(0, toSafeInt(requestStartRow, 0));
  const actualStart = Math.max(0, toSafeInt(payloadStartRow, 0));
  return (
    (expectedFileId === actualFileId || expectedFileId === actualSourceKey) &&
    expectedStart === actualStart
  );
};

export const hasChunkRowsInCache = (
  rowCache: ReadonlyMap<number, unknown[]> | null | undefined,
  chunkStart: unknown,
  chunkEnd: unknown,
): boolean => {
  if (!rowCache) return false;

  const start = Math.max(0, toSafeInt(chunkStart, 0));
  const end = Math.max(start, toSafeInt(chunkEnd, start));
  for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
    if (!rowCache.has(rowIndex)) return false;
  }
  return true;
};

export const clearChunkRows = (
  rowCache: TableRowCache | null | undefined,
  chunkStart: unknown,
  chunkEnd: unknown,
): void => {
  if (!rowCache) return;

  const start = Math.max(0, toSafeInt(chunkStart, 0));
  const end = Math.max(start, toSafeInt(chunkEnd, start));
  for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
    rowCache.delete(rowIndex);
  }
};

export const collectMissingChunkRanges = ({
  rowCache,
  pendingChunks,
  startRow,
  endRow,
  chunkSize,
  maxRangeRows,
}: {
  readonly rowCache: ReadonlyMap<number, unknown[]> | null | undefined;
  readonly pendingChunks?: ReadonlySet<number> | null;
  readonly startRow: unknown;
  readonly endRow: unknown;
  readonly chunkSize: unknown;
  readonly maxRangeRows?: unknown;
}): MissingTableRowChunkRange[] => {
  const safeChunkSize = Math.max(1, toSafeInt(chunkSize, 1));
  const start = Math.max(0, toSafeInt(startRow, 0));
  const end = Math.max(start, toSafeInt(endRow, start));
  const safeMaxRangeRows = Number.isFinite(Number(maxRangeRows))
    ? Math.max(safeChunkSize, toSafeInt(maxRangeRows, safeChunkSize))
    : Number.POSITIVE_INFINITY;
  const pendingSet = pendingChunks ?? new Set<number>();

  const ranges: MissingTableRowChunkRange[] = [];
  let currentRange: {
    rangeStart: number;
    rangeEnd: number;
    chunkStarts: number[];
  } | null = null;

  const flushRange = (): void => {
    if (!currentRange || !currentRange.chunkStarts.length) return;
    ranges.push(currentRange);
    currentRange = null;
  };

  const firstChunkStart = Math.floor(start / safeChunkSize) * safeChunkSize;
  const lastChunkStart =
    end > start
      ? Math.floor((end - 1) / safeChunkSize) * safeChunkSize
      : firstChunkStart;

  for (
    let chunkStart = firstChunkStart;
    chunkStart <= lastChunkStart;
    chunkStart += safeChunkSize
  ) {
    const chunkEnd = Math.min(end, chunkStart + safeChunkSize);
    const isLoaded = hasChunkRowsInCache(rowCache, chunkStart, chunkEnd);
    const isPending = pendingSet.has(chunkStart);
    if (isLoaded || isPending) {
      flushRange();
      continue;
    }

    if (!currentRange) {
      currentRange = {
        rangeStart: chunkStart,
        rangeEnd: chunkEnd,
        chunkStarts: [chunkStart],
      };
      continue;
    }

    const nextRangeEnd = Math.max(currentRange.rangeEnd, chunkEnd);
    const nextRangeSize = Math.max(0, nextRangeEnd - currentRange.rangeStart);
    if (nextRangeSize > safeMaxRangeRows) {
      flushRange();
      currentRange = {
        rangeStart: chunkStart,
        rangeEnd: chunkEnd,
        chunkStarts: [chunkStart],
      };
      continue;
    }

    currentRange.rangeEnd = nextRangeEnd;
    currentRange.chunkStarts.push(chunkStart);
  }

  flushRange();
  return ranges;
};

export const mergeChunkRows = ({
  rowCache,
  loadedChunks,
  chunkStart,
  chunkEnd,
  rows,
  chunkSize,
  maxChunks,
}: {
  readonly rowCache: TableRowCache;
  readonly loadedChunks: TableLoadedChunks;
  readonly chunkStart: unknown;
  readonly chunkEnd: unknown;
  readonly rows: unknown;
  readonly chunkSize: unknown;
  readonly maxChunks: unknown;
}): boolean => {
  const start = Math.max(0, toSafeInt(chunkStart, 0));
  const end = Math.max(start, toSafeInt(chunkEnd, start));
  const safeChunkSize = Math.max(1, toSafeInt(chunkSize, 1));
  const safeMaxChunks = Math.max(1, toSafeInt(maxChunks, 1));
  const safeRows = sanitizeTableRowBatch(rows);
  const expectedRows = Math.max(0, end - start);

  if (safeRows.length !== expectedRows) {
    clearChunkRows(rowCache, start, end);
    loadedChunks.delete(start);
    return false;
  }

  for (let index = 0; index < safeRows.length; index += 1) {
    rowCache.set(start + index, safeRows[index]);
  }

  loadedChunks.delete(start);
  loadedChunks.add(start);

  while (loadedChunks.size > safeMaxChunks) {
    const evictChunkStart = Number(loadedChunks.values().next().value);
    if (!Number.isFinite(evictChunkStart)) break;
    loadedChunks.delete(evictChunkStart);
    clearChunkRows(rowCache, evictChunkStart, evictChunkStart + safeChunkSize);
  }

  return true;
};

export const mergeChunkRangeRows = ({
  rowCache,
  loadedChunks,
  rangeStart,
  rangeEnd,
  rows,
  chunkSize,
  maxChunks,
}: {
  readonly rowCache: TableRowCache;
  readonly loadedChunks: TableLoadedChunks;
  readonly rangeStart: unknown;
  readonly rangeEnd: unknown;
  readonly rows: unknown;
  readonly chunkSize: unknown;
  readonly maxChunks: unknown;
}): MergeTableChunkRangeResult => {
  const safeChunkSize = Math.max(1, toSafeInt(chunkSize, 1));
  const start = Math.max(0, toSafeInt(rangeStart, 0));
  const end = Math.max(start, toSafeInt(rangeEnd, start));
  const safeRows = sanitizeTableRowBatch(rows);
  const expectedRows = Math.max(0, end - start);

  if (safeRows.length !== expectedRows) {
    return {
      complete: false,
      mergedChunkStarts: [],
    };
  }

  const mergedChunkStarts: number[] = [];
  for (let chunkStart = start; chunkStart < end; chunkStart += safeChunkSize) {
    const chunkEnd = Math.min(end, chunkStart + safeChunkSize);
    const sliceStart = Math.max(0, chunkStart - start);
    const sliceEnd = Math.max(sliceStart, chunkEnd - start);
    const merged = mergeChunkRows({
      rowCache,
      loadedChunks,
      chunkStart,
      chunkEnd,
      rows: safeRows.slice(sliceStart, sliceEnd),
      chunkSize: safeChunkSize,
      maxChunks,
    });
    if (!merged) {
      return {
        complete: false,
        mergedChunkStarts,
      };
    }
    mergedChunkStarts.push(chunkStart);
  }

  return {
    complete: true,
    mergedChunkStarts,
  };
};

export const createTableRowCacheVersion = () => {
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

export const buildTableCellReadRequests = ({
  columnCount,
  maxCells = 5000,
  rowIndices,
}: {
  readonly columnCount: number;
  readonly maxCells?: number;
  readonly rowIndices: Iterable<unknown>;
}): TableCellReadRequest[] => {
  const safeColumnCount = Math.floor(Number(columnCount));
  if (!Number.isInteger(safeColumnCount) || safeColumnCount <= 0) return [];

  const rows = Array.from(rowIndices)
    .map(toSafeIndex)
    .filter((rowIndex): rowIndex is number => rowIndex !== null);
  const uniqueRows = Array.from(new Set(rows)).sort((a, b) => a - b);
  const safeMaxCells = Math.max(1, Math.floor(Number(maxCells) || 1));
  if (uniqueRows.length * safeColumnCount > safeMaxCells) return [];

  const cells: TableCellReadRequest[] = [];
  for (const rowIndex of uniqueRows) {
    for (let colIndex = 0; colIndex < safeColumnCount; colIndex += 1) {
      cells.push({ colIndex, rowIndex });
    }
  }
  return cells;
};

export const rowsFromTableCellReads = ({
  cells,
  columnCount,
}: {
  readonly cells: unknown;
  readonly columnCount: number;
}): Map<number, unknown[]> => {
  const safeColumnCount = Math.floor(Number(columnCount));
  const rows = new Map<number, unknown[]>();
  if (!Array.isArray(cells) || safeColumnCount <= 0) return rows;

  for (const rawCell of cells) {
    if (!rawCell || typeof rawCell !== "object") continue;
    const cell = rawCell as TableCellReadResult;
    const rowIndex = toSafeIndex(cell.rowIndex);
    const colIndex = toSafeIndex(cell.colIndex);
    if (rowIndex === null || colIndex === null || colIndex >= safeColumnCount) {
      continue;
    }

    let row = rows.get(rowIndex);
    if (!row) {
      row = Array.from({ length: safeColumnCount }, () => "");
      rows.set(rowIndex, row);
    }
    row[colIndex] = cell.value ?? "";
  }

  return rows;
};

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

export class TableStateScope extends Disposable {
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

const isUnhealthyTableSource = (entry: SessionFile): boolean =>
  entry.assessmentHealth === "decodeFailed" ||
  entry.assessmentHealth === "parseFailed" ||
  entry.assessmentHealth === "unsupported";

const shouldCacheColumnDisplayProfile = (
  sampleCount: number,
  rowCount: unknown,
): boolean => {
  const totalRows = Math.max(0, Math.floor(Number(rowCount) || 0));
  const stableSampleCount = Math.min(
    Math.max(1, totalRows),
    TABLE_COLUMN_PROFILE_MIN_STABLE_SAMPLE_ROWS,
  );
  return sampleCount >= stableSampleCount;
};

const getUnhealthyTableMessage = (entry: SessionFile): string => {
  const message = String(entry.assessmentHealthMessage ?? "").trim().toLowerCase();
  if (entry.assessmentHealth === "decodeFailed") {
    if (message.includes("converted csv")) {
      return localize(
        "table.preview.convertedCsvUnreadable",
        "File content cannot be decoded from the converted CSV source.",
      );
    }
    if (message.includes("binary") || message.includes("encoding")) {
      return localize(
        "table.preview.binaryOrEncodingUnreadable",
        "File content is unreadable: suspected binary file or encoding mismatch.",
      );
    }
    return localize(
      "table.preview.decodeFailed",
      "File content cannot be decoded as a valid CSV table.",
    );
  }
  if (entry.assessmentHealth === "parseFailed") {
    return localize(
      "table.preview.parseFailed",
      "File content could not pass CSV table structure validation.",
    );
  }
  if (entry.assessmentHealth === "unsupported") {
    return localize(
      "table.preview.unsupported",
      "This file format is not supported for table preview.",
    );
  }

  return localize(
    "table.preview.unreadable",
    "File content cannot be decoded or parsed as a valid CSV table.",
  );
};

const createTableFileFromSourceEntry = (
  sourceEntry: TableSourceEntry,
): TableFile => ({
  fileId: sourceEntry.source.fileId,
  fileName: String(sourceEntry.entry.fileName ?? ""),
  sheetId: sourceEntry.source.sheetId ?? null,
  sheetName: sourceEntry.sheetName,
  sourceKey: sourceEntry.sourceKey,
  sourceVersion: sourceEntry.sourceVersion,
  assessmentHealth: sourceEntry.entry.assessmentHealth,
  assessmentHealthMessage: sourceEntry.entry.assessmentHealthMessage,
  templateEligibility: sourceEntry.entry.templateEligibility,
  rowCount: Math.max(0, Math.floor(Number(sourceEntry.entry.rowCount) || 0)),
  columnCount: Math.max(0, Math.floor(Number(sourceEntry.entry.columnCount) || 0)),
  maxCellLengths: Array.isArray(sourceEntry.entry.maxCellLengths)
    ? sourceEntry.entry.maxCellLengths.map(value => Number(value) || 0)
    : [],
});

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

export const areTableFilesEqual = (
  current: TableFile | null | undefined,
  next: TableFile,
): boolean =>
  current?.fileId === next.fileId &&
  current?.fileName === next.fileName &&
  current?.sheetId === next.sheetId &&
  current?.sheetName === next.sheetName &&
  current?.sourceKey === next.sourceKey &&
  normalizeSourceVersion(current?.sourceVersion) === normalizeSourceVersion(next.sourceVersion) &&
  current?.assessmentHealth === next.assessmentHealth &&
  current?.assessmentHealthMessage === next.assessmentHealthMessage &&
  current?.templateEligibility === next.templateEligibility &&
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

type TableModelInput = {
  numericDisplayMode?: NumericDisplayMode;
  tableRowsReaderService?: TableRowsReaderProvider;
  rawFiles?: SessionFile[];
  settingsVersion?: number;
  source?: TableSource | null;
};

export type CreateTableModelWithScopeOptions = TableModelInput & {
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
export const areTableLoadStatesEqual = (
  current: TableLoadState,
  next: TableLoadState,
): boolean =>
  current.state === next.state &&
  current.message === next.message;
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
type TableCopyPlan = {
  readonly columnIndexes: readonly number[];
  readonly endRow: number;
  readonly sourceKey: string;
  readonly startRow: number;
};

const createTableModel = ({
  tableRowsReaderService,
  rawFiles = [],
  source = null,
  numericDisplayMode = "raw",
  settingsVersion = 0,
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
  if (!tableRowsReaderService) {
    throw new Error("Table model requires ITableRowsReaderService.");
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
  const selectionSubscribersRef = createTableRef(new Set<(selection: TableSelection) => void>());
  const highlightSubscribersRef = createTableRef(new Set<(highlight: TableHighlight) => void>());
  const revealCellSubscribersRef = createTableRef(new Set<(cell: TableCell | null) => void>());
  const stateSubscribersRef = createTableRef(new Set<() => void>());

  const deferredActiveFileId = readImmediateValue(activeFileId);
  const deferredActiveSheetId = readImmediateValue(activeSheetId);
  const previewStatusRef = createTableRef<TableLoadState>(previewStatus);
  const previewFileRef = createTableRef<TableFile | null>(previewFile);
  const previewPendingChunksByFileIdRef = createTableRef<Map<string, Set<number>>>(
    new Map(),
  );
  const readerOpenedSourceKeysRef = createTableRef<Set<string>>(new Set());
  const pendingPreviewFileIdRef = createTableRef<string | null>(null);
  const columnDisplayProfileCacheRef = createTableRef(new Map<string, ColumnDisplayProfile>());
  const columnDisplayScaleOverridesRef = createTableRef(new Map<string, number>());
  const columnDisplayScaleOverrideVersionRef = createTableRef(0);

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

  const notifyTableDisplayProfileChanged = memoCallback(() => {
    columnDisplayProfileCacheRef.current = new Map();
    cancelRowsVersionNotification();
    notifyRowsVersion();
  }, [cancelRowsVersionNotification, columnDisplayProfileCacheRef, notifyRowsVersion]);

  const notifyTableRowsCacheChanged = memoCallback(() => {
    notifyTableDisplayProfileChanged();
  }, [notifyTableDisplayProfileChanged]);

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
      if (merged.complete && previewCacheFileIdRef.current === fileId) {
        notifyTableRowsCacheChanged();
      }
      return merged.complete;
    },
    [getOrCreatePreviewFileCaches, notifyTableRowsCacheChanged, previewCacheFileIdRef],
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

  const releasePreviewSource = memoCallback(
    (fileId: string) => {
      if (typeof fileId !== "string" || !fileId) return;

      previewWorkerRef.current?.postMessage({
        type: "tableDispose",
        payload: { fileId },
      });
      readerOpenedSourceKeysRef.current.delete(fileId);
      if (tableRowsReaderService.canReleaseSource()) {
        void tableRowsReaderService.releaseSource({ fileId });
      }
    },
    [readerOpenedSourceKeysRef, previewWorkerRef, tableRowsReaderService],
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
    readerOpenedSourceKeysRef.current = new Set();
    if (tableRowsReaderService.canReleaseSource()) {
      void tableRowsReaderService.releaseSource({ clear: true });
    }
    assignCurrentPreviewCache();
    columnDisplayProfileCacheRef.current = new Map();
    notifyTableRowsCacheChanged();
  }, [
    assignCurrentPreviewCache,
    columnDisplayProfileCacheRef,
    notifyTableRowsCacheChanged,
    readerOpenedSourceKeysRef,
    previewCacheFileLruRef,
    previewLoadedChunksByFileIdRef,
    tableRowsCacheByFileIdRef,
    previewWorkerRef,
    tableRowsReaderService,
  ]);

  const invalidatePreviewRequests = memoCallback(() => {
    previewRequestIdRef.current += 1;
    cancelPendingTableRowRequests();
    pendingPreviewFileIdRef.current = null;
    previewPendingChunksByFileIdRef.current = new Map();
    columnDisplayProfileCacheRef.current = new Map();
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
      for (const overrideKey of Array.from(columnDisplayScaleOverridesRef.current.keys())) {
        if (overrideKey.startsWith(`${sourceKey}:`)) {
          columnDisplayScaleOverridesRef.current.delete(overrideKey);
        }
      }

      if (previewCacheFileIdRef.current === sourceKey) {
        resetCurrentPreviewCache();
      }

      releasePreviewSource(sourceKey);
    },
    [
      releasePreviewSource,
      previewCacheFileIdRef,
      previewCacheFileLruRef,
      previewLoadedChunksByFileIdRef,
      previewPendingChunksByFileIdRef,
      tableRowsCacheByFileIdRef,
      columnDisplayScaleOverridesRef,
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
            payloadSourceKey: rowsPayload.sourceKey,
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
      new URL("./tablePreviewWorker.ts", import.meta.url),
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
    if (isUnhealthyTableSource(targetFile)) {
      const nextPreviewFile = createTableFileFromSourceEntry(targetSource);
      clearPendingPreviewRequest(previewRequestIdRef.current);
      disposePreviewSourceCache(targetSourceKey);
      runImmediately(() => {
        if (
          !(
            isTableFileForSource(previewFileRef.current, targetSourceKey) &&
            areTableFilesEqual(previewFileRef.current, nextPreviewFile)
          )
        ) {
          setPreviewFile(nextPreviewFile);
        }
        setPreviewStatus({
          state: "error",
          message: getUnhealthyTableMessage(targetFile),
        });
      });
      return;
    }
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
      const hasNormalizedCsvPath =
        typeof previewTargetFile.normalizedCsvPath === "string" &&
        previewTargetFile.normalizedCsvPath.trim().length > 0;
      const convertedFile = await loadConvertedCsvFile({
          convertedCsvReaderService: tableRowsReaderService,
          fallbackFile: previewTargetFile.file,
          fileName: previewTargetFile.fileName,
          lastModified:
            previewTargetFile.file instanceof File ? previewTargetFile.file.lastModified : null,
          normalizedCsvPath: previewTargetFile.normalizedCsvPath,
        });
      if (requestId !== previewRequestIdRef.current) {
        return;
      }
      if (!convertedFile) {
        clearPendingPreviewRequest(requestId);
        runImmediately(() => {
          setPreviewFile(createTableFileFromSourceEntry(previewTargetSource));
          setPreviewStatus({
            state: "error",
            message: hasNormalizedCsvPath
              ? localize(
                  "table.preview.convertedCsvUnreadable",
                  "File content cannot be decoded from the converted CSV source.",
                )
              : localize(
                  "table.preview.workerUnreadableHint",
                  "The system could not confirm this file is a valid CSV. It may be binary, damaged, or encoded with an unsupported format.",
                ),
          });
        });
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
          file: convertedFile,
          maxSeedRows: TABLE_MAX_CACHED_UI_ROWS_PER_FILE,
        },
      });
    };

    const readerInputPath =
      typeof previewTargetFile.normalizedCsvPath === "string" &&
      previewTargetFile.normalizedCsvPath.trim()
        ? previewTargetFile.normalizedCsvPath.trim()
        : typeof previewTargetFile.sourcePath === "string" &&
            previewTargetFile.sourcePath.trim().toLowerCase().endsWith(".csv")
          ? previewTargetFile.sourcePath.trim()
          : null;
    if (readerInputPath && tableRowsReaderService.canOpenSource()) {
      void tableRowsReaderService
        .openSource({
          fileId: previewTargetSourceKey,
          fileName: previewTargetFile.fileName ?? "",
          path: readerInputPath,
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
              releasePreviewSource(sourceKey);
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
            readerOpenedSourceKeysRef.current.add(sourceKey);
          }

          activatePreviewFileCache(sourceKey);

          if (sourceKey) {
            mergePreviewSeedRows(
              sourceKey,
              Number(previewPayload.seedStartRow) || 0,
              Array.isArray(previewPayload.seedRows)
                ? previewPayload.seedRows
                : [],
            );
          }

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
    readerOpenedSourceKeysRef,
    deferredActiveFileId,
    deferredActiveSheetId,
    disposePreviewSourceCache,
    getOrCreatePreviewWorker,
    mergePreviewSeedRows,
    releasePreviewSource,
    previewFileRef,
    previewRequestIdRef,
    setPreviewStatus,
  ]);

  const getTableRow = memoCallback(
    (rowIndex: number): unknown[] | null => {
      const normalizedIndex = Number(rowIndex);
      if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) return null;
      return tableRowsCacheRef.current.get(normalizedIndex) ?? null;
    },
    [tableRowsCacheRef],
  );

  const createRawColumnDisplayProfile = memoCallback(
    (colIndex: number): ColumnDisplayProfile => {
      const currentFile = previewFileRef.current;
      const rawTableId = currentFile?.sourceKey ?? activeSourceKey ?? currentFile?.fileId ?? "";
      return {
        rawTableId,
        columnId: String(Math.max(0, Math.floor(Number(colIndex) || 0))),
        mode: "raw",
        isNumericColumn: false,
        scaleExponent: 0,
        significantDigits: DEFAULT_TABLE_DISPLAY_SIGNIFICANT_DIGITS,
        sourceVersion: normalizeSourceVersion(currentFile?.sourceVersion),
        settingsVersion,
      };
    },
    [activeSourceKey, previewFileRef, settingsVersion],
  );

  const collectColumnSampleValues = memoCallback(
    (colIndex: number): readonly unknown[] => {
      const currentFile = previewFileRef.current;
      const columnCount = Math.max(0, Math.floor(Number(currentFile?.columnCount) || 0));
      const normalizedColIndex = Math.max(0, Math.floor(Number(colIndex) || 0));
      if (normalizedColIndex >= columnCount) {
        return [];
      }

      const samples: unknown[] = [];
      const entries = Array.from(tableRowsCacheRef.current.entries())
        .sort(([left], [right]) => left - right);
      for (const [, row] of entries) {
        if (!Array.isArray(row)) {
          continue;
        }
        samples.push(row[normalizedColIndex]);
        if (samples.length >= TABLE_COLUMN_PROFILE_MAX_SAMPLE_ROWS) {
          break;
        }
      }
      return samples;
    },
    [previewFileRef, tableRowsCacheRef],
  );

  const getColumnDisplayProfile = memoCallback(
    (colIndex: number): ColumnDisplayProfile => {
      const currentFile = previewFileRef.current;
      const normalizedColIndex = Math.max(0, Math.floor(Number(colIndex) || 0));
      const rawTableId = currentFile?.sourceKey ?? activeSourceKey ?? currentFile?.fileId ?? "";
      const sourceVersion = normalizeSourceVersion(currentFile?.sourceVersion);
      const overrideKey = createColumnDisplayScaleOverrideKey(rawTableId, normalizedColIndex);
      const overrideScaleExponent = columnDisplayScaleOverridesRef.current.get(overrideKey);
      const cacheKey = [
        rawTableId,
        normalizedColIndex,
        sourceVersion,
        numericDisplayMode,
        settingsVersion,
        getRowsVersion(),
        TABLE_COLUMN_PROFILE_ALGORITHM_VERSION,
        columnDisplayScaleOverrideVersionRef.current,
        overrideScaleExponent ?? "auto",
      ].join(":");
      const cached = columnDisplayProfileCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      const rawProfile = createRawColumnDisplayProfile(normalizedColIndex);
      if (numericDisplayMode !== "smart") {
        columnDisplayProfileCacheRef.current.set(cacheKey, rawProfile);
        return rawProfile;
      }

      const samples = collectColumnSampleValues(normalizedColIndex);
      if (!samples.length) {
        return rawProfile;
      }

      let nonEmptyCount = 0;
      const numericSamples: unknown[] = [];
      for (const sample of samples) {
        const text = typeof sample === "string" ? sample.trim() : sample === null || sample === undefined ? "" : String(sample).trim();
        if (!text) {
          continue;
        }

        nonEmptyCount += 1;
        const numericValue = parseNumericCell(sample);
        if (numericValue !== null) {
          numericSamples.push(sample);
        }
      }

      if (!nonEmptyCount || numericSamples.length / nonEmptyCount < TABLE_COLUMN_NUMERIC_THRESHOLD) {
        if (shouldCacheColumnDisplayProfile(samples.length, currentFile?.rowCount)) {
          columnDisplayProfileCacheRef.current.set(cacheKey, rawProfile);
        }
        return rawProfile;
      }

      const autoScaleExponent = chooseColumnScaleExponentFromCells(numericSamples);
      const scaleExponent = Number.isInteger(overrideScaleExponent)
        ? clampColumnDisplayScaleExponent(overrideScaleExponent)
        : autoScaleExponent;
      const profile: ColumnDisplayProfile = {
        rawTableId,
        columnId: String(normalizedColIndex),
        mode: "columnScale",
        isNumericColumn: true,
        isScaleManual: Number.isInteger(overrideScaleExponent) || undefined,
        scaleExponent,
        headerSuffix: toScaleHeaderSuffix(scaleExponent),
        significantDigits: DEFAULT_TABLE_DISPLAY_SIGNIFICANT_DIGITS,
        sourceVersion,
        settingsVersion,
      };
      columnDisplayProfileCacheRef.current.set(cacheKey, profile);
      return profile;
    },
    [
      activeSourceKey,
      collectColumnSampleValues,
      columnDisplayProfileCacheRef,
      columnDisplayScaleOverrideVersionRef,
      columnDisplayScaleOverridesRef,
      createRawColumnDisplayProfile,
      getRowsVersion,
      numericDisplayMode,
      previewFileRef,
      settingsVersion,
    ],
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

  const adjustColumnDisplayScale = memoCallback(
    (colIndex: number, deltaExponent: number): boolean => {
      const normalizedColIndex = Math.max(0, Math.floor(Number(colIndex) || 0));
      const delta = Math.trunc(Number(deltaExponent) || 0);
      if (!Number.isInteger(normalizedColIndex) || normalizedColIndex < 0 || delta === 0) {
        return false;
      }

      const profile = getColumnDisplayProfile(normalizedColIndex);
      if (profile.mode !== "columnScale" || !profile.isNumericColumn) {
        return false;
      }

      const nextScaleExponent = clampColumnDisplayScaleExponent(profile.scaleExponent + delta);
      if (nextScaleExponent === profile.scaleExponent && profile.isScaleManual) {
        return false;
      }

      const overrideKey = createColumnDisplayScaleOverrideKey(profile.rawTableId, normalizedColIndex);
      columnDisplayScaleOverridesRef.current.set(overrideKey, nextScaleExponent);
      columnDisplayScaleOverrideVersionRef.current += 1;
      notifyTableDisplayProfileChanged();
      return true;
    },
    [
      columnDisplayScaleOverrideVersionRef,
      columnDisplayScaleOverridesRef,
      getColumnDisplayProfile,
      notifyTableDisplayProfileChanged,
    ],
  );

  const resetColumnDisplayScale = memoCallback(
    (colIndex: number): boolean => {
      const normalizedColIndex = Math.max(0, Math.floor(Number(colIndex) || 0));
      if (!Number.isInteger(normalizedColIndex) || normalizedColIndex < 0) {
        return false;
      }

      const currentFile = previewFileRef.current;
      const rawTableId = currentFile?.sourceKey ?? activeSourceKey ?? currentFile?.fileId ?? "";
      const overrideKey = createColumnDisplayScaleOverrideKey(rawTableId, normalizedColIndex);
      if (!columnDisplayScaleOverridesRef.current.delete(overrideKey)) {
        return false;
      }

      columnDisplayScaleOverrideVersionRef.current += 1;
      notifyTableDisplayProfileChanged();
      return true;
    },
    [
      activeSourceKey,
      columnDisplayScaleOverrideVersionRef,
      columnDisplayScaleOverridesRef,
      notifyTableDisplayProfileChanged,
      previewFileRef,
    ],
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
        readerOpenedSourceKeysRef.current.has(sourceKey) &&
        tableRowsReaderService.canReadRows()
      ) {
        return tableRowsReaderService
          .readRows({
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
              payloadSourceKey: rowsPayload.sourceKey,
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
      tableRowsReaderService,
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
        readerOpenedSourceKeysRef.current.has(sourceKey) &&
        tableRowsReaderService.canReadCells()
      ) {
        const requestCells = buildTableCellReadRequests({
          columnCount,
          rowIndices: requestedRows,
        });
        if (requestCells.length > 0) {
          try {
            const response = await tableRowsReaderService.readCells({
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
                  notifyTableRowsCacheChanged();
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
        notifyTableRowsCacheChanged();
      }
    },
    [
      getOrCreatePreviewFileCaches,
      notifyTableRowsCacheChanged,
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
        notifyTableRowsCacheChanged();
      }
    },
    [
      getOrCreatePendingChunks,
      getOrCreatePreviewFileCaches,
      notifyTableRowsCacheChanged,
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

  const onDidChangeHighlight = memoCallback(
    (callback: (highlight: TableHighlight) => void): (() => void) => {
      highlightSubscribersRef.current.add(callback);
      return () => highlightSubscribersRef.current.delete(callback);
    },
    [highlightSubscribersRef],
  );

  const onDidChangeRevealCell = memoCallback(
    (callback: (cell: TableCell | null) => void): (() => void) => {
      revealCellSubscribersRef.current.add(callback);
      return () => revealCellSubscribersRef.current.delete(callback);
    },
    [revealCellSubscribersRef],
  );

  const notifyHighlightChanged = memoCallback(
    (): void => {
      for (const callback of Array.from(highlightSubscribersRef.current)) {
        try {
          callback(highlightRef.current);
        } catch {
          // A broken consumer must not prevent table highlight from updating.
        }
      }
    },
    [highlightRef, highlightSubscribersRef],
  );

  const notifyRevealCellChanged = memoCallback(
    (): void => {
      for (const callback of Array.from(revealCellSubscribersRef.current)) {
        try {
          callback(revealCellRef.current);
        } catch {
          // A broken consumer must not prevent table reveal state from updating.
        }
      }
    },
    [revealCellRef, revealCellSubscribersRef],
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

  const getHighlight = memoCallback(
    (): TableHighlight => highlightRef.current,
    [highlightRef],
  );

  const highlightColumns = memoCallback(
    (columnIndexes: readonly number[]): void => {
      highlightRef.current = {
        columns: normalizeColumnIndexes(columnIndexes),
      };
      notifyHighlightChanged();
    },
    [highlightRef, notifyHighlightChanged],
  );

  const clearHighlight = memoCallback(
    (): void => {
      highlightRef.current = {};
      notifyHighlightChanged();
    },
    [highlightRef, notifyHighlightChanged],
  );

  const revealCell = memoCallback(
    (cell: TableCell | null): void => {
      revealCellRef.current = normalizeTableCell(cell);
      notifyRevealCellChanged();
    },
    [notifyRevealCellChanged, revealCellRef],
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
        displayVersion: settingsVersion,
      };
    },
    [
      previewFileRef,
      previewStatusRef,
      activeFileId,
      activeSheetId,
      activeSourceKey,
      settingsVersion,
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
    adjustColumnDisplayScale,
    cancelPendingRowRequests: cancelPendingTableRowRequests,
    clearHighlight,
    clearSelection,
    clearState: clearPreviewState,
    disposeFileCache: disposePreviewFileCache,
    ensureCells: ensureTableCells,
    ensureRows: ensureTableRows,
    getColumnDisplayProfile,
    getHighlight,
    getRow: getTableRow,
    getRowsVersion,
    getRevealCell,
    getSelection,
    getState,
    hasSourceFile,
    invalidateRequests: invalidatePreviewRequests,
    onDidChangeHighlight,
    onDidChangeRevealCell,
    onDidChangeState,
    onDidChangeSelection,
    revealCell,
    resetColumnDisplayScale,
    resetWorker: resetPreviewWorker,
    selectAllColumns,
    setSelection,
    highlightColumns,
    subscribeRowsVersion,
  };
};

const createColumnDisplayScaleOverrideKey = (
  rawTableId: string,
  colIndex: number,
): string => [
  rawTableId,
  Math.max(0, Math.floor(Number(colIndex) || 0)),
].join(":");

const clampColumnDisplayScaleExponent = (scaleExponent: number): number =>
  Math.min(
    TABLE_COLUMN_DISPLAY_SCALE_MAX_EXPONENT,
    Math.max(
      TABLE_COLUMN_DISPLAY_SCALE_MIN_EXPONENT,
      Math.trunc(Number(scaleExponent) || 0),
    ),
  );

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

export const createTableModelInScope = (
  scope: TableStateScope,
  options: CreateTableModelWithScopeOptions,
): TableModel => {
  const browserOptions = toBrowserTableOptions(options);
  return runWithTableStateScope(scope, () => createTableModel(browserOptions));
};

export const createTableModelWithScope = (
  options: CreateTableModelWithScopeOptions,
): TableModel => {
  const scope = getTableStateScope(
    asBrowserWorkerRef(options.workerRef) ?? defaultTableStateScopeKey,
  );
  return createTableModelInScope(scope, options);
};
