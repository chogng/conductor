/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { CancellationToken } from "src/cs/base/common/cancellation";
import { Disposable } from "src/cs/base/common/lifecycle";
import { mark } from "src/cs/base/common/performance";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IStorageService, StorageScope, StorageTarget } from "src/cs/platform/storage/common/storage";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  areTableSourcesEqual,
  createTableDecorationResource,
  getTableDisplayDataRangesFromDecorationData,
  getTableRangeDecorationsFromDecorationData,
  ITableService,
  normalizeTableSource,
  TABLE_COPY_MAX_CELLS,
  toTableSheetKey,
  type TableCellSearchQuery,
  type TableCellSearchResult,
  type TableCellValueResult,
  type TableViewModel,
  type TableRevealMode,
  type TableRevealOptions,
  type TableRevealTarget,
  type TableSelectionTarget,
  type TableSelectionTextResult,
  type TableSheetTab,
  type TableSource,
  type TableViewInput,
} from "src/cs/workbench/services/table/common/table";
import { IDecorationsService } from "src/cs/workbench/services/decorations/common/decorations";
import type { NumericDisplayMode } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import {
  TableColumnLayout,
  toStoredTableColumnLayout,
  toTableColumnLayoutState,
  type StoredTableColumnLayout,
  type TableColumnLayoutState,
  type TableColumnSizingMode,
  type TableColumnWidth,
} from "src/cs/workbench/services/table/common/tableColumnLayout";
import { createTableCellMatcher } from "src/cs/workbench/services/table/common/tableSearch";
import {
  ISettingsService,
  normalizeTableAutoFitColumnWidthsEnabled,
  normalizeNumericDisplayMode,
} from "src/cs/workbench/services/settings/common/settings";
import type {
  TableParseDiagnostic,
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
import {
  ITableModelService,
  type ITableModelReference,
} from "src/cs/workbench/services/table/common/resolverService";

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
  readonly startRow: number;
};

type TableCellSearchPlan = {
  readonly endCol: number;
  readonly endRow: number;
  readonly sheetId: string | null;
  readonly startCol: number;
  readonly startRow: number;
};

type TableDecorationContext = {
  readonly decorationResource: NonNullable<ReturnType<typeof createTableDecorationResource>>;
};

type TableTargetContext = {
  readonly columnCount: number;
  readonly file: TableFile;
  readonly rowCount: number;
  readonly sheetId: string | null;
};

const createTableDecorationContext = (
  state: TableState,
): TableDecorationContext | null => {
  const source = state.source;
  const file = state.file;
  if (!source || !file) {
    return null;
  }

  const rowCount = Math.max(0, Math.floor(Number(file.rowCount) || 0));
  const columnCount = Math.max(0, Math.floor(Number(file.columnCount) || 0));
  if (rowCount <= 0 || columnCount <= 0) {
    return null;
  }

  const decorationResource = createTableDecorationResource(
    source,
    firstString(file.sheetId, state.selectedSheetId, source.sheetId),
  );
  return decorationResource ? { decorationResource } : null;
};

const TABLE_COLUMN_LAYOUT_STORAGE_KEY_PREFIX = "table.columnLayout.";
const TABLE_CELL_SEARCH_CHUNK_SIZE_ROWS = 500;

const getTableTargetContext = (tableViewModel: TableViewModel): TableTargetContext | null => {
  const state = tableViewModel.getState();
  const file = state.file;
  if (!file) {
    return null;
  }

  const rowCount = Math.max(0, Math.floor(Number(file.rowCount) || 0));
  const columnCount = Math.max(0, Math.floor(Number(file.columnCount) || 0));
  const sheetId = firstString(file.sheetId, state.selectedSheetId, state.source?.sheetId);

  return {
    columnCount,
    file,
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

const acceptsTargetSheet = (
  context: TableTargetContext,
  sheetId: string | null | undefined,
): boolean =>
  !sheetId ||
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

  const selection = tableViewModel.getSelection();
  const selectedRange = selection.ranges?.[0]
    ? normalizeTargetRange(tableViewModel, selection.ranges[0])
    : null;
  if (selectedRange) {
    return {
      columnIndexes: createIndexRange(selectedRange.startCol, selectedRange.endCol),
      endRow: selectedRange.endRow,
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
      startRow: 0,
    };
  }

  return null;
};

const resolveTableCellSearchPlan = (
  tableViewModel: TableViewModel,
  query: TableCellSearchQuery,
): TableCellSearchPlan | null => {
  const context = getTableTargetContext(tableViewModel);
  if (!context || context.rowCount <= 0 || context.columnCount <= 0) {
    return null;
  }

  const querySheetId = typeof query.sheetId === "string" && query.sheetId.trim()
    ? query.sheetId.trim()
    : null;
  if (query.range) {
    const range = normalizeTargetRange(tableViewModel, {
      ...query.range,
      sheetId: query.range.sheetId ?? querySheetId,
    });
    if (range && querySheetId && range.sheetId !== querySheetId) {
      return null;
    }
    return range
      ? {
          endCol: range.endCol,
          endRow: range.endRow,
          sheetId: range.sheetId ?? null,
          startCol: range.startCol,
          startRow: range.startRow,
        }
      : null;
  }

  if (!acceptsTargetSheet(context, querySheetId)) {
    return null;
  }

  return {
    endCol: context.columnCount - 1,
    endRow: context.rowCount - 1,
    sheetId: context.sheetId,
    startCol: 0,
    startRow: 0,
  };
};

const toTableCellValue = (value: unknown): string =>
  String(value ?? "");

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

const createSourceInputsFromModelSnapshot = (
  snapshot: TableModelSnapshot | null,
  source: TableSource,
): readonly TableViewModelSourceInput[] => {
  const endProjectionPerf = startPerf("table.service.projectSourceData", {
    loadState: snapshot?.loadState.state ?? "missing",
    resourceScheme: source.resource?.scheme ?? "unknown",
    sourceHasSheet: Boolean(source.sheetId),
  }, { silent: true });
  const result = doCreateSourceInputsFromModelSnapshot(snapshot, source);
  endProjectionPerf({
    ...summarizeTableViewModelSourceInputs(result),
    success: result.length > 0,
  });
  return result;
};

const doCreateSourceInputsFromModelSnapshot = (
  snapshot: TableModelSnapshot | null,
  source: TableSource,
): readonly TableViewModelSourceInput[] => {
  const resource = source.resource;
  if (!snapshot || !resource) {
    return [];
  }

  if (snapshot.loadState.state === "error") {
    const fileName = getResourceFileName(resource);
    return [{
      data: {
        fileName,
        previewHealth: "decodeFailed",
        previewHealthMessage: snapshot.loadState.message,
        relativePath: fileName,
        resource,
        sourcePath: getResourcePath(resource),
        sourceVersion: snapshot.sourceVersion,
      },
      source,
    }];
  }

  if (snapshot.loadState.state !== "ready") {
    return [];
  }

  const requestedSheetId = getSourceSheetId(source);
  if (requestedSheetId && !snapshot.sheets.some(sheet => sheet.sheetId === requestedSheetId)) {
    const fileName = getResourceFileName(resource);
    const diagnostic: TableParseDiagnostic = {
      code: "table.sheetNotFound",
      message: `Sheet "${requestedSheetId}" was not found in this table resource.`,
      severity: "error",
      sheetId: requestedSheetId,
    };
    return [{
      data: {
        columnCount: 0,
        diagnostics: [
          ...snapshot.diagnostics,
          diagnostic,
        ],
        fileName,
        maxCellLengths: [],
        previewHealth: "parseFailed",
        previewHealthMessage: diagnostic.message,
        relativePath: fileName,
        resource,
        rowCount: 0,
        sheetId: requestedSheetId,
        sourcePath: getResourcePath(resource),
        sourceVersion: snapshot.sourceVersion,
      },
      source: {
        resource,
        sheetId: requestedSheetId,
      },
    }];
  }

  return snapshot.sheets
    .map((sheet): TableViewModelSourceInput | null => {
      const data = createSourceDataFromSnapshotSheet(snapshot, source, sheet);
      if (!data) {
        return null;
      }

      return {
        data,
        source: createSheetSource(snapshot, source, sheet),
      };
    })
    .filter((input): input is TableViewModelSourceInput => Boolean(input));
};

const createSourceDataFromSnapshotSheet = (
  snapshot: TableModelSnapshot,
  source: TableSource,
  sheet: TableModelSheetSnapshot,
): TableViewModelSourceData | null => {
  const resource = source.resource;
  const content = sheet.content;
  const fileName = getResourceFileName(resource);
  const diagnostics = getSourceDataDiagnostics(snapshot, sheet);
  const diagnosticHealth = summarizeTableParseDiagnostics(diagnostics);
  const sheetIdentity = getSnapshotSheetIdentity(snapshot, source, sheet);
  if (!content) {
    if (diagnosticHealth) {
      return {
        diagnostics,
        fileName,
        previewHealth: diagnosticHealth.previewHealth,
        previewHealthMessage: diagnosticHealth.previewHealthMessage,
        relativePath: fileName,
        resource,
        ...sheetIdentity,
        sourcePath: getResourcePath(resource),
        sourceVersion: snapshot.sourceVersion,
      };
    }
    return null;
  }

  return {
    columnCount: content.columnCount,
    diagnostics,
    fileName,
    maxCellLengths: content.maxCellLengths,
    relativePath: fileName,
    resource,
    rowCount: content.rowCount,
    ...sheetIdentity,
    ...(diagnosticHealth ? {
      previewHealth: diagnosticHealth.previewHealth,
      previewHealthMessage: diagnosticHealth.previewHealthMessage,
    } : {}),
    sourcePath: getResourcePath(resource),
    sourceVersion: snapshot.sourceVersion,
    tableModelContent: content,
  };
};

const createSheetSource = (
  snapshot: TableModelSnapshot,
  source: TableSource,
  sheet: TableModelSheetSnapshot,
): TableSource => {
  const resource = source.resource;
  return shouldExposeSnapshotSheetIdentity(snapshot, source, sheet)
    ? {
        resource,
        sheetId: sheet.sheetId,
      }
    : { resource };
};

const getSnapshotSheetIdentity = (
  snapshot: TableModelSnapshot,
  source: TableSource,
  sheet: TableModelSheetSnapshot,
): Pick<TableViewModelSourceData, "sheetId" | "sheetName"> =>
  shouldExposeSnapshotSheetIdentity(snapshot, source, sheet)
    ? {
        sheetId: sheet.sheetId,
        ...(sheet.sheetName ? { sheetName: sheet.sheetName } : {}),
      }
    : {};

const shouldExposeSnapshotSheetIdentity = (
  snapshot: TableModelSnapshot,
  source: TableSource,
  sheet: TableModelSheetSnapshot,
): boolean =>
  Boolean(getSourceSheetId(source) || sheet.sheetName || snapshot.sheets.length > 1);

const summarizeTableParseDiagnostics = (
  diagnostics: readonly TableParseDiagnostic[],
): Pick<TableViewModelSourceData, "previewHealth" | "previewHealthMessage"> | null => {
  const relevantDiagnostics = diagnostics.filter(diagnostic =>
    diagnostic.severity === "fatal" ||
    diagnostic.severity === "error" ||
    diagnostic.severity === "warning" ||
    diagnostic.severity === "info"
  );
  if (!relevantDiagnostics.length) {
    return null;
  }

  const blockingDiagnostic = relevantDiagnostics.find(diagnostic =>
    diagnostic.severity === "fatal" ||
    diagnostic.severity === "error"
  );
  const primaryDiagnostic = blockingDiagnostic ?? relevantDiagnostics[0]!;
  return {
    previewHealth: blockingDiagnostic
      ? getBlockingTableHealth(primaryDiagnostic)
      : "suspect",
    previewHealthMessage: primaryDiagnostic.message,
  };
};

const getBlockingTableHealth = (
  diagnostic: TableParseDiagnostic,
): TableViewModelSourceData["previewHealth"] =>
  diagnostic.code.includes("decodeFailed")
    ? "decodeFailed"
    : "parseFailed";

const getSourceDataDiagnostics = (
  snapshot: TableModelSnapshot,
  sheet: TableModelSheetSnapshot | null,
): readonly TableParseDiagnostic[] => [
  ...snapshot.diagnostics,
  ...(sheet?.diagnostics ?? []),
];

const getSourceSheetId = (
  source: TableSource,
): string | null =>
  typeof source.sheetId === "string" && source.sheetId
    ? source.sheetId
    : null;

const summarizeTableViewModelSourceInputs = (
  inputs: readonly TableViewModelSourceInput[],
): Record<string, unknown> => {
  const data = inputs[0]?.data ?? null;
  return {
    ...summarizeTableViewModelSourceData(data),
    sheetCount: inputs.length,
  };
};

const summarizeTableViewModelSourceData = (
  data: TableViewModelSourceData | null,
): Record<string, unknown> => ({
  columnCount: data?.columnCount ?? 0,
  diagnosticsCount: data?.diagnostics?.length ?? 0,
  hasContent: Boolean(data?.tableModelContent),
  previewHealth: data?.previewHealth ?? "ok",
  rowCount: data?.rowCount ?? 0,
  sourceVersion: data?.sourceVersion ?? 0,
});

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
  private tableModelReference: ITableModelReference | null = null;
  private tableModelReferenceRequestId = 0;
  private numericDisplayMode: NumericDisplayMode;
  private tableAutoFitColumnWidthsEnabled: boolean;
  private displayVersion = 0;

  public constructor(
    @IStorageService private readonly storageService: IStorageService,
    @ISettingsService private readonly settingsService: ISettingsService,
    @ITableModelService private readonly tableModelService: ITableModelService,
    @IDecorationsService private readonly decorationsService: IDecorationsService,
  ) {
    super();
    this.numericDisplayMode = normalizeNumericDisplayMode(
      this.settingsService.getConductorSettings()?.numericDisplayMode,
    );
    this.tableAutoFitColumnWidthsEnabled = normalizeTableAutoFitColumnWidthsEnabled(
      this.settingsService.getConductorSettings()?.tableAutoFitColumnWidthsEnabled,
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
    this._register(this.settingsService.onDidChangeConductorSettings(settings => {
      const enabled = normalizeTableAutoFitColumnWidthsEnabled(
        settings?.tableAutoFitColumnWidthsEnabled,
      );
      if (this.tableAutoFitColumnWidthsEnabled === enabled) {
        return;
      }
      this.tableAutoFitColumnWidthsEnabled = enabled;
      this.refreshActiveTableViewInput();
    }));
    this._register(this.decorationsService.onDidChangeDecorations(event => {
      const context = this.createActiveTableDecorationContext();
      if (context && event.affectsResource(context.decorationResource)) {
        this.refreshActiveDecorations();
      }
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

    return [
      ...createSourceInputsFromModelSnapshot(
        this.tableModelService.get(this.currentSource.resource)?.getSnapshot() ?? null,
        this.currentSource,
      ),
    ];
  }

  private resolveTableModel(source: TableSource | null): void {
    const resource = source?.resource;
    const requestId = ++this.tableModelReferenceRequestId;
    mark("code/willResolveTableSource");
    const endResolvePerf = startPerf("table.service.resolveSource", {
      resourceScheme: resource?.scheme ?? "none",
      sourceHasSheet: Boolean(source?.sheetId),
    }, { silent: true });
    if (!resource) {
      this.releaseTableModelReference();
      endResolvePerf({
        reason: "noResource",
        success: false,
      });
      mark("code/didResolveTableSource");
      return;
    }

    void this.tableModelService.createModelReference(resource, source)
      .then(reference => {
        if (
          requestId !== this.tableModelReferenceRequestId ||
          !areTableSourcesEqual(this.currentSource, source)
        ) {
          reference.dispose();
          endResolvePerf({
            stale: true,
            success: false,
          });
          mark("code/didResolveTableSource");
          return;
        }

        const previousReference = this.tableModelReference;
        this.tableModelReference = reference;
        previousReference?.dispose();
        this.refreshActiveSource({ forceViewInput: true });
        const snapshot = reference.object.getSnapshot();
        endResolvePerf({
          columnCount: snapshot.content?.columnCount ?? 0,
          loadState: snapshot.loadState.state,
          rowCount: snapshot.content?.rowCount ?? 0,
          sheetCount: snapshot.sheets.length,
          sourceVersion: snapshot.sourceVersion,
          stale: false,
          success: snapshot.loadState.state === "ready",
          windowCount: snapshot.content?.rowWindows?.length ?? 0,
        });
        mark("code/didResolveTableSource");
      })
      .catch(error => {
        if (
          requestId !== this.tableModelReferenceRequestId ||
          !areTableSourcesEqual(this.currentSource, source)
        ) {
          endResolvePerf({
            stale: true,
            success: false,
          });
          mark("code/didResolveTableSource");
          return;
        }
        this.releaseTableModelReference();
        this.refreshActiveSource({ forceViewInput: true });
        endResolvePerf({
          errorName: error instanceof Error ? error.name : "unknown",
          stale: false,
          success: false,
        });
        mark("code/didResolveTableSource");
      });
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
    this.tableModelReferenceRequestId += 1;
    this.releaseTableModelReference();
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

  private releaseTableModelReference(): void {
    this.tableModelReference?.dispose();
    this.tableModelReference = null;
  }

  public getViewInput(): TableViewInput | null {
    return this.viewInput;
  }

  public getSelection(): TableSelection {
    return this.getActiveTableViewModel()?.getSelection() ?? normalizeTableSelection(null);
  }

  private resolveColumnSizingMode(): TableColumnSizingMode {
    return this.tableAutoFitColumnWidthsEnabled ? "autoFit" : TableColumnLayout.defaultSizingMode;
  }

  public getColumnWidths(source: TableSource | null | undefined): readonly TableColumnWidth[] {
    return this.getColumnLayoutState(source).widths;
  }

  public async getCellValue(cell: TableCell): Promise<TableCellValueResult> {
    const tableViewModel = this.getActiveTableViewModel();
    const normalizedCell = tableViewModel ? normalizeTargetCell(tableViewModel, cell) : null;
    if (!tableViewModel || !normalizedCell) {
      return { kind: "empty" };
    }

    const row = await tableViewModel.resolve(normalizedCell.rowIndex, CancellationToken.None);
    if (!this.isActiveTableViewModel(tableViewModel)) {
      return { kind: "empty" };
    }
    return {
      cell: normalizedCell,
      kind: "ok",
      value: toTableCellValue(row[normalizedCell.colIndex]),
    };
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

    await tableViewModel.ensureRows(plan.startRow, plan.endRow + 1);
    if (!this.isActiveTableViewModel(tableViewModel)) {
      return { kind: "empty" };
    }
    return {
      columnCount,
      kind: "ok",
      rowCount,
      text: createTableSelectionTsv(tableViewModel, plan),
    };
  }

  public async findCell(query: TableCellSearchQuery): Promise<TableCellSearchResult> {
    const matcher = createTableCellMatcher(query);
    if (matcher.kind !== "ok") {
      return matcher;
    }

    const tableViewModel = this.getActiveTableViewModel();
    const plan = tableViewModel ? resolveTableCellSearchPlan(tableViewModel, query) : null;
    if (!tableViewModel || !plan) {
      return { kind: "empty" };
    }

    for (
      let chunkStart = plan.startRow;
      chunkStart <= plan.endRow;
      chunkStart += TABLE_CELL_SEARCH_CHUNK_SIZE_ROWS
    ) {
      const chunkEndExclusive = Math.min(
        plan.endRow + 1,
        chunkStart + TABLE_CELL_SEARCH_CHUNK_SIZE_ROWS,
      );
      await tableViewModel.ensureRows(chunkStart, chunkEndExclusive);
      if (!this.isActiveTableViewModel(tableViewModel)) {
        return { kind: "empty" };
      }

      for (let rowIndex = chunkStart; rowIndex < chunkEndExclusive; rowIndex += 1) {
        const row = tableViewModel.get(rowIndex);
        for (let colIndex = plan.startCol; colIndex <= plan.endCol; colIndex += 1) {
          const value = toTableCellValue(row[colIndex]);
          if (matcher.matches(value)) {
            return {
              kind: "ok",
              match: {
                cell: {
                  colIndex,
                  rowIndex,
                  sheetId: plan.sheetId,
                },
                value,
              },
            };
          }
        }
      }
    }

    return { kind: "notFound" };
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
    source: TableSource | null | undefined,
    widths: readonly TableColumnWidth[],
  ): void {
    this.storeColumnLayoutState(source, {
      widths,
    });
  }

  private getColumnLayoutState(
    source: TableSource | null | undefined,
  ): TableColumnLayoutState {
    const storageKey = getTableColumnLayoutStorageKey(source);
    if (!storageKey) {
      return {
        widths: [],
      };
    }

    const stored = this.storageService.getObject<StoredTableColumnLayout>(
      storageKey,
      StorageScope.WORKSPACE,
    );
    return toTableColumnLayoutState(stored ?? {});
  }

  private storeColumnLayoutState(
    source: TableSource | null | undefined,
    layout: TableColumnLayoutState,
  ): void {
    const storageKey = getTableColumnLayoutStorageKey(source);
    if (!storageKey) {
      return;
    }

    const stored = toStoredTableColumnLayout(layout);
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

  private refreshActiveTableViewInput(): void {
    const tableViewModel = this.tableViewModel;
    if (!tableViewModel) {
      return;
    }

    this.updateViewInput({
      tableViewModel,
      tableState: tableViewModel.getState(),
    }, { forceViewInput: true });
  }

  private updateViewInput(
    input: TableServiceViewInput,
    options: { forceViewInput?: boolean } = {},
  ): void {
    const nextInput = this.toViewInput(input);
    if (!options.forceViewInput && this.viewInput && isSameTableViewInput(this.viewInput, nextInput)) {
      return;
    }

    this.viewInput = nextInput;
    this.bindActiveTableViewModel(input.tableViewModel);
    this.onDidChangeTableViewInputEmitter.fire(undefined);
    this.refreshActiveDecorations();
  }

  private toViewInput(input: TableServiceViewInput): TableViewInput {
    return {
      ...input,
      columnSizingMode: this.resolveColumnSizingMode(),
    };
  }

  private refreshActiveDecorations(): void {
    const tableViewModel = this.tableViewModel;
    const context = this.createActiveTableDecorationContext();
    if (!tableViewModel || !context) {
      tableViewModel?.setRangeDecorations([]);
      tableViewModel?.setDisplayDataRanges([]);
      return;
    }

    const decorationData = this.decorationsService.getDecorationData(context.decorationResource, false);
    tableViewModel.setRangeDecorations(getTableRangeDecorationsFromDecorationData(decorationData));
    tableViewModel.setDisplayDataRanges(getTableDisplayDataRangesFromDecorationData(decorationData));
  }

  private createActiveTableDecorationContext(): TableDecorationContext | null {
    const state = this.tableViewModel?.getState();
    return state ? createTableDecorationContext(state) : null;
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

  private isActiveTableViewModel(tableViewModel: TableViewModel): boolean {
    return this.tableViewModel === tableViewModel;
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
  current.columnSizingMode === next.columnSizingMode &&
  isSameTableState(current.tableState, next.tableState);

const isSameTableState = (
  current: TableState,
  next: TableState,
): boolean =>
  current.selectedSheetId === next.selectedSheetId &&
  current.fileName === next.fileName &&
  current.dimensions === next.dimensions &&
  current.displayVersion === next.displayVersion &&
  areTableSourcesEqual(current.source, next.source) &&
  areTableSheetTabsEqual(current.sheets, next.sheets) &&
  areNullableTableFilesEqual(current.file, next.file) &&
  areTableLoadStatesEqual(current.loadState, next.loadState);

const areTableSheetTabsEqual = (
  current: readonly TableSheetTab[],
  next: readonly TableSheetTab[],
): boolean =>
  current.length === next.length &&
  current.every((sheet, index) => {
    const other = next[index];
    return Boolean(other) &&
      sheet.label === other.label &&
      sheet.rowCount === other.rowCount &&
      sheet.columnCount === other.columnCount &&
      sheet.sheetId === other.sheetId &&
      sheet.sheetName === other.sheetName &&
      areTableSourcesEqual(sheet.source, other.source);
  });

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
  source: TableSource | null | undefined,
): string | null => {
  const normalizedSource = normalizeTableSource(source);
  const normalizedSheetKey = normalizedSource ? toTableSheetKey(normalizedSource).trim() : "";
  return normalizedSheetKey
    ? `${TABLE_COLUMN_LAYOUT_STORAGE_KEY_PREFIX}${normalizedSheetKey}`
    : null;
};
