/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
  type TableDirtyRange,
  type TableViewModel,
  type TableRowsVersionChangeEvent,
  type TableSource,
  getTableSourceIdentityKey,
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
import type {
  TableModelContentSnapshot,
  TableModelPreviewInput,
} from "src/cs/workbench/services/table/common/model";

// TableViewModel owns the service data plane: source switching, row paging,
// cache state, and the command-visible selection/highlight/reveal snapshot. The
// pure cache/cell-read helpers live here so callers do not depend on small
// implementation files beside the view-model owner.

type TableCellReadRequest = Parameters<TableViewModel["ensureCells"]>[1][number];
type TableState = ReturnType<TableViewModel["getState"]>;
type TableCell = NonNullable<ReturnType<TableViewModel["getRevealCell"]>>;
type TableSelection = ReturnType<TableViewModel["getSelection"]>;
type TableRange = NonNullable<TableSelection["ranges"]>[number];
type TableFile = NonNullable<TableState["file"]>;
export type TableViewModelPreviewInput = {
  readonly input: TableModelPreviewInput;
  readonly source?: TableSource | null;
};
type TableHighlight = ReturnType<TableViewModel["getHighlight"]>;
type TableLoadState = TableState["loadState"];

export const TABLE_UI_CHUNK_SIZE_ROWS = 50;
export const TABLE_MAX_CACHED_UI_ROWS_PER_FILE = 5000;
export const TABLE_MAX_CACHED_FILES = 20;
const TABLE_COLUMN_NUMERIC_THRESHOLD = 0.8;
const TABLE_COLUMN_PROFILE_MAX_SAMPLE_ROWS = 5000;
const TABLE_COLUMN_PROFILE_MIN_STABLE_SAMPLE_ROWS = 20;
const TABLE_COLUMN_PROFILE_ALGORITHM_VERSION = 3;
const TABLE_COLUMN_DISPLAY_SCALE_MIN_EXPONENT = -99;
const TABLE_COLUMN_DISPLAY_SCALE_MAX_EXPONENT = 99;

type TableRowCache = Map<number, unknown[]>;
type TableLoadedChunks = Set<number>;

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
  let pendingRowsChange: Omit<TableRowsVersionChangeEvent, "version"> | null = null;
  const rowsSubscribers = new Set<(event: TableRowsVersionChangeEvent) => void>();

  const getRowsVersion = () => rowsVersion;

  const subscribeRowsVersion = (callback: (event: TableRowsVersionChangeEvent) => void) => {
    rowsSubscribers.add(callback);
    return () => rowsSubscribers.delete(callback);
  };

  const cancelRowsVersionNotification = () => {
    if (typeof window === "undefined") return;
    if (!rowsNotifyRaf) return;

    cancelAnimationFrame(rowsNotifyRaf);
    rowsNotifyRaf = 0;
    pendingRowsChange = null;
  };

  const notifyRowsVersion = (
    change: Partial<Omit<TableRowsVersionChangeEvent, "version">> = {},
  ) => {
    pendingRowsChange = mergeTableRowsChange(pendingRowsChange, change);
    if (typeof window === "undefined") return;
    if (rowsNotifyRaf) return;

    rowsNotifyRaf = requestAnimationFrame(() => {
      rowsNotifyRaf = 0;
      rowsVersion += 1;
      const event: TableRowsVersionChangeEvent = {
        ...(pendingRowsChange ?? {
          full: true,
          kind: "reset" as const,
          ranges: [],
        }),
        version: rowsVersion,
      };
      pendingRowsChange = null;

      for (const callback of Array.from(rowsSubscribers)) {
        try {
          callback(event);
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

const mergeTableRowsChange = (
  current: Omit<TableRowsVersionChangeEvent, "version"> | null,
  next: Partial<Omit<TableRowsVersionChangeEvent, "version">>,
): Omit<TableRowsVersionChangeEvent, "version"> => {
  const nextKind = next.kind ?? "reset";
  const nextFull = Boolean(next.full) || nextKind === "reset";
  if (!current || current.full || nextFull) {
    return {
      full: current?.full || nextFull,
      kind: current?.kind === "display" || nextKind === "display"
        ? "display"
        : current?.kind === "reset" || nextKind === "reset"
          ? "reset"
          : "content",
      ranges: current && !nextFull
        ? mergeTableDirtyRanges(current.ranges, next.ranges ?? [])
        : nextFull
          ? []
          : mergeTableDirtyRanges([], next.ranges ?? []),
    };
  }

  return {
    full: false,
    kind: current.kind === "display" || nextKind === "display" ? "display" : "content",
    ranges: mergeTableDirtyRanges(current.ranges, next.ranges ?? []),
  };
};

const mergeTableDirtyRanges = (
  first: readonly TableDirtyRange[],
  second: readonly TableDirtyRange[],
): readonly TableDirtyRange[] => {
  const ranges = [...first, ...second]
    .map(normalizeTableDirtyRange)
    .filter((range): range is TableDirtyRange => Boolean(range))
    .sort((left, right) =>
      (left.startRow ?? 0) - (right.startRow ?? 0) ||
      (left.startCol ?? 0) - (right.startCol ?? 0),
    );
  if (ranges.length <= 1) {
    return ranges;
  }

  const merged: TableDirtyRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      (previous.startCol ?? -1) === (range.startCol ?? -1) &&
      (previous.endCol ?? -1) === (range.endCol ?? -1) &&
      hasTableDirtyRowBounds(previous) &&
      hasTableDirtyRowBounds(range) &&
      previous.endRow >= range.startRow
    ) {
      merged[merged.length - 1] = {
        ...previous,
        endRow: Math.max(previous.endRow, range.endRow),
      };
    } else if (
      previous &&
      !hasTableDirtyRowBounds(previous) &&
      !hasTableDirtyRowBounds(range) &&
      (previous.startCol ?? -1) === (range.startCol ?? -1) &&
      (previous.endCol ?? -1) === (range.endCol ?? -1)
    ) {
      continue;
    } else {
      merged.push(range);
    }
  }
  return merged;
};

const hasTableDirtyRowBounds = (
  range: TableDirtyRange,
): range is TableDirtyRange & { readonly endRow: number; readonly startRow: number } =>
  typeof range.startRow === "number" && typeof range.endRow === "number";

const normalizeTableDirtyRange = (
  range: TableDirtyRange,
): TableDirtyRange | null => {
  const hasStartRow = typeof range.startRow !== "undefined";
  const hasEndRow = typeof range.endRow !== "undefined";
  if (hasStartRow !== hasEndRow) {
    return null;
  }

  const hasStartCol = typeof range.startCol !== "undefined";
  const hasEndCol = typeof range.endCol !== "undefined";
  if (hasStartCol !== hasEndCol) {
    return null;
  }

  const startRow = hasStartRow ? toSafeIndex(range.startRow) : undefined;
  const endRow = hasEndRow ? toSafeIndex(range.endRow) : undefined;
  if (
    (typeof startRow !== "undefined" && startRow === null) ||
    (typeof endRow !== "undefined" && endRow === null) ||
    (typeof startRow === "number" && typeof endRow === "number" && endRow <= startRow)
  ) {
    return null;
  }

  const startCol = hasStartCol ? toSafeIndex(range.startCol) : undefined;
  const endCol = hasEndCol ? toSafeIndex(range.endCol) : undefined;
  if (
    (typeof startCol !== "undefined" && startCol === null) ||
    (typeof endCol !== "undefined" && endCol === null) ||
    (typeof startCol === "number" && typeof endCol === "number" && endCol <= startCol)
  ) {
    return null;
  }

  return {
    ...(typeof startRow === "number" ? { startRow } : {}),
    ...(typeof endRow === "number" ? { endRow } : {}),
    ...(startCol !== undefined && startCol !== null ? { startCol } : {}),
    ...(endCol !== undefined && endCol !== null ? { endCol } : {}),
  };
};

type SetStateAction<T> = T | ((previous: T) => T);
type Dispatch<T> = (value: T) => void;

type TableMutableRef<T> = {
  current: T;
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
  readonly content: TableModelContentSnapshot | null;
  readonly input: TableModelPreviewInput;
  readonly source: TableSource;
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly sheetName: string | null;
};

const readPreviewInputString = (
  input: TableModelPreviewInput | null | undefined,
  key: keyof TableModelPreviewInput,
): string | null => {
  const value = input?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const getPreviewInputSheetName = (
  input: TableModelPreviewInput | null | undefined,
): string | null => readPreviewInputString(input, "sheetName");

const getPreviewInputSheetId = (
  input: TableModelPreviewInput | null | undefined,
): string | null =>
  readPreviewInputString(input, "sheetId") ??
  getPreviewInputSheetName(input);

const getPreviewInputResource = (
  input: TableModelPreviewInput | null | undefined,
  source: TableSource | null | undefined,
): URI | null => {
  const resource = input?.resource ?? source?.resource;
  return resource && typeof resource === "object" && typeof (resource as URI).toString === "function"
    ? resource as URI
    : null;
};

const getPreviewInputTableModelContent = (
  input: TableModelPreviewInput | null | undefined,
): TableModelContentSnapshot | null => {
  const content = input?.tableModelContent;
  if (!content || typeof content !== "object") {
    return null;
  }

  const candidate = content as Partial<TableModelContentSnapshot>;
  return Array.isArray(candidate.rows) ? candidate as TableModelContentSnapshot : null;
};

const createTableSourceEntry = ({
  input,
  source,
}: TableViewModelPreviewInput): TableSourceEntry | null => {
  const resource = getPreviewInputResource(input, source);
  if (!resource) {
    return null;
  }

  const sheetId = source?.sheetId ?? getPreviewInputSheetId(input);
  const resolvedSource: TableSource = {
    resource,
    sheetId,
  };
  const resolvedSourceKey = toTableSourceKey(resolvedSource);
  if (!resolvedSourceKey) {
    return null;
  }

  return {
    content: getPreviewInputTableModelContent(input),
    input,
    sheetName: getPreviewInputSheetName(input),
    source: resolvedSource,
    sourceVersion: normalizeSourceVersion(input.sourceVersion),
    sourceKey: resolvedSourceKey,
  };
};

const isUnhealthyTableSource = (input: TableModelPreviewInput): boolean =>
  input.rawTableHealth === "decodeFailed" ||
  input.rawTableHealth === "parseFailed" ||
  input.rawTableHealth === "unsupported";

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

const collectNumericColumnSamples = (
  samples: readonly unknown[],
): {
  readonly nonEmptyCount: number;
  readonly numericSamples: readonly unknown[];
} => {
  const nonEmptySamples: Array<{
    readonly numericValue: number | null;
    readonly sample: unknown;
  }> = [];

  for (const sample of samples) {
    const text = typeof sample === "string"
      ? sample.trim()
      : sample === null || sample === undefined
        ? ""
        : String(sample).trim();
    if (!text) {
      continue;
    }

    nonEmptySamples.push({
      numericValue: parseNumericCell(sample),
      sample,
    });
  }

  const firstSample = nonEmptySamples[0];
  const decisionSamples = firstSample &&
    firstSample.numericValue === null &&
    nonEmptySamples.slice(1).some(sample => sample.numericValue !== null)
    ? nonEmptySamples.slice(1)
    : nonEmptySamples;

  return {
    nonEmptyCount: decisionSamples.length,
    numericSamples: decisionSamples
      .filter(sample => sample.numericValue !== null)
      .map(sample => sample.sample),
  };
};

const getUnhealthyTableMessage = (input: TableModelPreviewInput): string => {
  const message = String(input.rawTableHealthMessage ?? "").trim().toLowerCase();
  if (input.rawTableHealth === "decodeFailed") {
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
  if (input.rawTableHealth === "parseFailed") {
    return localize(
      "table.preview.parseFailed",
      "File content could not pass CSV table structure validation.",
    );
  }
  if (input.rawTableHealth === "unsupported") {
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
  fileName: String(sourceEntry.input.fileName ?? ""),
  sheetId: sourceEntry.source.sheetId ?? null,
  sheetName: sourceEntry.sheetName,
  sourceKey: sourceEntry.sourceKey,
  sourceVersion: sourceEntry.sourceVersion,
  rawTableHealth: sourceEntry.input.rawTableHealth,
  rawTableHealthMessage: sourceEntry.input.rawTableHealthMessage,
  rowCount: Math.max(0, Math.floor(Number(sourceEntry.input.rowCount) || 0)),
  columnCount: Math.max(0, Math.floor(Number(sourceEntry.input.columnCount) || 0)),
  maxCellLengths: Array.isArray(sourceEntry.input.maxCellLengths)
    ? sourceEntry.input.maxCellLengths.map(value => Number(value) || 0)
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
  current?.fileName === next.fileName &&
  current?.sheetId === next.sheetId &&
  current?.sheetName === next.sheetName &&
  current?.sourceKey === next.sourceKey &&
  normalizeSourceVersion(current?.sourceVersion) === normalizeSourceVersion(next.sourceVersion) &&
  current?.rawTableHealth === next.rawTableHealth &&
  current?.rawTableHealthMessage === next.rawTableHealthMessage &&
  current?.templateEligibility === next.templateEligibility &&
  current?.rowCount === next.rowCount &&
  current?.columnCount === next.columnCount &&
  current?.maxCellLengths.length === next.maxCellLengths.length &&
  (current?.maxCellLengths.every(
    (cellLength, index) => cellLength === next.maxCellLengths[index],
  ) ?? false);

const normalizeSourceVersion = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

type TableViewModelInput = {
  numericDisplayMode?: NumericDisplayMode;
  previewInputs?: readonly TableViewModelPreviewInput[];
  settingsVersion?: number;
  source?: TableSource | null;
};

export type CreateTableViewModelWithScopeOptions = TableViewModelInput & {
  file?: TableFile | null;
  loadState?: TableLoadState;
  setFile?: Dispatch<SetStateAction<TableFile | null>>;
  setLoadState?: Dispatch<SetStateAction<TableLoadState>>;
  rowsCacheBySourceKeyRef?: TableMutableRef<Map<string, Map<number, unknown[]>>>;
  loadedChunksBySourceKeyRef?: TableMutableRef<Map<string, Set<number>>>;
  rowsCacheRef?: TableMutableRef<Map<number, unknown[]>>;
  loadedChunksRef?: TableMutableRef<Set<number>>;
  cacheSourceKeyRef?: TableMutableRef<string | null>;
  cacheSourceLruRef?: TableMutableRef<Set<string>>;
};

type UseTableOptions = CreateTableViewModelWithScopeOptions;
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

const createTableViewModel = ({
  previewInputs = [],
  source = null,
  numericDisplayMode = "raw",
  settingsVersion = 0,
  file,
  setFile,
  setLoadState,
  loadState,
  rowsCacheBySourceKeyRef,
  loadedChunksBySourceKeyRef,
  rowsCacheRef,
  loadedChunksRef,
  cacheSourceKeyRef,
  cacheSourceLruRef,
}: CreateTableOptions) => {
  const activeSheetId = source?.sheetId ?? null;
  const activeSourceIdentityKey = getTableSourceIdentityKey(source);
  const hasControlledPreviewFile = file !== undefined;
  const hasControlledPreviewStatus = loadState !== undefined;
  const previewFile = file ?? null;
  const previewStatus = loadState ?? TABLE_LOAD_STATE_IDLE;
  const ownedTableRowsCacheBySourceKeyRef = createTableRef(new Map<string, Map<number, unknown[]>>());
  const ownedPreviewLoadedChunksBySourceKeyRef = createTableRef(new Map<string, Set<number>>());
  const ownedTableRowsCacheRef = createTableRef(new Map<number, unknown[]>());
  const ownedPreviewLoadedChunksRef = createTableRef(new Set<number>());
  const ownedPreviewCacheSourceKeyRef = createTableRef<string | null>(null);
  const ownedPreviewCacheSourceLruRef = createTableRef(new Set<string>());
  const tableRowsCacheBySourceKeyRef = rowsCacheBySourceKeyRef ?? ownedTableRowsCacheBySourceKeyRef;
  const previewLoadedChunksBySourceKeyRef = loadedChunksBySourceKeyRef ?? ownedPreviewLoadedChunksBySourceKeyRef;
  const tableRowsCacheRef = rowsCacheRef ?? ownedTableRowsCacheRef;
  const previewLoadedChunksRef = loadedChunksRef ?? ownedPreviewLoadedChunksRef;
  const previewCacheSourceKeyRef = cacheSourceKeyRef ?? ownedPreviewCacheSourceKeyRef;
  const previewCacheSourceLruRef = cacheSourceLruRef ?? ownedPreviewCacheSourceLruRef;
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

  const previewStatusRef = createTableRef<TableLoadState>(previewStatus);
  const previewFileRef = createTableRef<TableFile | null>(previewFile);
  const previewPendingChunksBySourceKeyRef = createTableRef<Map<string, Set<number>>>(
    new Map(),
  );
  const columnDisplayProfileCacheRef = createTableRef(new Map<string, ColumnDisplayProfile>());
  const columnDisplayScaleOverridesRef = createTableRef(new Map<string, number>());
  const columnDisplayScaleOverrideVersionRef = createTableRef(0);
  const numericDisplayModeRef = createTableRef<NumericDisplayMode>(numericDisplayMode);
  numericDisplayModeRef.current = numericDisplayMode;

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

    for (const input of Array.isArray(previewInputs) ? previewInputs : []) {
      const sourceEntry = createTableSourceEntry(input);
      if (!sourceEntry) continue;
      entries.push(sourceEntry);
    }

    return entries;
  }, [previewInputs]);

  const sourcesByKey = memoValue(() => {
    const map = new Map<string, TableSourceEntry>();
    for (const sourceEntry of sourceEntries) {
      map.set(sourceEntry.sourceKey, sourceEntry);
    }
    return map;
  }, [sourceEntries]);

  const selectedSource = memoValue((): TableSourceEntry | null => {
    if (activeSourceIdentityKey) {
      const exactSource = sourcesByKey.get(activeSourceIdentityKey);
      if (exactSource) {
        return exactSource;
      }

      const resourceKey = source?.resource?.toString()?.trim() ?? "";
      if (resourceKey) {
        const resourceSource = sourceEntries.find(sourceEntry =>
          sourceEntry.source.resource?.toString() === resourceKey &&
          (!activeSheetId || sourceEntry.source.sheetId === activeSheetId)
        );
        if (resourceSource) {
          return resourceSource;
        }
      }
    }

    return null;
  }, [
    activeSourceIdentityKey,
    activeSheetId,
    source,
    sourceEntries,
    sourcesByKey,
  ]);

  const activeSourceKey = selectedSource?.sourceKey ?? null;
  const activeSourceSignature = selectedSource
    ? `${selectedSource.sourceKey}:${selectedSource.sourceVersion}`
    : null;
  const sourcesByKeyRef = createTableRef(new Map<string, TableSourceEntry>());
  const activeSourceKeyRef = createTableRef<string | null>(activeSourceKey);

  runEffect(() => {
    sourcesByKeyRef.current = sourcesByKey;
  }, [sourcesByKey]);

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

  const getOrCreatePreviewSourceCaches = memoCallback(
    (sourceKey: string) => {
      const cacheBySourceKey = tableRowsCacheBySourceKeyRef.current;
      const chunksBySourceKey = previewLoadedChunksBySourceKeyRef.current;

      let rowCache = cacheBySourceKey.get(sourceKey);
      if (!rowCache) {
        rowCache = new Map<number, unknown[]>();
        cacheBySourceKey.set(sourceKey, rowCache);
      }

      let loadedChunks = chunksBySourceKey.get(sourceKey);
      if (!loadedChunks) {
        loadedChunks = new Set<number>();
        chunksBySourceKey.set(sourceKey, loadedChunks);
      }

      return { loadedChunks, rowCache };
    },
    [previewLoadedChunksBySourceKeyRef, tableRowsCacheBySourceKeyRef],
  );

  const getOrCreatePendingChunks = memoCallback((sourceKey: string) => {
    const pendingBySourceKey = previewPendingChunksBySourceKeyRef.current;
    let pendingChunks = pendingBySourceKey.get(sourceKey);
    if (!pendingChunks) {
      pendingChunks = new Set<number>();
      pendingBySourceKey.set(sourceKey, pendingChunks);
    }
    return pendingChunks;
  }, []);

  const notifyTableDisplayProfileChanged = memoCallback((
    change: Partial<Omit<TableRowsVersionChangeEvent, "version">> = {
      full: true,
      kind: "display",
      ranges: [],
    },
  ) => {
    columnDisplayProfileCacheRef.current = new Map();
    cancelRowsVersionNotification();
    notifyRowsVersion({
      full: change.full ?? true,
      kind: change.kind ?? "display",
      ranges: change.ranges ?? [],
    });
  }, [cancelRowsVersionNotification, columnDisplayProfileCacheRef, notifyRowsVersion]);

  const notifyTableRowsCacheChanged = memoCallback((
    ranges: readonly TableDirtyRange[] = [],
  ) => {
    if (numericDisplayModeRef.current === "smart") {
      notifyTableDisplayProfileChanged();
      return;
    }

    columnDisplayProfileCacheRef.current = new Map();
    notifyRowsVersion({
      full: ranges.length === 0,
      kind: ranges.length === 0 ? "reset" : "content",
      ranges,
    });
  }, [
    columnDisplayProfileCacheRef,
    notifyRowsVersion,
    notifyTableDisplayProfileChanged,
    numericDisplayModeRef,
  ]);

  const mergePreviewSeedRows = memoCallback(
    (sourceKey: string, startRow: number, rows: unknown[][]) => {
      if (!sourceKey) return false;
      const safeRows = sanitizeTableRowBatch(rows);
      if (!safeRows.length) return false;

      const { loadedChunks, rowCache } = getOrCreatePreviewSourceCaches(sourceKey);
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
      if (merged.complete && previewCacheSourceKeyRef.current === sourceKey) {
        notifyTableRowsCacheChanged([{
          startRow: safeStart,
          endRow: safeStart + safeRows.length,
        }]);
      }
      return merged.complete;
    },
    [getOrCreatePreviewSourceCaches, notifyTableRowsCacheChanged, previewCacheSourceKeyRef],
  );

  const cancelPendingTableRowRequests = memoCallback(() => {
    previewPendingChunksBySourceKeyRef.current = new Map();
  }, [previewPendingChunksBySourceKeyRef]);

  const assignCurrentPreviewCache = memoCallback(
    ({
      sourceKey = null,
      loadedChunks = new Set<number>(),
      rowCache = new Map<number, unknown[]>(),
    }: {
      sourceKey?: string | null;
      loadedChunks?: Set<number>;
      rowCache?: Map<number, unknown[]>;
    } = {}) => {
      previewCacheSourceKeyRef.current = sourceKey;
      tableRowsCacheRef.current = rowCache;
      previewLoadedChunksRef.current = loadedChunks;
    },
    [previewCacheSourceKeyRef, previewLoadedChunksRef, tableRowsCacheRef],
  );

  const resetCurrentPreviewCache = memoCallback(() => {
    assignCurrentPreviewCache();
    notifyTableRowsCacheChanged();
  }, [assignCurrentPreviewCache, notifyTableRowsCacheChanged]);

  const clearAllPreviewCaches = memoCallback(() => {
    tableRowsCacheBySourceKeyRef.current = new Map();
    previewLoadedChunksBySourceKeyRef.current = new Map();
    previewCacheSourceLruRef.current = new Set();
    previewPendingChunksBySourceKeyRef.current = new Map();
    assignCurrentPreviewCache();
    columnDisplayProfileCacheRef.current = new Map();
    notifyTableRowsCacheChanged();
  }, [
    assignCurrentPreviewCache,
    columnDisplayProfileCacheRef,
    notifyTableRowsCacheChanged,
    previewCacheSourceLruRef,
    previewLoadedChunksBySourceKeyRef,
    tableRowsCacheBySourceKeyRef,
  ]);

  const invalidatePreviewRequests = memoCallback(() => {
    cancelPendingTableRowRequests();
    previewPendingChunksBySourceKeyRef.current = new Map();
    columnDisplayProfileCacheRef.current = new Map();
  }, [
    cancelPendingTableRowRequests,
    columnDisplayProfileCacheRef,
    previewPendingChunksBySourceKeyRef,
  ]);

  const clearPreviewState = memoCallback(
    ({ clearSelection = false }: { clearSelection?: boolean } = {}) => {
      setPreviewFile(null);
      setPreviewStatus(TABLE_LOAD_STATE_IDLE);

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

      tableRowsCacheBySourceKeyRef.current.delete(sourceKey);
      previewLoadedChunksBySourceKeyRef.current.delete(sourceKey);
      previewCacheSourceLruRef.current.delete(sourceKey);
      previewPendingChunksBySourceKeyRef.current.delete(sourceKey);
      for (const overrideKey of Array.from(columnDisplayScaleOverridesRef.current.keys())) {
        if (overrideKey.startsWith(`${sourceKey}:`)) {
          columnDisplayScaleOverridesRef.current.delete(overrideKey);
        }
      }

      if (previewCacheSourceKeyRef.current === sourceKey) {
        resetCurrentPreviewCache();
      }
    },
    [
      previewCacheSourceKeyRef,
      previewCacheSourceLruRef,
      previewLoadedChunksBySourceKeyRef,
      previewPendingChunksBySourceKeyRef,
      tableRowsCacheBySourceKeyRef,
      columnDisplayScaleOverridesRef,
      resetCurrentPreviewCache,
    ],
  );

  const touchPreviewSourceCache = memoCallback(
    ({
      activateCurrent = false,
      sourceKey,
    }: {
      activateCurrent?: boolean;
      sourceKey: string | null;
    }) => {
      if (!sourceKey) {
        if (activateCurrent) {
          previewCacheSourceLruRef.current = new Set();
          assignCurrentPreviewCache();
        }
        return;
      }

      const { loadedChunks, rowCache } = getOrCreatePreviewSourceCaches(sourceKey);

      if (activateCurrent) {
        assignCurrentPreviewCache({ sourceKey, loadedChunks, rowCache });
      }

      const sourceLru = previewCacheSourceLruRef.current;
      sourceLru.delete(sourceKey);
      sourceLru.add(sourceKey);

      while (sourceLru.size > TABLE_MAX_CACHED_FILES) {
        const oldestSourceKey = sourceLru.values().next().value as string | undefined;
        if (!oldestSourceKey || (activateCurrent && oldestSourceKey === sourceKey)) break;

        disposePreviewSourceCache(oldestSourceKey);
      }
    },
    [
      assignCurrentPreviewCache,
      disposePreviewSourceCache,
      getOrCreatePreviewSourceCaches,
      previewCacheSourceLruRef,
    ],
  );

  const activatePreviewSourceCache = memoCallback(
    (sourceKey: string | null) => {
      touchPreviewSourceCache({ activateCurrent: true, sourceKey });
    },
    [touchPreviewSourceCache],
  );

  runEffect(() => {
    return () => {
      invalidatePreviewRequests();
      clearAllPreviewCaches();
    };
  }, [clearAllPreviewCaches, invalidatePreviewRequests]);

  runEffect(() => {
    const targetSource = selectedSource;
    const targetFile = targetSource?.input ?? null;
    const targetSourceKey = targetSource?.sourceKey ?? null;
    if (!targetSource || !targetFile || !targetSourceKey) return;
    if (isUnhealthyTableSource(targetFile)) {
      const nextPreviewFile = createTableFileFromSourceEntry(targetSource);
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
    const tableModelContent = targetSource.content;
    if (tableModelContent) {
      const nextPreviewFile = createTableFileFromSourceEntry(targetSource);
      activatePreviewSourceCache(targetSourceKey);
      mergePreviewSeedRows(
        targetSourceKey,
        0,
        tableModelContent.rows as unknown[][],
      );
      runImmediately(() => {
        if (
          !(
            isTableFileForSource(previewFileRef.current, targetSourceKey) &&
            areTableFilesEqual(previewFileRef.current, nextPreviewFile)
          )
        ) {
          setPreviewFile(nextPreviewFile);
        }
        setPreviewStatus({ state: "ready", message: "" });
      });
      return;
    }

    const nextPreviewFile = createTableFileFromSourceEntry(targetSource);
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
        message: localize(
          "table.preview.modelContentUnavailable",
          "Table model content is unavailable for this resource.",
        ),
      });
    });
  }, [
    activatePreviewSourceCache,
    activeSourceSignature,
    disposePreviewSourceCache,
    mergePreviewSeedRows,
    previewFileRef,
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
      const rawTableId = currentFile?.sourceKey ?? activeSourceKey ?? "";
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
      const rawTableId = currentFile?.sourceKey ?? activeSourceKey ?? "";
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

      const { nonEmptyCount, numericSamples } = collectNumericColumnSamples(samples);

      if (!nonEmptyCount || numericSamples.length / nonEmptyCount < TABLE_COLUMN_NUMERIC_THRESHOLD) {
        if (shouldCacheColumnDisplayProfile(samples.length, currentFile?.rowCount)) {
          columnDisplayProfileCacheRef.current.set(cacheKey, rawProfile);
        }
        return rawProfile;
      }

      const autoScaleExponent = chooseColumnScaleExponentFromCells(numericSamples);
      const hasManualScaleExponent =
        typeof overrideScaleExponent === "number" && Number.isInteger(overrideScaleExponent);
      const scaleExponent = hasManualScaleExponent
        ? clampColumnDisplayScaleExponent(overrideScaleExponent)
        : autoScaleExponent;
      const profile: ColumnDisplayProfile = {
        rawTableId,
        columnId: String(normalizedColIndex),
        mode: "columnScale",
        isNumericColumn: true,
        isScaleManual: hasManualScaleExponent || undefined,
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
      notifyTableDisplayProfileChanged({
        full: false,
        kind: "display",
        ranges: [{
          startRow: 0,
          endRow: Math.max(0, Math.floor(Number(previewFileRef.current?.rowCount) || 0)),
          startCol: normalizedColIndex,
          endCol: normalizedColIndex + 1,
        }],
      });
      return true;
    },
    [
      columnDisplayScaleOverrideVersionRef,
      columnDisplayScaleOverridesRef,
      getColumnDisplayProfile,
      notifyTableDisplayProfileChanged,
      previewFileRef,
    ],
  );

  const resetColumnDisplayScale = memoCallback(
    (colIndex: number): boolean => {
      const normalizedColIndex = Math.max(0, Math.floor(Number(colIndex) || 0));
      if (!Number.isInteger(normalizedColIndex) || normalizedColIndex < 0) {
        return false;
      }

      const currentFile = previewFileRef.current;
      const rawTableId = currentFile?.sourceKey ?? activeSourceKey ?? "";
      const overrideKey = createColumnDisplayScaleOverrideKey(rawTableId, normalizedColIndex);
      if (!columnDisplayScaleOverridesRef.current.delete(overrideKey)) {
        return false;
      }

      columnDisplayScaleOverrideVersionRef.current += 1;
      notifyTableDisplayProfileChanged({
        full: false,
        kind: "display",
        ranges: [{
          startRow: 0,
          endRow: Math.max(0, Math.floor(Number(currentFile?.rowCount) || 0)),
          startCol: normalizedColIndex,
          endCol: normalizedColIndex + 1,
        }],
      });
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
    (sourceKey: string, startRow: number, endRow: number): Promise<unknown[][]> => {
      if (!sourceKey) return Promise.resolve([]);

      const start = Math.max(0, Math.floor(Number(startRow) || 0));
      const end = Math.max(start, Math.floor(Number(endRow) || start));
      const rows = sourcesByKeyRef.current.get(sourceKey)?.content?.rows ?? [];

      return Promise.resolve(sanitizeTableRowBatch(rows.slice(start, end)));
    },
    [
      sourcesByKeyRef,
    ],
  );

  const ensureTableCells = memoCallback(
    async (sourceKey: string, cells: TableCellReadRequest[]) => {
      if (!sourceKey || !Array.isArray(cells) || !cells.length) return;
      const currentPreviewFile = previewFileRef.current;
      if (!currentPreviewFile?.rowCount || !Number.isFinite(currentPreviewFile.rowCount)) return;

      const totalRows = Math.max(0, Math.floor(currentPreviewFile.rowCount));
      const columnCount = Math.max(
        0,
        Math.floor(Number(currentPreviewFile.columnCount) || 0),
      );
      if (totalRows <= 0 || columnCount <= 0) return;

      const { rowCache } = getOrCreatePreviewSourceCaches(sourceKey);
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

      if (changed && previewCacheSourceKeyRef.current === sourceKey) {
        notifyTableRowsCacheChanged(ranges.map(([startRow, endRow]) => ({
          startRow,
          endRow,
        })));
      }
    },
    [
      getOrCreatePreviewSourceCaches,
      notifyTableRowsCacheChanged,
      previewCacheSourceKeyRef,
      previewFileRef,
      requestTableRowsRange,
    ],
  );

  const ensureTableRows = memoCallback(
    async (sourceKey: string, startRow: number, endRow: number) => {
      const currentPreviewFile = previewFileRef.current;
      if (!currentPreviewFile?.rowCount || !Number.isFinite(currentPreviewFile.rowCount)) return;
      if (!sourceKey) return;

      const { loadedChunks, rowCache } = getOrCreatePreviewSourceCaches(sourceKey);
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

      const dirtyRanges: TableDirtyRange[] = [];
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
            previewCacheSourceKeyRef.current === sourceKey &&
            merged.mergedChunkStarts.length > 0
          ) {
            dirtyRanges.push({ startRow: rangeStart, endRow: rangeEnd });
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

      if (dirtyRanges.length > 0) {
        notifyTableRowsCacheChanged(dirtyRanges);
      }
    },
    [
      getOrCreatePendingChunks,
      getOrCreatePreviewSourceCaches,
      notifyTableRowsCacheChanged,
      previewCacheSourceKeyRef,
      previewFileRef,
      requestTableRowsRange,
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
      const selectedFileName = selectedSource?.input.fileName ?? "";
      const selectedSheetName = selectedSource?.sheetName ?? null;
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
        selectedSheetId: selectedSource?.source.sheetId ?? activeSheetId ?? null,
        source: selectedSource?.source ?? null,
        sourceKey: activeSourceKey,
        displayVersion: settingsVersion,
      };
    },
    [
      previewFileRef,
      previewStatusRef,
      activeSheetId,
      activeSourceKey,
      settingsVersion,
      selectedSource,
    ],
  );

  return {
    adjustColumnDisplayScale,
    cancelPendingRowRequests: cancelPendingTableRowRequests,
    clearHighlight,
    clearSelection,
    clearState: clearPreviewState,
    ensureCells: ensureTableCells,
    ensureRows: ensureTableRows,
    getColumnDisplayProfile,
    getHighlight,
    getRow: getTableRow,
    getRowsVersion,
    getRevealCell,
    getSelection,
    getState,
    invalidateRequests: invalidatePreviewRequests,
    onDidChangeHighlight,
    onDidChangeRevealCell,
    onDidChangeState,
    onDidChangeSelection,
    revealCell,
    resetColumnDisplayScale,
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

const toBrowserTableOptions = (options: CreateTableViewModelWithScopeOptions): UseTableOptions => ({
  ...options,
});

export const createTableViewModelInScope = (
  scope: TableStateScope,
  options: CreateTableViewModelWithScopeOptions,
): TableViewModel => {
  const browserOptions = toBrowserTableOptions(options);
  return runWithTableStateScope(scope, () => createTableViewModel(browserOptions));
};

export const createTableViewModelWithScope = (
  options: CreateTableViewModelWithScopeOptions,
): TableViewModel => {
  const scope = getTableStateScope(defaultTableStateScopeKey);
  return createTableViewModelInScope(scope, options);
};
