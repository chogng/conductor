/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IStorageService, StorageScope, StorageTarget } from "src/cs/platform/storage/common/storage";
import {
  areTableSourcesEqual,
  ITableService,
  normalizeTableSource,
  TABLE_COPY_MAX_CELLS,
  type TableViewModel,
  type TableRevealMode,
  type TableRevealOptions,
  type TableRevealTarget,
  type TableSelectionTarget,
  type TableSelectionTextResult,
  type TableSource,
  type TableViewInput,
} from "src/cs/workbench/services/table/common/table";
import type { NumericDisplayMode } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import {
  toStoredTableColumnLayout,
  toTableColumnWidths,
  type StoredTableColumnLayout,
  type TableColumnWidth,
} from "src/cs/workbench/services/table/common/tableColumnLayout";
import {
  ISettingsService,
  normalizeNumericDisplayMode,
} from "src/cs/workbench/services/settings/common/settings";
import type {
  TableModelSheetSnapshot,
  TableModelSnapshot,
} from "src/cs/workbench/services/table/common/model";
import {
  TableStateScope,
  areTableFilesEqual,
  areTableLoadStatesEqual,
  createTableViewModelWithScope,
  createTableViewModelInScope,
  normalizeColumnIndexes,
  normalizeTableCell,
  normalizeTableSelection,
  type CreateTableViewModelWithScopeOptions,
  type TableViewModelSourceData,
  type TableViewModelSourceInput,
} from "src/cs/workbench/services/table/browser/tableViewModel";
import { ITableModelService } from "src/cs/workbench/services/table/common/resolverService";

type TableState = ReturnType<TableViewModel["getState"]>;
type TableCell = NonNullable<ReturnType<TableViewModel["getRevealCell"]>>;
type TableSelection = ReturnType<TableViewModel["getSelection"]>;
type TableRange = NonNullable<TableSelection["ranges"]>[number];
type TableFile = NonNullable<TableState["file"]>;
type TableServiceViewInput = {
  readonly tableViewModel: TableViewModel;
  readonly tableState: TableState;
};

export { createTableViewModelWithScope } from "src/cs/workbench/services/table/browser/tableViewModel";

type TableCopyPlan = {
  readonly columnIndexes: readonly number[];
  readonly endRow: number;
  readonly sheetKey: string;
  readonly startRow: number;
};

type TableTargetContext = {
  readonly columnCount: number;
  readonly file: TableFile;
  readonly acceptedTargetKeys: ReadonlySet<string>;
  readonly rowCount: number;
  readonly sheetId: string | null;
};

const TABLE_COLUMN_LAYOUT_STORAGE_KEY_PREFIX = "table.columnLayout.";

const getTableTargetContext = (tableViewModel: TableViewModel): TableTargetContext | null => {
  const state = tableViewModel.getState();
  const file = state.file;
  if (!file) {
    return null;
  }

  const rowCount = Math.max(0, Math.floor(Number(file.rowCount) || 0));
  const columnCount = Math.max(0, Math.floor(Number(file.columnCount) || 0));
  const acceptedTargetKeys = new Set<string>();
  for (const value of [
    file.sheetKey,
    state.sheetKey,
  ]) {
    if (typeof value === "string" && value) {
      acceptedTargetKeys.add(value);
    }
  }

  const sheetId = firstString(file.sheetId, state.selectedSheetId, state.source?.sheetId);

  return {
    columnCount,
    file,
    acceptedTargetKeys,
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

const acceptsTargetSource = (
  context: TableTargetContext,
  fileId: string | null | undefined,
): boolean =>
  !fileId ||
  context.acceptedTargetKeys.size === 0 ||
  context.acceptedTargetKeys.has(fileId);

const acceptsTargetSheet = (
  context: TableTargetContext,
  sheetId: string | null | undefined,
): boolean =>
  !sheetId ||
  !context.sheetId ||
  sheetId === context.sheetId;

const normalizeTargetCell = (
  tableViewModel: TableViewModel,
  cell: TableCell,
): TableCell | null => {
  const context = getTableTargetContext(tableViewModel);
  const normalizedCell = normalizeTableCell(cell);
  if (!context || !normalizedCell) {
    return null;
  }

  if (
    context.rowCount <= 0 ||
    context.columnCount <= 0 ||
    normalizedCell.rowIndex >= context.rowCount ||
    normalizedCell.colIndex >= context.columnCount ||
    !acceptsTargetSource(context, normalizedCell.fileId) ||
    !acceptsTargetSheet(context, normalizedCell.sheetId)
  ) {
    return null;
  }

  return {
    ...normalizedCell,
    sheetId: context.sheetId,
  };
};

const normalizeTargetRange = (
  tableViewModel: TableViewModel,
  range: TableRange,
): TableRange | null => {
  const context = getTableTargetContext(tableViewModel);
  const normalizedRange = normalizeTableSelection({ ranges: [range] }).ranges?.[0];
  if (!context || !normalizedRange) {
    return null;
  }

  if (
    context.rowCount <= 0 ||
    context.columnCount <= 0 ||
    normalizedRange.startRow >= context.rowCount ||
    normalizedRange.startCol >= context.columnCount ||
    !acceptsTargetSource(context, normalizedRange.fileId) ||
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
    sheetId: context.sheetId,
  };
};

const normalizeTargetColumns = (
  tableViewModel: TableViewModel,
  columns: readonly number[],
): number[] | null => {
  const context = getTableTargetContext(tableViewModel);
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
  tableViewModel: TableViewModel,
  target: TableSelectionTarget,
): TableSelection | null => {
  const selection = tableViewModel.getSelection();

  switch (target.kind) {
    case "cell": {
      if (!target.cell) {
        return {
          ...selection,
          activeCell: null,
        };
      }
      const activeCell = normalizeTargetCell(tableViewModel, target.cell);
      return activeCell
        ? {
            activeCell,
            selectedColumns: selection.selectedColumns ?? [],
          }
        : null;
    }
    case "range": {
      const range = normalizeTargetRange(tableViewModel, target.range);
      return range
        ? {
            activeCell: {
              colIndex: range.endCol,
              fileId: range.fileId,
              rowIndex: range.endRow,
              sheetId: range.sheetId,
            },
            ranges: [range],
            selectedColumns: selection.selectedColumns ?? [],
          }
        : null;
    }
    case "columns": {
      const selectedColumns = normalizeTargetColumns(tableViewModel, target.columns);
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
  tableViewModel: TableViewModel,
  target: TableRevealTarget,
): TableCell | null => {
  switch (target.kind) {
    case "cell":
      return normalizeTargetCell(tableViewModel, target.cell);
    case "range": {
      const range = normalizeTargetRange(tableViewModel, target.range);
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

const resolveTableCopyPlan = (tableViewModel: TableViewModel): TableCopyPlan | null => {
  const context = getTableTargetContext(tableViewModel);
  if (!context || context.rowCount <= 0 || context.columnCount <= 0) {
    return null;
  }

  const sheetKey = context.file.sheetKey;
  if (!sheetKey) {
    return null;
  }
  const selection = tableViewModel.getSelection();
  const selectedRange = selection.ranges?.[0]
    ? normalizeTargetRange(tableViewModel, selection.ranges[0])
    : null;
  if (selectedRange) {
    return {
      columnIndexes: createIndexRange(selectedRange.startCol, selectedRange.endCol),
      endRow: selectedRange.endRow,
      sheetKey,
      startRow: selectedRange.startRow,
    };
  }

  const activeCell = selection.activeCell
    ? normalizeTargetCell(tableViewModel, selection.activeCell)
    : null;
  if (activeCell) {
    return {
      columnIndexes: [activeCell.colIndex],
      endRow: activeCell.rowIndex,
      sheetKey,
      startRow: activeCell.rowIndex,
    };
  }

  const selectedColumns = selection.selectedColumns?.length
    ? normalizeTargetColumns(tableViewModel, selection.selectedColumns)
    : null;
  if (selectedColumns?.length) {
    return {
      columnIndexes: selectedColumns,
      endRow: context.rowCount - 1,
      sheetKey,
      startRow: 0,
    };
  }

  return null;
};

const createTableSelectionTsv = (
  tableViewModel: TableViewModel,
  plan: TableCopyPlan,
): string => {
  const rows: string[] = [];
  for (let rowIndex = plan.startRow; rowIndex <= plan.endRow; rowIndex += 1) {
    const row = tableViewModel.getRow(rowIndex) ?? [];
    rows.push(plan.columnIndexes
      .map(colIndex => formatTableCopyCell(row[colIndex]))
      .join("\t"));
  }
  return rows.join("\n");
};

const createIndexRange = (start: number, end: number): number[] => {
  const result: number[] = [];
  for (let value = start; value <= end; value += 1) {
    result.push(value);
  }
  return result;
};

const formatTableCopyCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  return /[\t\r\n"]/.test(text)
    ? `"${text.replace(/"/g, "\"\"")}"`
    : text;
};

const createSourceDataFromModelSnapshot = (
  snapshot: TableModelSnapshot | null,
  source: TableSource,
): TableViewModelSourceData | null => {
  const resource = source.resource;
  if (!snapshot || !resource) {
    return null;
  }

  if (snapshot.loadState.state === "error") {
    return {
      fileName: getResourceFileName(resource),
      rawTableHealth: "decodeFailed",
      rawTableHealthMessage: snapshot.loadState.message,
      relativePath: getResourceFileName(resource),
      resource,
      sourcePath: getResourcePath(resource),
      sourceVersion: snapshot.sourceVersion,
    };
  }

  if (snapshot.loadState.state !== "ready") {
    return null;
  }

  const sheet = getSnapshotSheetForSource(snapshot, source);
  const content = sheet?.content ?? snapshot.content;
  if (!content) {
    return null;
  }

  const fileName = getResourceFileName(resource);
  return {
    columnCount: content.columnCount,
    fileName,
    maxCellLengths: content.maxCellLengths,
    relativePath: fileName,
    resource,
    rowCount: content.rowCount,
    ...(sheet?.sheetId && (source.sheetId || sheet.sheetName) ? { sheetId: sheet.sheetId } : {}),
    ...(sheet?.sheetName ? { sheetName: sheet.sheetName } : {}),
    sourcePath: getResourcePath(resource),
    sourceVersion: snapshot.sourceVersion,
    tableModelContent: content,
  };
};

const getSnapshotSheetForSource = (
  snapshot: TableModelSnapshot,
  source: TableSource,
): TableModelSheetSnapshot | null => {
  const sheetId = typeof source.sheetId === "string" && source.sheetId
    ? source.sheetId
    : null;
  if (sheetId) {
    return snapshot.sheets.find(sheet => sheet.sheetId === sheetId) ?? null;
  }

  return snapshot.sheets.find(sheet => sheet.sheetId === snapshot.defaultSheetId) ??
    snapshot.sheets[0] ??
    null;
};

const getResourceFileName = (resource: TableSource["resource"]): string => {
  const path = String(resource?.path ?? "").replace(/\\/g, "/");
  const index = path.lastIndexOf("/");
  const name = index >= 0 ? path.slice(index + 1) : path;
  return name || "table.csv";
};

const getResourcePath = (resource: TableSource["resource"]): string | null => {
  const fsPath = typeof resource?.fsPath === "string" ? resource.fsPath.trim() : "";
  if (fsPath) {
    return fsPath;
  }

  const path = String(resource?.path ?? "").trim();
  return path || null;
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
  private currentSource: TableSource | null = null;
  private tableViewModel: TableViewModel | null = null;
  private tableStateViewModel: TableViewModel | null = null;
  private tableStateListener: (() => void) | null = null;
  private viewInput: TableViewInput | null = null;
  private selectionTableViewModel: TableViewModel | null = null;
  private tableViewModelSelectionListener: (() => void) | null = null;
  private numericDisplayMode: NumericDisplayMode;
  private displayVersion = 0;

  public constructor(
    @IStorageService private readonly storageService: IStorageService,
    @ISettingsService private readonly settingsService: ISettingsService,
    @ITableModelService private readonly tableModelService: ITableModelService,
  ) {
    super();
    this.numericDisplayMode = normalizeNumericDisplayMode(
      this.settingsService.getConductorSettings()?.numericDisplayMode,
    );
    this._register(this.tableModelService.onDidChangeModel(() => {
      this.refreshActiveSource({ forceViewInput: true });
    }));
    this._register(this.settingsService.onDidChangeNumericDisplayMode(mode => {
      if (this.numericDisplayMode === mode) {
        return;
      }
      this.numericDisplayMode = mode;
      this.displayVersion += 1;
      this.refreshActiveSource({ forceViewInput: true });
    }));
    this.refreshActiveSource();
  }

  public open(source: TableSource | null): void {
    const nextSource = normalizeTableSource(source);
    const supportedSource = this.isSupportedTableSource(nextSource) ? nextSource : null;
    if (areTableSourcesEqual(this.currentSource, supportedSource) && this.tableViewModel) {
      return;
    }
    this.currentSource = supportedSource;
    this.resolveTableModel(supportedSource);
    this.refreshActiveSource();
  }

  private refreshActiveSource(options: { forceViewInput?: boolean } = {}): TableViewModel {
    const previewSources = this.getPreviewSourcesForCurrentSource();
    const source = this.resolveAvailableTableSource(this.currentSource);
    if (!areTableSourcesEqual(this.currentSource, source)) {
      this.currentSource = source;
    }

    const tableViewModel = createTableViewModelInScope(this.scope, {
      previewSources,
      source,
      numericDisplayMode: this.numericDisplayMode,
      settingsVersion: this.displayVersion,
    });
    this.bindActiveTableViewModel(tableViewModel);
    this.bindTableViewModelState(tableViewModel);
    this.updateViewInput({
      tableViewModel,
      tableState: tableViewModel.getState(),
    }, options);
    return tableViewModel;
  }

  private getPreviewSourcesForCurrentSource(): TableViewModelSourceInput[] {
    if (!this.currentSource) {
      return [];
    }

    const sourceData = createSourceDataFromModelSnapshot(
      this.tableModelService.get(this.currentSource.resource)?.getSnapshot() ?? null,
      this.currentSource,
    );
    if (sourceData) {
      return sourceData
        ? [{
            data: sourceData,
            source: this.currentSource,
          }]
        : [];
    }

    return [];
  }

  private resolveTableModel(source: TableSource | null): void {
    const resource = source?.resource;
    if (resource) {
      this.tableModelService.resolve(resource, source);
    }
  }

  private resolveAvailableTableSource(
    source: TableSource | null,
  ): TableSource | null {
    if (!source) {
      return null;
    }

    return source.resource && this.tableModelService.canHandleResource(source.resource)
      ? source
      : null;
  }

  private isSupportedTableSource(source: TableSource | null): boolean {
    return !source || Boolean(source.resource && this.tableModelService.canHandleResource(source.resource));
  }

  public override dispose(): void {
    this.tableStateListener?.();
    this.tableStateListener = null;
    this.tableStateViewModel = null;
    this.tableViewModelSelectionListener?.();
    this.tableViewModelSelectionListener = null;
    this.selectionTableViewModel = null;
    this.tableViewModel = null;

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
    return this.getActiveTableViewModel()?.getSelection() ?? normalizeTableSelection(null);
  }

  public getColumnWidths(sheetKey: string | null | undefined): readonly TableColumnWidth[] {
    const storageKey = getTableColumnLayoutStorageKey(sheetKey);
    if (!storageKey) {
      return [];
    }

    const stored = this.storageService.getObject<StoredTableColumnLayout>(
      storageKey,
      StorageScope.WORKSPACE,
    );
    return toTableColumnWidths(stored ?? {});
  }

  public getPreviewRow(rowIndex: number): unknown[] | null {
    return this.getActiveTableViewModel()?.getRow(rowIndex) ?? null;
  }

  public adjustColumnDisplayScale(colIndex: number, deltaExponent: number): boolean {
    return this.getActiveTableViewModel()?.adjustColumnDisplayScale(colIndex, deltaExponent) ?? false;
  }

  public resetColumnDisplayScale(colIndex: number): boolean {
    return this.getActiveTableViewModel()?.resetColumnDisplayScale(colIndex) ?? false;
  }

  public async getSelectionText(
    maxCellCount: number = TABLE_COPY_MAX_CELLS,
  ): Promise<TableSelectionTextResult> {
    const tableViewModel = this.getActiveTableViewModel();
    const plan = tableViewModel ? resolveTableCopyPlan(tableViewModel) : null;
    if (!tableViewModel || !plan) {
      return { kind: "empty" };
    }

    const rowCount = plan.endRow - plan.startRow + 1;
    const columnCount = plan.columnIndexes.length;
    const cellCount = rowCount * columnCount;
    const safeMaxCellCount = Math.max(1, Math.floor(Number(maxCellCount) || TABLE_COPY_MAX_CELLS));
    if (cellCount > safeMaxCellCount) {
      return {
        cellCount,
        kind: "tooLarge",
        maxCellCount: safeMaxCellCount,
      };
    }

    await tableViewModel.ensureRows(plan.sheetKey, plan.startRow, plan.endRow + 1);
    return {
      columnCount,
      kind: "ok",
      rowCount,
      text: createTableSelectionTsv(tableViewModel, plan),
    };
  }

  public clearHighlight(): void {
    this.getActiveTableViewModel()?.clearHighlight();
  }

  public highlightColumns(columnIndexes: readonly number[]): void {
    this.getActiveTableViewModel()?.highlightColumns(columnIndexes);
  }

  public clearSelection(): boolean {
    return this.getActiveTableViewModel()?.clearSelection() ?? false;
  }

  public select(
    target: TableSelectionTarget | null,
    reveal?: TableRevealMode,
  ): boolean {
    const tableViewModel = this.getActiveTableViewModel();
    if (!tableViewModel) {
      return false;
    }

    if (!target) {
      return tableViewModel.clearSelection();
    }

    const selection = resolveSelectionForTarget(tableViewModel, target);
    if (!selection) {
      return false;
    }

    tableViewModel.setSelection(selection);
    if (reveal && target.kind === "range") {
      this.revealTarget(tableViewModel, target);
    } else if (reveal && target.kind === "cell" && target.cell) {
      this.revealTarget(tableViewModel, {
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
    const tableViewModel = this.getActiveTableViewModel();
    if (!tableViewModel) {
      return false;
    }

    if (!target) {
      tableViewModel.revealCell(null);
      return true;
    }

    return this.revealTarget(tableViewModel, target);
  }

  public selectAllColumns(): boolean {
    return this.getActiveTableViewModel()?.selectAllColumns() ?? false;
  }

  public storeColumnWidths(
    sheetKey: string | null | undefined,
    widths: readonly TableColumnWidth[],
  ): void {
    const storageKey = getTableColumnLayoutStorageKey(sheetKey);
    if (!storageKey) {
      return;
    }

    const stored = toStoredTableColumnLayout(widths);
    if (!Object.keys(stored.widths ?? {}).length) {
      this.storageService.remove(storageKey, StorageScope.WORKSPACE);
      return;
    }

    this.storageService.store(
      storageKey,
      stored,
      StorageScope.WORKSPACE,
      StorageTarget.USER,
    );
  }

  private updateViewInput(
    input: TableServiceViewInput,
    options: { forceViewInput?: boolean } = {},
  ): void {
    if (!options.forceViewInput && this.viewInput && isSameTableViewInput(this.viewInput, input)) {
      return;
    }

    this.viewInput = input;
    this.bindActiveTableViewModel(input.tableViewModel);
    this.onDidChangeTableViewInputEmitter.fire(undefined);
  }

  private getActiveTableViewModel(): TableViewModel | null {
    return this.tableViewModel;
  }

  private revealTarget(
    tableViewModel: TableViewModel,
    target: TableRevealTarget,
  ): boolean {
    const cell = resolveRevealCellForTarget(tableViewModel, target);
    if (!cell) {
      return false;
    }

    tableViewModel.revealCell(cell);
    return true;
  }

  private bindActiveTableViewModel(tableViewModel: TableViewModel): void {
    this.tableViewModel = tableViewModel;
    if (this.selectionTableViewModel === tableViewModel) {
      return;
    }

    this.tableViewModelSelectionListener?.();
    this.selectionTableViewModel = tableViewModel;
    this.tableViewModelSelectionListener = tableViewModel.onDidChangeSelection((selection) => {
      this.onDidChangeSelectionEmitter.fire(selection);
    });
  }

  private bindTableViewModelState(tableViewModel: TableViewModel): void {
    if (this.tableStateViewModel === tableViewModel) {
      return;
    }

    this.tableStateListener?.();
    this.tableStateViewModel = tableViewModel;
    this.tableStateListener = tableViewModel.onDidChangeState(() => {
      this.updateViewInput({
        tableViewModel,
        tableState: tableViewModel.getState(),
      });
    });
  }
}

export const createTableViewModelForInput = (options: CreateTableViewModelWithScopeOptions): TableViewModel => {
  return createTableViewModelWithScope(options);
};

registerSingleton(ITableService, TableService, InstantiationType.Delayed);

const isSameTableViewInput = (
  current: TableViewInput,
  next: TableViewInput,
): boolean =>
  isSameTableState(current.tableState, next.tableState);

const isSameTableState = (
  current: TableState,
  next: TableState,
): boolean =>
  current.selectedSheetId === next.selectedSheetId &&
  current.sheetKey === next.sheetKey &&
  current.fileName === next.fileName &&
  current.dimensions === next.dimensions &&
  current.displayVersion === next.displayVersion &&
  areTableSourcesEqual(current.source, next.source) &&
  areNullableTableFilesEqual(current.file, next.file) &&
  areTableLoadStatesEqual(current.loadState, next.loadState);

const areNullableTableFilesEqual = (
  current: TableFile | null | undefined,
  next: TableFile | null | undefined,
): boolean => {
  if (!current || !next) {
    return current === next;
  }

  return areTableFilesEqual(current, next);
};

const getTableColumnLayoutStorageKey = (
  sheetKey: string | null | undefined,
): string | null => {
  const normalizedSheetKey = typeof sheetKey === "string" ? sheetKey.trim() : "";
  return normalizedSheetKey
    ? `${TABLE_COLUMN_LAYOUT_STORAGE_KEY_PREFIX}${normalizedSheetKey}`
    : null;
};
