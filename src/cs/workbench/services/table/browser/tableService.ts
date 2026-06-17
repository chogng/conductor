/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IStorageService, StorageScope, StorageTarget } from "src/cs/platform/storage/common/storage";
import {
  ITableService,
  ITableRowsReaderService,
  TABLE_COPY_MAX_CELLS,
  type TableModel,
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
import { createRawFilesFromRecords } from "src/cs/workbench/services/session/common/sessionModelAdapter";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import {
  ISettingsService,
  normalizeNumericDisplayMode,
} from "src/cs/workbench/services/settings/common/settings";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import {
  TableStateScope,
  areTableFilesEqual,
  areTableLoadStatesEqual,
  createTableModelWithScope,
  createTableModelInScope,
  normalizeColumnIndexes,
  normalizeTableCell,
  normalizeTableSelection,
  type CreateTableModelWithScopeOptions,
} from "src/cs/workbench/services/table/browser/tableModel";

type TableState = ReturnType<TableModel["getState"]>;
type TableCell = NonNullable<ReturnType<TableModel["getRevealCell"]>>;
type TableSelection = ReturnType<TableModel["getSelection"]>;
type TableRange = NonNullable<TableSelection["ranges"]>[number];
type TableFile = NonNullable<TableState["file"]>;

export { createTableModelWithScope } from "src/cs/workbench/services/table/browser/tableModel";

type TableCopyPlan = {
  readonly columnIndexes: readonly number[];
  readonly endRow: number;
  readonly sourceKey: string;
  readonly startRow: number;
};

type TableTargetContext = {
  readonly columnCount: number;
  readonly file: TableFile;
  readonly fileIds: ReadonlySet<string>;
  readonly rowCount: number;
  readonly sheetId: string | null;
};

const TABLE_COLUMN_LAYOUT_STORAGE_KEY_PREFIX = "table.columnLayout.";

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

const resolveTableCopyPlan = (tableModel: TableModel): TableCopyPlan | null => {
  const context = getTableTargetContext(tableModel);
  if (!context || context.rowCount <= 0 || context.columnCount <= 0) {
    return null;
  }

  const sourceKey = context.file.sourceKey || context.file.fileId;
  const selection = tableModel.getSelection();
  const selectedRange = selection.ranges?.[0]
    ? normalizeTargetRange(tableModel, selection.ranges[0])
    : null;
  if (selectedRange) {
    return {
      columnIndexes: createIndexRange(selectedRange.startCol, selectedRange.endCol),
      endRow: selectedRange.endRow,
      sourceKey,
      startRow: selectedRange.startRow,
    };
  }

  const activeCell = selection.activeCell
    ? normalizeTargetCell(tableModel, selection.activeCell)
    : null;
  if (activeCell) {
    return {
      columnIndexes: [activeCell.colIndex],
      endRow: activeCell.rowIndex,
      sourceKey,
      startRow: activeCell.rowIndex,
    };
  }

  const selectedColumns = selection.selectedColumns?.length
    ? normalizeTargetColumns(tableModel, selection.selectedColumns)
    : null;
  if (selectedColumns?.length) {
    return {
      columnIndexes: selectedColumns,
      endRow: context.rowCount - 1,
      sourceKey,
      startRow: 0,
    };
  }

  return null;
};

const createTableSelectionTsv = (
  tableModel: TableModel,
  plan: TableCopyPlan,
): string => {
  const rows: string[] = [];
  for (let rowIndex = plan.startRow; rowIndex <= plan.endRow; rowIndex += 1) {
    const row = tableModel.getRow(rowIndex) ?? [];
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
  private tableModel: TableModel | null = null;
  private tableStateModel: TableModel | null = null;
  private tableStateListener: (() => void) | null = null;
  private viewInput: TableViewInput | null = null;
  private selectionTableModel: TableModel | null = null;
  private tableModelSelectionListener: (() => void) | null = null;
  private numericDisplayMode: NumericDisplayMode;
  private displayVersion = 0;

  public constructor(
    @ITableRowsReaderService private readonly tableRowsReaderService: ITableRowsReaderService,
    @ISessionService private readonly sessionService: ISessionService,
    @IStorageService private readonly storageService: IStorageService,
    @ISettingsService private readonly settingsService: ISettingsService,
  ) {
    super();
    this.numericDisplayMode = normalizeNumericDisplayMode(
      this.settingsService.getConductorSettings()?.numericDisplayMode,
    );
    this._register(this.sessionService.onDidChangeSession(() => this.refreshFromSession()));
    this._register(this.settingsService.onDidChangeNumericDisplayMode(mode => {
      if (this.numericDisplayMode === mode) {
        return;
      }
      this.numericDisplayMode = mode;
      this.displayVersion += 1;
      this.refreshFromSession({ forceViewInput: true });
    }));
    this.refreshFromSession();
  }

  public open(source: TableSource | null): TableModel {
    const nextSource = normalizeTableSource(source);
    if (isSameTableSource(this.currentSource, nextSource) && this.tableModel) {
      return this.tableModel;
    }
    this.currentSource = nextSource;
    return this.refreshFromSession();
  }

  private refreshFromSession(options: { forceViewInput?: boolean } = {}): TableModel {
    const snapshot = this.sessionService.getSnapshot();
    const rawFiles = createRawFilesFromRecords(snapshot.filesById, snapshot.fileOrder);
    const source = resolveAvailableTableSource(rawFiles, this.currentSource);
    if (!isSameTableSource(this.currentSource, source)) {
      this.currentSource = source;
    }

    const tableModel = createTableModelInScope(this.scope, {
      rawFiles,
      source,
      tableRowsReaderService: this.tableRowsReaderService,
      numericDisplayMode: this.numericDisplayMode,
      settingsVersion: this.displayVersion,
    });
    this.bindActiveTableModel(tableModel);
    this.bindTableModelState(tableModel);
    this.updateViewInput({
      tableModel,
      tableState: tableModel.getState(),
    }, options);
    return tableModel;
  }

  public override dispose(): void {
    this.tableStateListener?.();
    this.tableStateListener = null;
    this.tableStateModel = null;
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

  public getColumnWidths(sourceKey: string | null | undefined): readonly TableColumnWidth[] {
    const storageKey = getTableColumnLayoutStorageKey(sourceKey);
    if (!storageKey) {
      return [];
    }

    const stored = this.storageService.getObject<StoredTableColumnLayout>(
      storageKey,
      StorageScope.WORKSPACE,
    );
    return toTableColumnWidths(stored ?? {});
  }

  public async getSelectionText(
    maxCellCount: number = TABLE_COPY_MAX_CELLS,
  ): Promise<TableSelectionTextResult> {
    const tableModel = this.getActiveTableModel();
    const plan = tableModel ? resolveTableCopyPlan(tableModel) : null;
    if (!tableModel || !plan) {
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

    await tableModel.ensureRows(plan.sourceKey, plan.startRow, plan.endRow + 1);
    return {
      columnCount,
      kind: "ok",
      rowCount,
      text: createTableSelectionTsv(tableModel, plan),
    };
  }

  public clearHighlight(): void {
    this.getActiveTableModel()?.clearHighlight();
  }

  public clearSelection(): boolean {
    return this.getActiveTableModel()?.clearSelection() ?? false;
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

  public selectAllColumns(): boolean {
    return this.getActiveTableModel()?.selectAllColumns() ?? false;
  }

  public storeColumnWidths(
    sourceKey: string | null | undefined,
    widths: readonly TableColumnWidth[],
  ): void {
    const storageKey = getTableColumnLayoutStorageKey(sourceKey);
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
    input: TableViewInput,
    options: { forceViewInput?: boolean } = {},
  ): void {
    if (!options.forceViewInput && this.viewInput && isSameTableViewInput(this.viewInput, input)) {
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

  private bindTableModelState(tableModel: TableModel): void {
    if (this.tableStateModel === tableModel) {
      return;
    }

    this.tableStateListener?.();
    this.tableStateModel = tableModel;
    this.tableStateListener = tableModel.onDidChangeState(() => {
      this.updateViewInput({
        tableModel,
        tableState: tableModel.getState(),
      });
    });
  }
}

export const createTableModelForInput = (options: CreateTableModelWithScopeOptions): TableModel => {
  return createTableModelWithScope(options);
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
  current.selectedFileId === next.selectedFileId &&
  current.selectedSheetId === next.selectedSheetId &&
  current.sourceKey === next.sourceKey &&
  current.fileName === next.fileName &&
    current.dimensions === next.dimensions &&
  current.displayVersion === next.displayVersion &&
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

const normalizeTableSource = (source: TableSource | null | undefined): TableSource | null => {
  const fileId = String(source?.fileId ?? "").trim();
  if (!fileId) {
    return null;
  }

  const sheetId = typeof source?.sheetId === "string" && source.sheetId.trim()
    ? source.sheetId.trim()
    : null;
  return {
    fileId,
    sheetId,
  };
};

const resolveAvailableTableSource = (
  rawFiles: readonly SessionFile[],
  source: TableSource | null,
): TableSource | null => {
  if (!source) {
    return null;
  }

  return rawFiles.some(rawFile => isSessionFileForTableSource(rawFile, source))
    ? source
    : null;
};

const isSessionFileForTableSource = (
  rawFile: SessionFile,
  source: TableSource,
): boolean => {
  const fileId = readSessionFileString(rawFile, "fileId");
  if (fileId !== source.fileId) {
    return false;
  }

  if (!source.sheetId) {
    return true;
  }

  return getSessionFileSheetId(rawFile) === source.sheetId;
};

const getTableColumnLayoutStorageKey = (
  sourceKey: string | null | undefined,
): string | null => {
  const normalizedSourceKey = typeof sourceKey === "string" ? sourceKey.trim() : "";
  return normalizedSourceKey
    ? `${TABLE_COLUMN_LAYOUT_STORAGE_KEY_PREFIX}${normalizedSourceKey}`
    : null;
};

const getSessionFileSheetId = (rawFile: SessionFile): string | null =>
  readSessionFileString(rawFile, "sheetId") ??
  readSessionFileString(rawFile, "worksheetId") ??
  readSessionFileString(rawFile, "sheetName") ??
  readSessionFileString(rawFile, "worksheetName");

const readSessionFileString = (
  rawFile: SessionFile,
  key: string,
): string | null => {
  const value = rawFile[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};
