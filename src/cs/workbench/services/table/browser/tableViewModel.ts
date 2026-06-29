/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import type { CancellationToken } from "src/cs/base/common/cancellation";
import { CancellationError } from "src/cs/base/common/errors";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  type TableDirtyRange,
  type TablePreviewHealth,
  type TableRangeDecoration,
  type TableSheetTab,
  type TableViewModel,
  type TableRowsVersionChangeEvent,
  type TableSource,
  areTableSourcesEqual,
  toTableSheetKey,
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
import {
  readTableModelContentRows,
  type TableModelContentSnapshot,
  type TableParseDiagnostic,
} from "src/cs/workbench/services/table/common/model";

// TableViewModel owns the service data plane: source switching, row paging,
// cache state, and the command-visible selection/highlight/reveal snapshot. The
// pure cache/cell-read helpers live here so callers do not depend on small
// implementation files beside the view-model owner.

type TableCellReadRequest = Parameters<TableViewModel["ensureCells"]>[0][number];
type TableState = ReturnType<TableViewModel["getState"]>;
type TableCell = NonNullable<ReturnType<TableViewModel["getRevealCell"]>>;
type TableSelection = ReturnType<TableViewModel["getSelection"]>;
type TableRange = NonNullable<TableSelection["ranges"]>[number];
type TableFile = NonNullable<TableState["file"]>;
export type TableViewModelSourceData = {
  readonly columnCount?: number;
  readonly diagnostics?: readonly TableParseDiagnostic[];
  readonly fileName?: string;
  readonly maxCellLengths?: readonly number[];
  readonly previewHealth?: TablePreviewHealth;
  readonly previewHealthMessage?: string | null;
  readonly relativePath?: string | null;
  readonly resource?: URI;
  readonly rowCount?: number;
  readonly sheetId?: string | null;
  readonly sheetName?: string | null;
  readonly sourcePath?: string | null;
  readonly sourceVersion?: number;
  readonly tableModelContent?: TableModelContentSnapshot;
};
export type TableViewModelSourceInput = {
  readonly data: TableViewModelSourceData;
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

  return first.sheetId === second.sheetId &&
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

      return range.sheetId === next.sheetId &&
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

const normalizeTableRangeDecorations = (
  decorations: readonly TableRangeDecoration[] | null | undefined,
  context: { readonly columnCount: number; readonly rowCount: number; readonly sheetId: string | null } | null,
): readonly TableRangeDecoration[] => {
  const rowCount = Math.max(0, Math.floor(Number(context?.rowCount) || 0));
  const columnCount = Math.max(0, Math.floor(Number(context?.columnCount) || 0));
  const sheetId = context?.sheetId ?? null;
  if (rowCount <= 0 || columnCount <= 0) {
    return [];
  }

  return (Array.isArray(decorations) ? decorations : [])
    .map((decoration): TableRangeDecoration | null => {
      const startRow = Math.floor(Number(decoration.startRow));
      const endRow = Math.floor(Number(decoration.endRow));
      const startCol = Math.floor(Number(decoration.startCol));
      const endCol = Math.floor(Number(decoration.endCol));
      if (
        !Number.isInteger(startRow) ||
        !Number.isInteger(endRow) ||
        !Number.isInteger(startCol) ||
        !Number.isInteger(endCol) ||
        !isTableRangeDecorationKind(decoration.kind) ||
        (decoration.sheetId && decoration.sheetId !== sheetId)
      ) {
        return null;
      }

      const normalizedStartRow = Math.max(0, Math.min(startRow, endRow));
      const normalizedEndRow = Math.min(rowCount - 1, Math.max(startRow, endRow));
      const normalizedStartCol = Math.max(0, Math.min(startCol, endCol));
      const normalizedEndCol = Math.min(columnCount - 1, Math.max(startCol, endCol));
      if (normalizedStartRow > normalizedEndRow || normalizedStartCol > normalizedEndCol) {
        return null;
      }

      return {
        kind: decoration.kind,
        sheetId,
        startRow: normalizedStartRow,
        endRow: normalizedEndRow,
        startCol: normalizedStartCol,
        endCol: normalizedEndCol,
      };
    })
    .filter((decoration): decoration is TableRangeDecoration => Boolean(decoration));
};

const areTableRangeDecorationsEqual = (
  first: readonly TableRangeDecoration[],
  second: readonly TableRangeDecoration[],
): boolean =>
  first.length === second.length &&
  first.every((decoration, index) => {
    const other = second[index];
    return decoration.kind === other?.kind &&
      decoration.sheetId === other.sheetId &&
      decoration.startRow === other.startRow &&
      decoration.endRow === other.endRow &&
      decoration.startCol === other.startCol &&
      decoration.endCol === other.endCol;
  });

const isTableRangeDecorationKind = (
  kind: unknown,
): kind is TableRangeDecoration["kind"] =>
  kind === "templateBlock" || kind === "templateX" || kind === "templateY";

const firstString = (...values: readonly unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return null;
};

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
  readonly data: TableViewModelSourceData;
  readonly sheetKey: string;
  readonly source: TableSource;
  readonly sourceVersion: number;
  readonly sheetName: string | null;
};

const readSourceDataString = (
  data: TableViewModelSourceData | null | undefined,
  key: keyof TableViewModelSourceData,
): string | null => {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const getSourceDataSheetName = (
  data: TableViewModelSourceData | null | undefined,
): string | null => readSourceDataString(data, "sheetName");

const getSourceDataSheetId = (
  data: TableViewModelSourceData | null | undefined,
): string | null =>
  readSourceDataString(data, "sheetId") ??
  getSourceDataSheetName(data);

const getSourceDataResource = (
  data: TableViewModelSourceData | null | undefined,
  source: TableSource | null | undefined,
): URI | null => {
  const resource = data?.resource ?? source?.resource;
  return resource && typeof resource === "object" && typeof (resource as URI).toString === "function"
    ? resource as URI
    : null;
};

const getSourceDataTableModelContent = (
  data: TableViewModelSourceData | null | undefined,
): TableModelContentSnapshot | null => {
  const content = data?.tableModelContent;
  if (!content || typeof content !== "object") {
    return null;
  }

  const candidate = content as Partial<TableModelContentSnapshot>;
  return Array.isArray(candidate.rows) ? candidate as TableModelContentSnapshot : null;
};

const createTableSourceEntry = ({
  data,
  source,
}: TableViewModelSourceInput): TableSourceEntry | null => {
  const resource = getSourceDataResource(data, source);
  if (!resource) {
    return null;
  }

  const sheetId = source?.sheetId ?? getSourceDataSheetId(data);
  const resolvedSource: TableSource = {
    resource,
    sheetId,
  };
  const resolvedSheetKey = toTableSheetKey(resolvedSource);
  if (!resolvedSheetKey) {
    return null;
  }

  return {
    content: getSourceDataTableModelContent(data),
    data,
    sheetKey: resolvedSheetKey,
    sheetName: getSourceDataSheetName(data),
    source: resolvedSource,
    sourceVersion: normalizeSourceVersion(data.sourceVersion),
  };
};

const isUnhealthyTableSource = (data: TableViewModelSourceData): boolean =>
  data.previewHealth === "decodeFailed" ||
  data.previewHealth === "parseFailed" ||
  data.previewHealth === "unsupported";

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

const getUnhealthyTableMessage = (data: TableViewModelSourceData): string => {
  const message = String(data.previewHealthMessage ?? "").trim().toLowerCase();
  if (data.previewHealth === "decodeFailed") {
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
  if (data.previewHealth === "parseFailed") {
    return localize(
      "table.preview.parseFailed",
      "File content could not pass CSV table structure validation.",
    );
  }
  if (data.previewHealth === "unsupported") {
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
  diagnostics: normalizeTableParseDiagnostics(sourceEntry.data.diagnostics),
  fileName: String(sourceEntry.data.fileName ?? ""),
  sheetId: sourceEntry.source.sheetId ?? null,
  sheetName: sourceEntry.sheetName,
  source: sourceEntry.source,
  sourceVersion: sourceEntry.sourceVersion,
  previewHealth: sourceEntry.data.previewHealth,
  previewHealthMessage: sourceEntry.data.previewHealthMessage,
  rowCount: Math.max(0, Math.floor(Number(sourceEntry.data.rowCount) || 0)),
  columnCount: Math.max(0, Math.floor(Number(sourceEntry.data.columnCount) || 0)),
  maxCellLengths: Array.isArray(sourceEntry.data.maxCellLengths)
    ? sourceEntry.data.maxCellLengths.map(value => Number(value) || 0)
    : [],
});

const createTableSheetTabFromSourceEntry = (
  sourceEntry: TableSourceEntry,
): TableSheetTab => ({
  columnCount: Math.max(0, Math.floor(Number(sourceEntry.data.columnCount) || 0)),
  label: getTableSheetTabLabel(sourceEntry),
  rowCount: Math.max(0, Math.floor(Number(sourceEntry.data.rowCount) || 0)),
  sheetId: sourceEntry.source.sheetId ?? null,
  sheetName: sourceEntry.sheetName,
  source: sourceEntry.source,
});

const getTableSheetTabLabel = (
  sourceEntry: TableSourceEntry,
): string => {
  const sheetName = sourceEntry.sheetName?.trim();
  if (sheetName) {
    return sheetName;
  }

  const fileName = formatTableFileName(String(sourceEntry.data.fileName ?? ""));
  if (fileName) {
    return fileName;
  }

  const sheetId = sourceEntry.source.sheetId?.trim();
  return sheetId || localize("table.sheet.untitled", "Sheet");
};

const isTableFileForSource = (
  file: TableFile | null | undefined,
  source: TableSource | null | undefined,
): boolean => Boolean(
  source &&
  areTableSourcesEqual(file?.source, source),
);

const isTableFileForSourceEntry = (
  file: TableFile | null | undefined,
  source: TableSourceEntry | null | undefined,
): boolean =>
  source !== null &&
  source !== undefined &&
  isTableFileForSource(file, source.source) &&
  normalizeSourceVersion(file?.sourceVersion) === normalizeSourceVersion(source?.sourceVersion);

export const areTableFilesEqual = (
  current: TableFile | null | undefined,
  next: TableFile,
): boolean =>
  current?.fileName === next.fileName &&
  current?.sheetId === next.sheetId &&
  current?.sheetName === next.sheetName &&
  areTableSourcesEqual(current?.source, next.source) &&
  normalizeSourceVersion(current?.sourceVersion) === normalizeSourceVersion(next.sourceVersion) &&
  areTableParseDiagnosticsEqual(current?.diagnostics, next.diagnostics) &&
  current?.previewHealth === next.previewHealth &&
  current?.previewHealthMessage === next.previewHealthMessage &&
  current?.templateEligibility === next.templateEligibility &&
  current?.rowCount === next.rowCount &&
  current?.columnCount === next.columnCount &&
  current?.maxCellLengths.length === next.maxCellLengths.length &&
  (current?.maxCellLengths.every(
    (cellLength, index) => cellLength === next.maxCellLengths[index],
  ) ?? false);

const normalizeSourceVersion = (value: unknown): number =>
  Math.max(0, Math.floor(Number(value) || 0));

const normalizeTableParseDiagnostics = (
  diagnostics: readonly TableParseDiagnostic[] | null | undefined,
): readonly TableParseDiagnostic[] =>
  Array.isArray(diagnostics) ? [...diagnostics] : [];

const areTableParseDiagnosticsEqual = (
  current: readonly TableParseDiagnostic[] | null | undefined,
  next: readonly TableParseDiagnostic[] | null | undefined,
): boolean => {
  const left = current ?? [];
  const right = next ?? [];
  return left.length === right.length &&
    left.every((diagnostic, index) => areTableParseDiagnosticEqual(diagnostic, right[index]));
};

const areTableParseDiagnosticEqual = (
  current: TableParseDiagnostic,
  next: TableParseDiagnostic | undefined,
): boolean => {
  if (!next) {
    return false;
  }
  return current.code === next.code &&
    current.message === next.message &&
    current.severity === next.severity &&
    current.rowIndex === next.rowIndex &&
    current.columnIndex === next.columnIndex &&
    current.sheetId === next.sheetId;
};

type TableViewModelInput = {
  numericDisplayMode?: NumericDisplayMode;
  previewSources?: readonly TableViewModelSourceInput[];
  settingsVersion?: number;
  source?: TableSource | null;
};

export type CreateTableViewModelWithScopeOptions = TableViewModelInput & {
  file?: TableFile | null;
  loadState?: TableLoadState;
  setFile?: Dispatch<SetStateAction<TableFile | null>>;
  setLoadState?: Dispatch<SetStateAction<TableLoadState>>;
  rowsCacheBySheetKeyRef?: TableMutableRef<Map<string, Map<number, unknown[]>>>;
  loadedChunksBySheetKeyRef?: TableMutableRef<Map<string, Set<number>>>;
  rowsCacheRef?: TableMutableRef<Map<number, unknown[]>>;
  loadedChunksRef?: TableMutableRef<Set<number>>;
  cacheSheetKeyRef?: TableMutableRef<string | null>;
  cacheSheetLruRef?: TableMutableRef<Set<string>>;
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
const createTableViewModel = ({
  previewSources = [],
  source = null,
  numericDisplayMode = "raw",
  settingsVersion = 0,
  file,
  setFile,
  setLoadState,
  loadState,
  rowsCacheBySheetKeyRef,
  loadedChunksBySheetKeyRef,
  rowsCacheRef,
  loadedChunksRef,
  cacheSheetKeyRef,
  cacheSheetLruRef,
}: CreateTableOptions) => {
  const activeSheetId = source?.sheetId ?? null;
  const requestedSheetKey = source ? toTableSheetKey(source) : null;
  const hasControlledPreviewFile = file !== undefined;
  const hasControlledPreviewStatus = loadState !== undefined;
  const previewFile = file ?? null;
  const previewStatus = loadState ?? TABLE_LOAD_STATE_IDLE;
  const ownedTableRowsCacheBySheetKeyRef = createTableRef(new Map<string, Map<number, unknown[]>>());
  const ownedPreviewLoadedChunksBySheetKeyRef = createTableRef(new Map<string, Set<number>>());
  const ownedTableRowsCacheRef = createTableRef(new Map<number, unknown[]>());
  const ownedPreviewLoadedChunksRef = createTableRef(new Set<number>());
  const ownedPreviewCacheSheetKeyRef = createTableRef<string | null>(null);
  const ownedPreviewCacheSheetLruRef = createTableRef(new Set<string>());
  const tableRowsCacheBySheetKeyRef = rowsCacheBySheetKeyRef ?? ownedTableRowsCacheBySheetKeyRef;
  const previewLoadedChunksBySheetKeyRef = loadedChunksBySheetKeyRef ?? ownedPreviewLoadedChunksBySheetKeyRef;
  const tableRowsCacheRef = rowsCacheRef ?? ownedTableRowsCacheRef;
  const previewLoadedChunksRef = loadedChunksRef ?? ownedPreviewLoadedChunksRef;
  const previewCacheSheetKeyRef = cacheSheetKeyRef ?? ownedPreviewCacheSheetKeyRef;
  const previewCacheSheetLruRef = cacheSheetLruRef ?? ownedPreviewCacheSheetLruRef;
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
  const rangeDecorationsRef = createTableRef<readonly TableRangeDecoration[]>([]);
  const revealCellRef = createTableRef<TableCell | null>(null);
  const selectionSubscribersRef = createTableRef(new Set<(selection: TableSelection) => void>());
  const highlightSubscribersRef = createTableRef(new Set<(highlight: TableHighlight) => void>());
  const rangeDecorationSubscribersRef = createTableRef(new Set<(decorations: readonly TableRangeDecoration[]) => void>());
  const revealCellSubscribersRef = createTableRef(new Set<(cell: TableCell | null) => void>());
  const stateSubscribersRef = createTableRef(new Set<() => void>());

  const previewStatusRef = createTableRef<TableLoadState>(previewStatus);
  const previewFileRef = createTableRef<TableFile | null>(previewFile);
  const previewPendingChunksBySheetKeyRef = createTableRef<Map<string, Set<number>>>(
    new Map(),
  );
  const pendingRowResolveRequestsRef = createTableRef(new Map<number, Promise<unknown[]>>());
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

    for (const input of Array.isArray(previewSources) ? previewSources : []) {
      const sourceEntry = createTableSourceEntry(input);
      if (!sourceEntry) continue;
      entries.push(sourceEntry);
    }

    return entries;
  }, [previewSources]);

  const sourcesByKey = memoValue(() => {
    const map = new Map<string, TableSourceEntry>();
    for (const sourceEntry of sourceEntries) {
      map.set(sourceEntry.sheetKey, sourceEntry);
    }
    return map;
  }, [sourceEntries]);

  const selectedSource = memoValue((): TableSourceEntry | null => {
    if (requestedSheetKey) {
      const exactSource = sourcesByKey.get(requestedSheetKey);
      if (exactSource) {
        return exactSource;
      }
    }

    const resourceIdentity = source?.resource?.toString()?.trim() ?? "";
    if (resourceIdentity) {
      const resourceSource = sourceEntries.find(sourceEntry =>
        sourceEntry.source.resource?.toString() === resourceIdentity &&
        (!activeSheetId || sourceEntry.source.sheetId === activeSheetId)
      );
      if (resourceSource) {
        return resourceSource;
      }
    }

    return null;
  }, [
    requestedSheetKey,
    activeSheetId,
    source,
    sourceEntries,
    sourcesByKey,
  ]);

  const activeSheetKey = selectedSource?.sheetKey ?? null;
  const activeSourceSignature = selectedSource
    ? `${selectedSource.sheetKey}:${selectedSource.sourceVersion}`
    : null;
  const sourcesByKeyRef = createTableRef(new Map<string, TableSourceEntry>());
  const activeSheetKeyRef = createTableRef<string | null>(activeSheetKey);

  runEffect(() => {
    sourcesByKeyRef.current = sourcesByKey;
  }, [sourcesByKey]);

  runEffect(() => {
    activeSheetKeyRef.current = activeSheetKey;
  }, [activeSheetKey]);

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
    rangeDecorationsRef.current = [];
    revealCellRef.current = null;
    for (const callback of Array.from(rangeDecorationSubscribersRef.current)) {
      try {
        callback([]);
      } catch {
        // A broken consumer must not prevent table decorations from following the file.
      }
    }
    for (const callback of Array.from(selectionSubscribersRef.current)) {
      try {
        callback(clearedSelection);
      } catch {
        // A broken consumer must not prevent table state from following the file.
      }
    }
  }, [activeSourceSignature]);

  const getOrCreatePreviewSheetCaches = memoCallback(
    (sheetKey: string) => {
      const cacheBySheetKey = tableRowsCacheBySheetKeyRef.current;
      const chunksBySheetKey = previewLoadedChunksBySheetKeyRef.current;

      let rowCache = cacheBySheetKey.get(sheetKey);
      if (!rowCache) {
        rowCache = new Map<number, unknown[]>();
        cacheBySheetKey.set(sheetKey, rowCache);
      }

      let loadedChunks = chunksBySheetKey.get(sheetKey);
      if (!loadedChunks) {
        loadedChunks = new Set<number>();
        chunksBySheetKey.set(sheetKey, loadedChunks);
      }

      return { loadedChunks, rowCache };
    },
    [previewLoadedChunksBySheetKeyRef, tableRowsCacheBySheetKeyRef],
  );

  const getOrCreatePendingChunks = memoCallback((sheetKey: string) => {
    const pendingBySheetKey = previewPendingChunksBySheetKeyRef.current;
    let pendingChunks = pendingBySheetKey.get(sheetKey);
    if (!pendingChunks) {
      pendingChunks = new Set<number>();
      pendingBySheetKey.set(sheetKey, pendingChunks);
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
    (sheetKey: string, startRow: number, rows: unknown[][]) => {
      if (!sheetKey) return false;
      const safeRows = sanitizeTableRowBatch(rows);
      if (!safeRows.length) return false;
      const endSeedPerf = startPerf("table.viewModel.seedRows", {
        rowCount: safeRows.length,
        startRow: Math.max(0, Math.floor(Number(startRow) || 0)),
      }, { silent: true });

      const { loadedChunks, rowCache } = getOrCreatePreviewSheetCaches(sheetKey);
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
      if (merged.complete && previewCacheSheetKeyRef.current === sheetKey) {
        notifyTableRowsCacheChanged([{
          startRow: safeStart,
          endRow: safeStart + safeRows.length,
        }]);
      }
      endSeedPerf({
        cacheRows: rowCache.size,
        success: merged.complete,
      });
      return merged.complete;
    },
    [getOrCreatePreviewSheetCaches, notifyTableRowsCacheChanged, previewCacheSheetKeyRef],
  );

  const cancelPendingTableRowRequests = memoCallback(() => {
    previewPendingChunksBySheetKeyRef.current = new Map();
    pendingRowResolveRequestsRef.current = new Map();
  }, [pendingRowResolveRequestsRef, previewPendingChunksBySheetKeyRef]);

  const assignCurrentPreviewCache = memoCallback(
    ({
      sheetKey = null,
      loadedChunks = new Set<number>(),
      rowCache = new Map<number, unknown[]>(),
    }: {
      sheetKey?: string | null;
      loadedChunks?: Set<number>;
      rowCache?: Map<number, unknown[]>;
    } = {}) => {
      previewCacheSheetKeyRef.current = sheetKey;
      tableRowsCacheRef.current = rowCache;
      previewLoadedChunksRef.current = loadedChunks;
    },
    [previewCacheSheetKeyRef, previewLoadedChunksRef, tableRowsCacheRef],
  );

  const resetCurrentPreviewCache = memoCallback(() => {
    assignCurrentPreviewCache();
    notifyTableRowsCacheChanged();
  }, [assignCurrentPreviewCache, notifyTableRowsCacheChanged]);

  const clearAllPreviewCaches = memoCallback(() => {
    tableRowsCacheBySheetKeyRef.current = new Map();
    previewLoadedChunksBySheetKeyRef.current = new Map();
    previewCacheSheetLruRef.current = new Set();
    previewPendingChunksBySheetKeyRef.current = new Map();
    assignCurrentPreviewCache();
    columnDisplayProfileCacheRef.current = new Map();
    notifyTableRowsCacheChanged();
  }, [
    assignCurrentPreviewCache,
    columnDisplayProfileCacheRef,
    notifyTableRowsCacheChanged,
    previewCacheSheetLruRef,
    previewLoadedChunksBySheetKeyRef,
    tableRowsCacheBySheetKeyRef,
  ]);

  const invalidatePreviewRequests = memoCallback(() => {
    cancelPendingTableRowRequests();
    previewPendingChunksBySheetKeyRef.current = new Map();
    columnDisplayProfileCacheRef.current = new Map();
  }, [
    cancelPendingTableRowRequests,
    columnDisplayProfileCacheRef,
    previewPendingChunksBySheetKeyRef,
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

  const disposePreviewSheetCache = memoCallback(
    (sheetKey: string) => {
      if (typeof sheetKey !== "string" || !sheetKey) return;

      tableRowsCacheBySheetKeyRef.current.delete(sheetKey);
      previewLoadedChunksBySheetKeyRef.current.delete(sheetKey);
      previewCacheSheetLruRef.current.delete(sheetKey);
      previewPendingChunksBySheetKeyRef.current.delete(sheetKey);
      for (const overrideKey of Array.from(columnDisplayScaleOverridesRef.current.keys())) {
        if (overrideKey.startsWith(`${sheetKey}:`)) {
          columnDisplayScaleOverridesRef.current.delete(overrideKey);
        }
      }

      if (previewCacheSheetKeyRef.current === sheetKey) {
        resetCurrentPreviewCache();
      }
    },
    [
      previewCacheSheetKeyRef,
      previewCacheSheetLruRef,
      previewLoadedChunksBySheetKeyRef,
      previewPendingChunksBySheetKeyRef,
      tableRowsCacheBySheetKeyRef,
      columnDisplayScaleOverridesRef,
      resetCurrentPreviewCache,
    ],
  );

  const touchPreviewSheetCache = memoCallback(
    ({
      activateCurrent = false,
      sheetKey,
    }: {
      activateCurrent?: boolean;
      sheetKey: string | null;
    }) => {
      if (!sheetKey) {
        if (activateCurrent) {
          previewCacheSheetLruRef.current = new Set();
          assignCurrentPreviewCache();
        }
        return;
      }

      const { loadedChunks, rowCache } = getOrCreatePreviewSheetCaches(sheetKey);

      if (activateCurrent) {
        assignCurrentPreviewCache({ sheetKey, loadedChunks, rowCache });
      }

      const sheetLru = previewCacheSheetLruRef.current;
      sheetLru.delete(sheetKey);
      sheetLru.add(sheetKey);

      while (sheetLru.size > TABLE_MAX_CACHED_FILES) {
        const oldestSheetKey = sheetLru.values().next().value as string | undefined;
        if (!oldestSheetKey || (activateCurrent && oldestSheetKey === sheetKey)) break;

        disposePreviewSheetCache(oldestSheetKey);
      }
    },
    [
      assignCurrentPreviewCache,
      disposePreviewSheetCache,
      getOrCreatePreviewSheetCaches,
      previewCacheSheetLruRef,
    ],
  );

  const activatePreviewSheetCache = memoCallback(
    (sheetKey: string | null) => {
      touchPreviewSheetCache({ activateCurrent: true, sheetKey });
    },
    [touchPreviewSheetCache],
  );

  runEffect(() => {
    return () => {
      invalidatePreviewRequests();
      clearAllPreviewCaches();
    };
  }, [clearAllPreviewCaches, invalidatePreviewRequests]);

  runEffect(() => {
    const targetSource = selectedSource;
    const targetData = targetSource?.data ?? null;
    const targetSheetKey = targetSource?.sheetKey ?? null;
    if (!targetSource || !targetData || !targetSheetKey) return;
    if (isUnhealthyTableSource(targetData)) {
      const nextPreviewFile = createTableFileFromSourceEntry(targetSource);
      disposePreviewSheetCache(targetSheetKey);
      runImmediately(() => {
        if (
          !(
            isTableFileForSource(previewFileRef.current, targetSource.source) &&
            areTableFilesEqual(previewFileRef.current, nextPreviewFile)
          )
        ) {
          setPreviewFile(nextPreviewFile);
        }
        setPreviewStatus({
          state: "error",
          message: getUnhealthyTableMessage(targetData),
        });
      });
      return;
    }
    const tableModelContent = targetSource.content;
    if (tableModelContent) {
      const nextPreviewFile = createTableFileFromSourceEntry(targetSource);
      activatePreviewSheetCache(targetSheetKey);
      mergePreviewSeedRows(
        targetSheetKey,
        0,
        readTableModelContentRows(
          tableModelContent,
          0,
          Math.min(tableModelContent.rowCount, TABLE_UI_CHUNK_SIZE_ROWS),
        ) as unknown[][],
      );
      runImmediately(() => {
        if (
          !(
            isTableFileForSource(previewFileRef.current, targetSource.source) &&
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
    disposePreviewSheetCache(targetSheetKey);
    runImmediately(() => {
      if (
        !(
          isTableFileForSource(previewFileRef.current, targetSource.source) &&
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
    activatePreviewSheetCache,
    activeSourceSignature,
    disposePreviewSheetCache,
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

  const getResolvedTableRow = memoCallback(
    (rowIndex: number): unknown[] => {
      const row = getTableRow(rowIndex);
      if (!row) {
        throw new RangeError(`Table row is not resolved: ${rowIndex}`);
      }
      return row;
    },
    [getTableRow],
  );

  const isTableRowResolved = memoCallback(
    (rowIndex: number): boolean => getTableRow(rowIndex) !== null,
    [getTableRow],
  );

  const createRawColumnDisplayProfile = memoCallback(
    (colIndex: number): ColumnDisplayProfile => {
      const currentFile = previewFileRef.current;
      return {
        columnId: String(Math.max(0, Math.floor(Number(colIndex) || 0))),
        mode: "raw",
        isNumericColumn: false,
        scaleExponent: 0,
        significantDigits: DEFAULT_TABLE_DISPLAY_SIGNIFICANT_DIGITS,
        sourceVersion: normalizeSourceVersion(currentFile?.sourceVersion),
        settingsVersion,
      };
    },
    [previewFileRef, settingsVersion],
  );

  const collectColumnSampleValues = memoCallback(
    (colIndex: number): readonly unknown[] => {
      const currentFile = previewFileRef.current;
      const sheetKey = activeSheetKey ?? "";
      const columnCount = Math.max(0, Math.floor(Number(currentFile?.columnCount) || 0));
      const normalizedColIndex = Math.max(0, Math.floor(Number(colIndex) || 0));
      if (normalizedColIndex >= columnCount) {
        return [];
      }

      const content = sourcesByKeyRef.current.get(sheetKey)?.content;
      if (content) {
        const contentSamples = readTableModelContentRows(
          content,
          0,
          Math.min(content.rowCount, TABLE_COLUMN_PROFILE_MAX_SAMPLE_ROWS),
        ).map(row => row[normalizedColIndex]);
        if (contentSamples.length) {
          return contentSamples;
        }
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
    [activeSheetKey, previewFileRef, sourcesByKeyRef, tableRowsCacheRef],
  );

  const getColumnDisplayProfile = memoCallback(
    (colIndex: number): ColumnDisplayProfile => {
      const currentFile = previewFileRef.current;
      const normalizedColIndex = Math.max(0, Math.floor(Number(colIndex) || 0));
      const sheetKey = activeSheetKey ?? "";
      const sourceVersion = normalizeSourceVersion(currentFile?.sourceVersion);
      const overrideKey = createColumnDisplayScaleOverrideKey(sheetKey, normalizedColIndex);
      const overrideScaleExponent = columnDisplayScaleOverridesRef.current.get(overrideKey);
      const cacheKey = [
        sheetKey,
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

      const endProfilePerf = startPerf("table.viewModel.columnDisplayProfile", {
        columnIndex: normalizedColIndex,
        mode: numericDisplayMode,
        rowCount: currentFile?.rowCount ?? 0,
      }, { silent: true });
      const samples = collectColumnSampleValues(normalizedColIndex);
      if (!samples.length) {
        endProfilePerf({
          result: "rawNoSamples",
          sampleCount: 0,
          success: false,
        });
        return rawProfile;
      }

      const { nonEmptyCount, numericSamples } = collectNumericColumnSamples(samples);

      if (!nonEmptyCount || numericSamples.length / nonEmptyCount < TABLE_COLUMN_NUMERIC_THRESHOLD) {
        if (shouldCacheColumnDisplayProfile(samples.length, currentFile?.rowCount)) {
          columnDisplayProfileCacheRef.current.set(cacheKey, rawProfile);
        }
        endProfilePerf({
          nonEmptyCount,
          numericSampleCount: numericSamples.length,
          result: "rawNonNumeric",
          sampleCount: samples.length,
          success: true,
        });
        return rawProfile;
      }

      const autoScaleExponent = chooseColumnScaleExponentFromCells(numericSamples);
      const hasManualScaleExponent =
        typeof overrideScaleExponent === "number" && Number.isInteger(overrideScaleExponent);
      const scaleExponent = hasManualScaleExponent
        ? clampColumnDisplayScaleExponent(overrideScaleExponent)
        : autoScaleExponent;
      const profile: ColumnDisplayProfile = {
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
      endProfilePerf({
        nonEmptyCount,
        numericSampleCount: numericSamples.length,
        result: "columnScale",
        sampleCount: samples.length,
        scaleExponent,
        success: true,
      });
      return profile;
    },
    [
      activeSheetKey,
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

      const sheetKey = activeSheetKey ?? "";
      const overrideKey = createColumnDisplayScaleOverrideKey(sheetKey, normalizedColIndex);
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
      activeSheetKey,
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
      const sheetKey = activeSheetKey ?? "";
      const overrideKey = createColumnDisplayScaleOverrideKey(sheetKey, normalizedColIndex);
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
      activeSheetKey,
      columnDisplayScaleOverrideVersionRef,
      columnDisplayScaleOverridesRef,
      notifyTableDisplayProfileChanged,
      previewFileRef,
    ],
  );

  const requestTableRowsRange = memoCallback(
    (sheetKey: string, startRow: number, endRow: number): Promise<unknown[][]> => {
      if (!sheetKey) return Promise.resolve([]);

      const start = Math.max(0, Math.floor(Number(startRow) || 0));
      const end = Math.max(start, Math.floor(Number(endRow) || start));
      return Promise.resolve(sanitizeTableRowBatch(
        readTableModelContentRows(sourcesByKeyRef.current.get(sheetKey)?.content, start, end) as unknown[][],
      ));
    },
    [
      sourcesByKeyRef,
    ],
  );

  const ensureTableCells = memoCallback(
    async (cells: TableCellReadRequest[]) => {
      const sheetKey = activeSheetKeyRef.current;
      if (!sheetKey || !Array.isArray(cells) || !cells.length) return;
      const currentPreviewFile = previewFileRef.current;
      if (!currentPreviewFile?.rowCount || !Number.isFinite(currentPreviewFile.rowCount)) return;

      const totalRows = Math.max(0, Math.floor(currentPreviewFile.rowCount));
      const columnCount = Math.max(
        0,
        Math.floor(Number(currentPreviewFile.columnCount) || 0),
      );
      if (totalRows <= 0 || columnCount <= 0) return;

      const { rowCache } = getOrCreatePreviewSheetCaches(sheetKey);
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
        const rows = await requestTableRowsRange(sheetKey, rangeStart, rangeEnd);
        for (let index = 0; index < rows.length; index += 1) {
          rowCache.set(rangeStart + index, rows[index]);
          changed = true;
        }
      }

      if (changed && previewCacheSheetKeyRef.current === sheetKey) {
        notifyTableRowsCacheChanged(ranges.map(([startRow, endRow]) => ({
          startRow,
          endRow,
        })));
      }
    },
    [
      activeSheetKeyRef,
      getOrCreatePreviewSheetCaches,
      notifyTableRowsCacheChanged,
      previewCacheSheetKeyRef,
      previewFileRef,
      requestTableRowsRange,
    ],
  );

  const ensureTableRows = memoCallback(
    async (startRow: number, endRow: number) => {
      const sheetKey = activeSheetKeyRef.current;
      const currentPreviewFile = previewFileRef.current;
      if (!currentPreviewFile?.rowCount || !Number.isFinite(currentPreviewFile.rowCount)) return;
      if (!sheetKey) return;

      const { loadedChunks, rowCache } = getOrCreatePreviewSheetCaches(sheetKey);
      const pendingChunks = getOrCreatePendingChunks(sheetKey);
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
      const endEnsurePerf = startPerf("table.viewModel.ensureRows", {
        cachedRows: rowCache.size,
        endRow: end,
        missingRangeCount: missingRanges.length,
        requestedRows: end - start,
        startRow: start,
      }, { silent: true });

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
            rows = await requestTableRowsRange(sheetKey, rangeStart, rangeEnd);
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
            previewCacheSheetKeyRef.current === sheetKey &&
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

      if (!requests.length) {
        endEnsurePerf({
          cacheHit: true,
          dirtyRangeCount: 0,
          success: true,
        });
        return;
      }
      await Promise.all(requests);

      if (dirtyRanges.length > 0) {
        notifyTableRowsCacheChanged(dirtyRanges);
      }
      endEnsurePerf({
        cacheHit: false,
        dirtyRangeCount: dirtyRanges.length,
        requestCount: requests.length,
        success: true,
      });
    },
    [
      activeSheetKeyRef,
      getOrCreatePendingChunks,
      getOrCreatePreviewSheetCaches,
      notifyTableRowsCacheChanged,
      previewCacheSheetKeyRef,
      previewFileRef,
      requestTableRowsRange,
    ],
  );

  const resolveTableRow = memoCallback(
    async (rowIndex: number, cancellationToken: CancellationToken): Promise<unknown[]> => {
      if (cancellationToken.isCancellationRequested) {
        throw new CancellationError();
      }

      const currentPreviewFile = previewFileRef.current;
      const totalRows = Math.max(0, Math.floor(Number(currentPreviewFile?.rowCount) || 0));
      const normalizedIndex = Math.floor(Number(rowIndex));
      if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= totalRows) {
        throw new RangeError(`Table row is out of range: ${rowIndex}`);
      }

      const cachedRow = getTableRow(normalizedIndex);
      if (cachedRow) {
        return cachedRow;
      }

      let request = pendingRowResolveRequestsRef.current.get(normalizedIndex);
      if (!request) {
        request = (async () => {
          await ensureTableRows(normalizedIndex, normalizedIndex + 1);
          const row = getTableRow(normalizedIndex);
          if (!row) {
            throw new Error(`Table row was not resolved: ${normalizedIndex}`);
          }
          return row;
        })().finally(() => {
          if (pendingRowResolveRequestsRef.current.get(normalizedIndex) === request) {
            pendingRowResolveRequestsRef.current.delete(normalizedIndex);
          }
        });
        pendingRowResolveRequestsRef.current.set(normalizedIndex, request);
      }

      const row = await request;
      if (cancellationToken.isCancellationRequested) {
        throw new CancellationError();
      }
      return row;
    },
    [
      ensureTableRows,
      getTableRow,
      pendingRowResolveRequestsRef,
      previewFileRef,
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

  const getRangeDecorationContext = memoCallback(
    (): { readonly columnCount: number; readonly rowCount: number; readonly sheetId: string | null } | null => {
      const currentFile = previewFileRef.current;
      if (!isTableFileForSourceEntry(currentFile, selectedSource)) {
        return null;
      }

      return {
        columnCount: Math.max(0, Math.floor(Number(currentFile.columnCount) || 0)),
        rowCount: Math.max(0, Math.floor(Number(currentFile.rowCount) || 0)),
        sheetId: firstString(currentFile.sheetId, selectedSource?.source.sheetId),
      };
    },
    [previewFileRef, selectedSource],
  );

  const getRangeDecorations = memoCallback(
    (): readonly TableRangeDecoration[] => rangeDecorationsRef.current,
    [rangeDecorationsRef],
  );

  const onDidChangeRangeDecorations = memoCallback(
    (callback: (decorations: readonly TableRangeDecoration[]) => void): (() => void) => {
      rangeDecorationSubscribersRef.current.add(callback);
      return () => rangeDecorationSubscribersRef.current.delete(callback);
    },
    [rangeDecorationSubscribersRef],
  );

  const setRangeDecorations = memoCallback(
    (decorations: readonly TableRangeDecoration[]): void => {
      const normalizedDecorations = normalizeTableRangeDecorations(decorations, getRangeDecorationContext());
      if (areTableRangeDecorationsEqual(rangeDecorationsRef.current, normalizedDecorations)) {
        return;
      }

      rangeDecorationsRef.current = normalizedDecorations;
      for (const callback of Array.from(rangeDecorationSubscribersRef.current)) {
        try {
          callback(normalizedDecorations);
        } catch {
          // A broken consumer must not prevent table decorations from updating.
        }
      }
    },
    [getRangeDecorationContext, rangeDecorationSubscribersRef, rangeDecorationsRef],
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

  const clearRangeDecorations = memoCallback(
    (): void => {
      setRangeDecorations([]);
    },
    [setRangeDecorations],
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
      const selectedFileName = selectedSource?.data.fileName ?? "";
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
        ? `${Math.max(0, Number(currentFile.rowCount) || 0)} \u00d7 ${Math.max(0, Number(currentFile.columnCount) || 0)}`
        : undefined;

      return {
        dimensions,
        file: hasCurrentSource ? currentFile : null,
        fileName,
        loadState: previewStatusRef.current,
        sheets: sourceEntries.map(createTableSheetTabFromSourceEntry),
        selectedSheetId: selectedSource?.source.sheetId ?? activeSheetId ?? null,
        source: selectedSource?.source ?? null,
        displayVersion: settingsVersion,
      };
    },
    [
      previewFileRef,
      previewStatusRef,
      activeSheetId,
      activeSheetKey,
      settingsVersion,
      selectedSource,
      sourceEntries,
    ],
  );

  return {
    adjustColumnDisplayScale,
    cancelPendingRowRequests: cancelPendingTableRowRequests,
    clearHighlight,
    clearRangeDecorations,
    clearSelection,
    clearState: clearPreviewState,
    ensureCells: ensureTableCells,
    ensureRows: ensureTableRows,
    get: getResolvedTableRow,
    getColumnDisplayProfile,
    getHighlight,
    getRangeDecorations,
    getRow: getTableRow,
    getRowsVersion,
    getRevealCell,
    getSelection,
    getState,
    invalidateRequests: invalidatePreviewRequests,
    isResolved: isTableRowResolved,
    onDidChangeHighlight,
    onDidChangeRangeDecorations,
    onDidChangeRevealCell,
    onDidChangeState,
    onDidChangeSelection,
    revealCell,
    resolve: resolveTableRow,
    resetColumnDisplayScale,
    selectAllColumns,
    setRangeDecorations,
    setSelection,
    highlightColumns,
    subscribeRowsVersion,
  };
};

const createColumnDisplayScaleOverrideKey = (
  sheetKey: string,
  colIndex: number,
): string => [
  sheetKey,
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
