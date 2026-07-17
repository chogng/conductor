import assert from "assert";

import { CancellationToken } from "src/cs/base/common/cancellation";
import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { createZipBuffer, type ZipEntry } from "src/cs/base/common/zip";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  FileSystemProviderCapabilities,
  FileType,
  type IFileService,
} from "src/cs/platform/files/common/files";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import { DecorationsService } from "src/cs/workbench/services/decorations/browser/decorationsService";
import type {
  IDecorationData,
  IDecorationsProvider,
} from "src/cs/workbench/services/decorations/common/decorations";
import {
  createTableDecorationData,
  createTableDecorationResource,
  type TableRange,
  type TableRangeDecoration,
  type TableState,
  type TableWidgetViewModel,
} from "src/cs/workbench/services/table/common/table";
import {
  TableService,
} from "src/cs/workbench/services/table/browser/tableService";
import { TableFileService } from "src/cs/workbench/services/tableFile/browser/tableFileService";
import { DataResourceContentService } from "src/cs/workbench/services/dataResource/browser/dataResourceContentService";
import { TableModelResolverService } from "src/cs/workbench/services/table/common/tableModelResolverService";
import { parseTableStructure } from "src/cs/workbench/services/table/common/tableStructureParser";
import type { ITableStructureParserService } from "src/cs/workbench/services/table/common/tableStructureParserService";
import {
  areTableSelectionsEqual,
  createTableViewModelInScope,
  normalizeTableSelection,
  TableStateScope,
  type CreateTableViewModelWithScopeOptions,
} from "src/cs/workbench/services/table/browser/tableViewModel";
import type { TableModelContentSnapshot } from "src/cs/workbench/services/table/common/model";
import type {
  ConductorSettings,
  ISettingsService,
} from "src/cs/workbench/services/settings/common/settings";

let tableTestStore: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite> | undefined;

const directTableStructureParserService: ITableStructureParserService = {
  _serviceBrand: undefined,
  dispose: () => undefined,
  parse: parseTableStructure,
};

suite("workbench/services/table/browser/tableService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  tableTestStore = store;
  const createModel = (options: CreateTableViewModelWithScopeOptions) =>
    createTableViewModelInScope(store.add(new TableStateScope()), options);

  test("opens a table resource directly", async () => {
    const resource = URI.file("/workspace/data/transfer.csv");
    const { service } = createTableServiceFixture();

    service.open({ resource });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (service.getViewInput()?.tableState.loadState.state === "ready") {
        break;
      }
      await waitForTableService();
    }

    assert.equal(service.getViewInput()?.tableState.source?.resource?.toString(), resource.toString());
    assert.equal(service.getViewInput()?.tableState.file?.source?.resource?.toString(), resource.toString());
    assert.deepStrictEqual(service.getPreviewRow(0), ["A", "B"]);
    assert.deepStrictEqual(service.getPreviewRow(1), ["1", "2"]);
  });

  test("keeps active table model while transient model references are disposed", async () => {
    const resource = URI.file("/workspace/data/review-transient.csv");
    const { service, tableModelService } = createTableServiceFixture();

    service.open({ resource });
    await waitForReadyTableService(service);

    const transientReference = await tableModelService.createModelReference(resource);
    transientReference.dispose();
    await waitForTableService();

    assert.equal(tableModelService.get(resource)?.getSnapshot().loadState.state, "ready");
    assert.equal(service.getViewInput()?.tableState.file?.source?.resource?.toString(), resource.toString());
    assert.deepStrictEqual(service.getPreviewRow(0), ["A", "B"]);
    assert.deepStrictEqual(service.getPreviewRow(1), ["1", "2"]);
  });

  test("projects parser diagnostics into table preview health", async () => {
    const resource = URI.file("/workspace/data/malformed.csv");
    const { service } = createTableServiceFixture({
      fileService: createFileServiceStub({
        readFile: async () => textFileContent("A,B\n\"unterminated,1"),
      }),
    });

    service.open({ resource });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (service.getViewInput()?.tableState.loadState.state === "ready") {
        break;
      }
      await waitForTableService();
    }

    assert.equal(service.getViewInput()?.tableState.file?.previewHealth, "parseFailed");
    assert.deepStrictEqual(service.getViewInput()?.tableState.file?.diagnostics?.map(diagnostic => ({
      code: diagnostic.code,
      rowIndex: diagnostic.rowIndex,
      severity: diagnostic.severity,
    })), [{
      code: "table.parser.MissingQuotes",
      rowIndex: 1,
      severity: "error",
    }]);
    assert.match(
      service.getViewInput()?.tableState.file?.previewHealthMessage ?? "",
      /quote/i,
    );
  });

  test("opens Excel table resource sheets through the table model snapshot", async () => {
    const resource = URI.file("/workspace/data/workbook.xlsx");
    const workbookBase64 = await createXlsxBase64([{
      name: "Forward",
      rows: [["Vg", "Id"], ["0", "1"]],
    }, {
      name: "Reverse",
      rows: [["Vd", "Id"], ["1", "2"]],
    }]);
    const { service } = createTableServiceFixture({
      fileService: createFileServiceStub({
        readFile: async () => base64FileContent(workbookBase64),
      }),
    });

    service.open({ resource, sheetId: "2:Reverse" });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (service.getViewInput()?.tableState.loadState.state === "ready") {
        break;
      }
      await waitForTableService();
    }

    const state = service.getViewInput()?.tableState;
    assert.equal(state?.selectedSheetId, "2:Reverse");
    assert.equal(state?.file?.source?.resource?.toString(), resource.toString());
    assert.equal(state?.file?.source?.sheetId, "2:Reverse");
    assert.equal(state?.file?.sheetName, "Reverse");
    assert.deepStrictEqual(state?.sheets.map(sheet => ({
      columnCount: sheet.columnCount,
      label: sheet.label,
      rowCount: sheet.rowCount,
      sheetId: sheet.sheetId,
      source: sheet.source.resource.toString(),
      sourceSheetId: sheet.source.sheetId,
    })), [{
      columnCount: 2,
      label: "Forward",
      rowCount: 2,
      sheetId: "1:Forward",
      source: resource.toString(),
      sourceSheetId: "1:Forward",
    }, {
      columnCount: 2,
      label: "Reverse",
      rowCount: 2,
      sheetId: "2:Reverse",
      source: resource.toString(),
      sourceSheetId: "2:Reverse",
    }]);
    assert.deepStrictEqual(service.getPreviewRow(0), ["Vd", "Id"]);
    assert.deepStrictEqual(service.getPreviewRow(1), ["1", "2"]);
  });

  test("does not fall back to the default sheet when an explicit table sheet target is missing", async () => {
    const resource = URI.file("/workspace/data/missing-sheet.xlsx");
    const workbookBase64 = await createXlsxBase64([{
      name: "Forward",
      rows: [["Vg", "Id"], ["0", "1"]],
    }, {
      name: "Reverse",
      rows: [["Vd", "Id"], ["1", "2"]],
    }]);
    const { service } = createTableServiceFixture({
      fileService: createFileServiceStub({
        readFile: async () => base64FileContent(workbookBase64),
      }),
    });

    service.open({ resource, sheetId: "9:Missing" });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (service.getViewInput()?.tableState.loadState.state === "error") {
        break;
      }
      await waitForTableService();
    }

    const state = service.getViewInput()?.tableState;
    assert.equal(state?.selectedSheetId, "9:Missing");
    assert.equal(state?.source?.resource?.toString(), resource.toString());
    assert.equal(state?.source?.sheetId, "9:Missing");
    assert.equal(state?.file?.source?.sheetId, "9:Missing");
    assert.equal(state?.file?.previewHealth, "parseFailed");
    assert.deepStrictEqual(state?.file?.diagnostics?.map(diagnostic => diagnostic.code), ["table.sheetNotFound"]);
    assert.equal(service.getPreviewRow(0), null);
  });

  test("table selection equality accepts normalized duplicates", () => {
    const first = normalizeTableSelection({
      activeCell: {
        colIndex: 2.9,
        rowIndex: 1.2,
        sheetId: "sheet",
      },
      ranges: [{
        endCol: 3,
        endRow: 2,
        sheetId: "sheet",
        startCol: 1,
        startRow: 5,
      }],
      selectedColumns: [3, 1, 3],
    });
    const second = normalizeTableSelection({
      activeCell: {
        colIndex: 2,
        rowIndex: 1,
        sheetId: "sheet",
      },
      ranges: [{
        endCol: 3,
        endRow: 5,
        sheetId: "sheet",
        startCol: 1,
        startRow: 2,
      }],
      selectedColumns: [1, 3],
    });
    assert.equal(areTableSelectionsEqual(first, second), true);
  });

  test("table selection equality detects active cell changes", () => {
    const first = normalizeTableSelection({
      activeCell: {
        colIndex: 2,
        rowIndex: 1,
        sheetId: "sheet",
      },
      selectedColumns: [1, 3],
    });
    const second = normalizeTableSelection({
      activeCell: {
        colIndex: 4,
        rowIndex: 1,
        sheetId: "sheet",
      },
      selectedColumns: [1, 3],
    });
    assert.equal(areTableSelectionsEqual(first, second), false);
  });

  test("notifies selection subscribers when selection changes", () => {
    const events: string[] = [];
    const resource = URI.file("/workspace/data/selection.csv");
    const model = createModel({
      previewSources: [createResourceSourceInput(resource, {
        rows: [["A"]],
        sheetId: "sheet-a",
      })],
      source: { resource, sheetId: "sheet-a" },
    });

    events.length = 0;
    model.onDidChangeSelection((selection) => {
      events.push(`notify:${selection.activeCell?.rowIndex ?? "none"}`);
    });

    model.setSelection({
      activeCell: {
        colIndex: 0,
        rowIndex: 1,
        sheetId: "sheet-a",
      },
    });

    assert.deepEqual(events, ["notify:1"]);
    assert.deepEqual(model.getSelection().activeCell, {
      colIndex: 0,
      rowIndex: 1,
      sheetId: "sheet-a",
    });
  });

  test("selects all columns through table model command state", () => {
    const resource = URI.file("/workspace/data/all-columns.csv");
    const model = createModel({
      previewSources: [createResourceSourceInput(resource, {
        rows: [["A", "B", "C"], ["1", "2", "3"]],
      })],
      source: { resource },
    });

    model.setSelection({
      activeCell: {
        colIndex: 1,
        rowIndex: 1,
        sheetId: null,
      },
      ranges: [{
        startRow: 0,
        endRow: 1,
        startCol: 0,
        endCol: 1,
        sheetId: null,
      }],
    });
    assert.equal(model.selectAllColumns(), true);
    assert.deepEqual(model.getSelection(), {
      activeCell: null,
      ranges: [],
      selectedColumns: [0, 1, 2],
    });
  });

  test("publishes table view input from the current resource source", async () => {
    const resource = URI.file("/workspace/data/current.csv");
    const { service } = createTableServiceFixture();
    let changeCount = 0;
    const disposable = store.add(service.onDidChangeTableViewInput(() => {
      changeCount += 1;
    }));

    service.open({ resource });
    await waitForReadyTableService(service);

    assert.notEqual(service.getViewInput()?.tableViewModel, null);
    assert.equal(service.getViewInput()?.tableState.source?.resource?.toString(), resource.toString());
    assert.equal(changeCount > 0, true);
    disposable.dispose();
    service.dispose();
  });

  test("ignores missing table sources", () => {
    const { service } = createTableServiceFixture();

    service.open(null);

    const state = service.getViewInput()?.tableState;
    assert.equal(state?.source, null);
    assert.equal(state?.file, null);
    service.dispose();
  });

  test("keeps table view input stable for equivalent open sources", () => {
    const resource = URI.file("/workspace/data/stable.csv");
    const { service } = createTableServiceFixture();
    let changeCount = 0;
    const disposable = store.add(service.onDidChangeTableViewInput(() => {
      changeCount += 1;
    }));

    service.open({ resource });
    const firstOpenChangeCount = changeCount;
    const model = getRequiredTableViewModel(service);
    service.open({ resource });
    const sameModel = getRequiredTableViewModel(service);

    assert.equal(sameModel, model);
    assert.equal(changeCount, firstOpenChangeCount);
    disposable.dispose();
    service.dispose();
  });

  test("increments display version when numeric display mode changes", () => {
    const numericDisplayModeEmitter = new Emitter<"raw" | "smart">();
    store.add(numericDisplayModeEmitter);
    const settingsService = createSettingsServiceStub({
      onDidChangeNumericDisplayMode: numericDisplayModeEmitter.event,
    });
    const resource = URI.file("/workspace/data/display-version.csv");
    const { service } = createTableServiceFixture({
      settingsService,
    });
    let changeCount = 0;
    const disposable = store.add(service.onDidChangeTableViewInput(() => {
      changeCount += 1;
    }));

    service.open({ resource });
    const initialChangeCount = changeCount;
    assert.equal(service.getViewInput()?.tableState.displayVersion, 0);

    numericDisplayModeEmitter.fire("smart");
    assert.equal(service.getViewInput()?.tableState.displayVersion, 1);
    assert.equal(changeCount, initialChangeCount + 1);

    numericDisplayModeEmitter.fire("smart");
    assert.equal(service.getViewInput()?.tableState.displayVersion, 1);
    assert.equal(changeCount, initialChangeCount + 1);

    numericDisplayModeEmitter.fire("raw");
    assert.equal(service.getViewInput()?.tableState.displayVersion, 2);
    assert.equal(changeCount, initialChangeCount + 2);

    disposable.dispose();
    service.dispose();
  });

  test("returns TSV text for selected table ranges", async () => {
    const rows = [
      ["A1", "B\t1"],
      ["A2", "B\"2"],
    ];
    const resource = URI.file("/workspace/data/copy.csv");
    const { service } = createTableServiceFixture({
      fileService: createCsvFileService(rows),
    });
    service.open({ resource });
    await waitForReadyTableService(service);
    service.select({
      kind: "range",
      range: {
        endCol: 1,
        endRow: 1,
        startCol: 0,
        startRow: 0,
      },
    });

    const result = await service.getSelectionText();

    assert.equal(result.kind, "ok");
    assert.equal(result.kind === "ok" ? result.text : "", "A1\t\"B\t1\"\nA2\t\"B\"\"2\"");
    service.dispose();
  });

  test("refuses oversized table selection text", async () => {
    const resource = URI.file("/workspace/data/oversized.csv");
    const { service } = createTableServiceFixture({
      fileService: createCsvFileService([
        ["A1", "B1"],
        ["A2", "B2"],
      ]),
    });
    service.open({ resource });
    await waitForReadyTableService(service);
    service.select({
      columns: [0, 1],
      kind: "columns",
    });

    const result = await service.getSelectionText(3);

    assert.equal(result.kind, "tooLarge");
    assert.equal(result.kind === "tooLarge" ? result.cellCount : 0, 4);
    service.dispose();
  });

  test("reads active table cell values through the service owner API", async () => {
    const resource = URI.file("/workspace/data/cells.csv");
    const { service } = createTableServiceFixture({
      fileService: createCsvFileService([
        ["Header", "Alpha"],
        ["beta", "Gamma"],
        ["needle", "AlphaBeta"],
      ]),
    });

    service.open({ resource });
    await waitForReadyTableService(service);

    assert.deepEqual(await service.getCellValue({
      colIndex: 1,
      rowIndex: 1,
    }), {
      cell: {
        colIndex: 1,
        rowIndex: 1,
        sheetId: null,
      },
      kind: "ok",
      value: "Gamma",
    });
    service.dispose();
  });

  test("reads only the active workbook sheet", async () => {
    const resource = URI.file("/workspace/data/cells-workbook.xlsx");
    const workbookBase64 = await createXlsxBase64([{
      name: "Forward",
      rows: [["Name", "Value"], ["first", "forward-only"]],
    }, {
      name: "Reverse",
      rows: [["Name", "Value"], ["second", "reverse-only"]],
    }]);
    const { service } = createTableServiceFixture({
      fileService: createFileServiceStub({
        readFile: async () => base64FileContent(workbookBase64),
      }),
    });

    service.open({ resource, sheetId: "2:Reverse" });
    await waitForReadyTableService(service);

    assert.deepEqual(await service.getCellValue({
      colIndex: 1,
      rowIndex: 1,
      sheetId: "2:Reverse",
    }), {
      cell: {
        colIndex: 1,
        rowIndex: 1,
        sheetId: "2:Reverse",
      },
      kind: "ok",
      value: "reverse-only",
    });
    assert.deepEqual(await service.getCellValue({
      colIndex: 1,
      rowIndex: 1,
      sheetId: "1:Forward",
    }), { kind: "empty" });
    service.dispose();
  });

  test("does not carry preview lifecycle when the selected resource has no source data", () => {
    const scope = store.add(new TableStateScope());
    const resourceA = URI.file("/workspace/data/a.csv");
    const resourceB = URI.file("/workspace/data/b.csv");
    createTableViewModelInScope(scope, {
      file: {
        columnCount: 2,
        fileName: "Raw A.csv",
        maxCellLengths: [1, 1],
        rowCount: 2,
        source: { resource: resourceA },
      },
      previewSources: [createResourceSourceInput(resourceA, {
        fileName: "Raw A.csv",
        rows: [["A", "B"], ["1", "2"]],
      })],
      source: { resource: resourceA },
    });

    const model = createTableViewModelInScope(scope, {
      previewSources: [],
      source: { resource: resourceB },
    });

    assert.equal(model.getState().file, null);
    assert.equal(model.getState().loadState.state, "idle");
  });

  test("updates preview lifecycle when the selected resource version changes", () => {
    const resource = URI.file("/workspace/data/versioned.csv");
    const model = createModel({
      file: {
        columnCount: 2,
        fileName: "Raw.csv",
        maxCellLengths: [1, 1],
        rowCount: 2,
        source: { resource },
        sourceVersion: 1,
      },
      previewSources: [createResourceSourceInput(resource, {
        rows: [["A", "B"], ["3", "4"]],
        sourceVersion: 2,
      })],
      source: { resource },
    });

    assert.equal(model.getState().file?.sourceVersion, 2);
    assert.equal(model.getState().loadState.state, "ready");
  });

  test("runs table owner operations through the service active model", async () => {
    const resource = URI.file("/workspace/data/owner.csv");
    const { service } = createTableServiceFixture({
      fileService: createCsvFileService([
        ["A1", "B1"],
        ["A2", "B2"],
      ]),
    });
    assert.equal(service.selectAllColumns(), false);

    service.open({ resource });
    await waitForReadyTableService(service);
    const model = getRequiredTableViewModel(service);

    assert.equal(service.selectAllColumns(), true);
    assert.deepEqual(model.getSelection().selectedColumns, [0, 1]);
    service.dispose();
  });

  test("adjusts column display scale through the service owner API", async () => {
    const resource = URI.file("/workspace/data/display-scale.csv");
    const { service, decorationsService } = createTableServiceFixture({
      fileService: createCsvFileService([
        ["CH1 Current"],
        ["-3.70327E-009"],
        ["-3.49201E-009"],
        ["-3.04700E-009"],
      ]),
      settingsService: createSettingsServiceStub({
        getConductorSettings: () => ({ numericDisplayMode: "smart" }),
      }),
    });
    const provider = tableTestStore?.add(new TestTableDecorationsProvider())
      ?? new TestTableDecorationsProvider();
    tableTestStore?.add(decorationsService.registerDecorationsProvider(provider));
    const decorationResource = createTableDecorationResource({ resource });
    assert.ok(decorationResource);
    provider.setDisplayDataRanges(decorationResource, [{
      startRow: 0,
      endRow: 3,
      startCol: 0,
      endCol: 0,
    }]);

    assert.equal(service.adjustColumnDisplayScale(0, 1), false);
    service.open({ resource });
    await waitForReadyTableService(service);
    const model = getRequiredTableViewModel(service);

    assert.equal(model.getColumnDisplayProfile(0).scaleExponent, -9);
    assert.equal(service.adjustColumnDisplayScale(0, 1), true);
    assert.equal(model.getColumnDisplayProfile(0).scaleExponent, -8);
    assert.equal(model.getColumnDisplayProfile(0).isScaleManual, true);
    assert.equal(service.resetColumnDisplayScale(0), true);
    assert.equal(model.getColumnDisplayProfile(0).scaleExponent, -9);
    assert.equal(model.getColumnDisplayProfile(0).isScaleManual, undefined);
    service.dispose();
  });

  test("owns fixed table column width persistence", () => {
    const storageService = new TestStorageService();
    const source = {
      resource: URI.file("/workspace/data/widths.csv"),
      sheetId: "sheet-a",
    };
    const { service } = createTableServiceFixture({
      storageService,
    });

    assert.deepEqual(service.getColumnWidths(source), []);

    service.storeColumnWidths(source, [
      { colIndex: 2, width: 243.6 },
      { colIndex: 1, width: -12 },
    ]);

    assert.deepEqual(service.getColumnWidths(source), [
      { colIndex: 1, width: 0 },
      { colIndex: 2, width: 244 },
    ]);

    service.storeColumnWidths(source, []);

    assert.deepEqual(service.getColumnWidths(source), []);
    service.dispose();
    storageService.dispose();
  });

  test("uses table auto-fit setting as column sizing mode", async () => {
    const settingsEmitter = new Emitter<ConductorSettings | null>();
    store.add(settingsEmitter);
    let conductorSettings: ConductorSettings = {
      numericDisplayMode: "raw",
      tableAutoFitColumnWidthsEnabled: false,
    };
    const settingsService = createSettingsServiceStub({
      getConductorSettings: () => conductorSettings,
      onDidChangeConductorSettings: settingsEmitter.event,
    });
    const resource = URI.file("/workspace/data/column-sizing.csv");
    const { service } = createTableServiceFixture({
      settingsService,
    });
    let changeCount = 0;
    const disposable = store.add(service.onDidChangeTableViewInput(() => {
      changeCount += 1;
    }));

    service.open({ resource });
    await waitForReadyTableService(service);
    const initialChangeCount = changeCount;

    assert.equal(service.getViewInput()?.columnSizingMode, "fixed");
    conductorSettings = {
      ...conductorSettings,
      tableAutoFitColumnWidthsEnabled: true,
    };
    settingsEmitter.fire(conductorSettings);
    assert.equal(service.getViewInput()?.columnSizingMode, "autoFit");
    assert.equal(changeCount, initialChangeCount + 1);

    settingsEmitter.fire(conductorSettings);
    assert.equal(changeCount, initialChangeCount + 1);

    conductorSettings = {
      ...conductorSettings,
      tableAutoFitColumnWidthsEnabled: false,
    };
    settingsEmitter.fire(conductorSettings);
    assert.equal(service.getViewInput()?.columnSizingMode, "fixed");
    assert.equal(changeCount, initialChangeCount + 2);

    disposable.dispose();
    service.dispose();
  });

  test("selects table targets through the service owner API", async () => {
    const resource = URI.file("/workspace/data/select.csv");
    const { service } = createTableServiceFixture({
      fileService: createCsvFileService([
        ["A1", "B1", "C1"],
        ["A2", "B2", "C2"],
        ["A3", "B3", "C3"],
        ["A4", "B4", "C4"],
      ]),
    });
    const events: unknown[] = [];
    const disposable = store.add(service.onDidChangeSelection(selection => {
      events.push(selection);
    }));

    assert.equal(service.select({
      kind: "cell",
      cell: { colIndex: 0, rowIndex: 0 },
    }), false);

    service.open({ resource });
    await waitForReadyTableService(service);
    const model = getRequiredTableViewModel(service);

    assert.deepEqual(service.getSelection(), normalizeTableSelection(null));
    assert.equal(service.select({
      kind: "cell",
      cell: {
        colIndex: 2,
        rowIndex: 1,
      },
    }), true);
    assert.deepEqual(model.getSelection().activeCell, {
      colIndex: 2,
      rowIndex: 1,
      sheetId: null,
    });

    assert.equal(service.select({
      kind: "columns",
      columns: [2, 0, 2],
    }), true);
    assert.deepEqual(model.getSelection(), {
      activeCell: null,
      ranges: [],
      selectedColumns: [0, 2],
    });

    assert.equal(service.select({
      kind: "cell",
      cell: null,
    }), true);
    assert.deepEqual(model.getSelection().activeCell, null);
    assert.deepEqual(model.getSelection().selectedColumns, [0, 2]);

    const selectionBeforeInvalidTarget = model.getSelection();
    assert.equal(service.select({
      kind: "cell",
      cell: { colIndex: 0, rowIndex: 9 },
    }), false);
    assert.equal(service.select({
      kind: "columns",
      columns: [4],
    }), false);
    assert.deepEqual(model.getSelection(), selectionBeforeInvalidTarget);

    assert.equal(service.select(null), true);
    assert.deepEqual(service.getSelection(), normalizeTableSelection(null));
    assert.equal(events.length, 4);

    disposable.dispose();
    service.dispose();
  });

  test("clears table highlight through the service owner API", async () => {
    const resource = URI.file("/workspace/data/highlight.csv");
    const { service } = createTableServiceFixture({
      fileService: createCsvFileService([
        ["A1", "B1", "C1"],
        ["A2", "B2", "C2"],
        ["A3", "B3", "C3"],
        ["A4", "B4", "C4"],
      ]),
    });
    service.open({ resource });
    await waitForReadyTableService(service);
    const model = getRequiredTableViewModel(service);
    const highlightEvents: unknown[] = [];
    model.onDidChangeHighlight((highlight) => {
      highlightEvents.push(highlight);
    });

    service.highlightColumns([1, 2]);
    assert.deepEqual(model.getHighlight().columns, [1, 2]);

    service.clearHighlight();

    assert.deepEqual(model.getHighlight(), {});
    assert.deepEqual(highlightEvents, [
      { columns: [1, 2] },
      {},
    ]);
    service.dispose();
  });

  test("updates active table decorations from the decorations provider", async () => {
    const resource = URI.file("/workspace/data/decorations.csv");
    const { service, decorationsService } = createTableServiceFixture({
      fileService: createCsvFileService([
        ["A1", "B1"],
        ["A2", "B2"],
      ]),
    });
    const provider = tableTestStore?.add(new TestTableDecorationsProvider())
      ?? new TestTableDecorationsProvider();
    tableTestStore?.add(decorationsService.registerDecorationsProvider(provider));
    service.open({ resource });
    await waitForReadyTableService(service);
    const model = getRequiredTableViewModel(service);
    const decorationResource = createTableDecorationResource({ resource });
    assert.ok(decorationResource);

    provider.setDecorations(decorationResource, [{
      kind: "templateX",
      startRow: 0,
      endRow: 1,
      startCol: 1,
      endCol: 1,
    }]);

    await waitForTableService();
    assert.deepEqual(model.getRangeDecorations(), [{
      kind: "templateX",
      sheetId: null,
      startRow: 0,
      endRow: 1,
      startCol: 1,
      endCol: 1,
    }]);

    provider.setDecorations(decorationResource, []);

    await waitForTableService();
    assert.deepEqual(model.getRangeDecorations(), []);
    service.dispose();
  });

  test("reveals table targets through the service owner API", async () => {
    const resource = URI.file("/workspace/data/reveal.csv");
    const { service } = createTableServiceFixture({
      fileService: createCsvFileService([
        ["A1", "B1", "C1"],
        ["A2", "B2", "C2"],
        ["A3", "B3", "C3"],
        ["A4", "B4", "C4"],
      ]),
    });
    assert.equal(service.reveal({
      kind: "cell",
      cell: { colIndex: 0, rowIndex: 0 },
    }), false);

    service.open({ resource });
    await waitForReadyTableService(service);
    const model = getRequiredTableViewModel(service);
    const revealEvents: unknown[] = [];
    model.onDidChangeRevealCell((cell) => {
      revealEvents.push(cell);
    });

    assert.equal(service.reveal({
      kind: "range",
      range: {
        endCol: 2,
        endRow: 3,
        startCol: 1,
        startRow: 2,
      },
    }), true);
    assert.deepEqual(model.getRevealCell(), {
      colIndex: 1,
      rowIndex: 2,
      sheetId: null,
    });

    assert.equal(service.reveal(null), true);
    assert.equal(model.getRevealCell(), null);
    assert.deepEqual(revealEvents, [
      {
        colIndex: 1,
        rowIndex: 2,
        sheetId: null,
      },
      null,
    ]);
    service.dispose();
  });

  test("clears published table view input on dispose", () => {
    const resource = URI.file("/workspace/data/dispose.csv");
    const { service } = createTableServiceFixture({
      fileService: createCsvFileService([
        ["A1", "B1"],
        ["A2", "B2"],
      ]),
    });
    let changeCount = 0;
    store.add(service.onDidChangeTableViewInput(() => {
      changeCount += 1;
    }));

    service.open({ resource });
    service.dispose();

    assert.equal(service.getViewInput(), null);
    assert.equal(changeCount > 0, true);
  });
});

type TableServiceFixture = {
  readonly decorationsService: DecorationsService;
  readonly service: TableService;
  readonly storageService: TestStorageService;
  readonly tableModelService: TableModelResolverService;
};

const createTableServiceFixture = ({
  fileService = createFileServiceStub(),
  settingsService = createSettingsServiceStub(),
  storageService = new TestStorageService(),
}: {
  readonly settingsService?: ISettingsService;
  readonly storageService?: TestStorageService;
  readonly fileService?: IFileService;
} = {}): TableServiceFixture => {
  tableTestStore?.add(storageService);
  const tableFileService = tableTestStore?.add(new TableFileService(
    fileService,
    directTableStructureParserService,
  )) ?? new TableFileService(fileService, directTableStructureParserService);
  const dataResourceContentService = tableTestStore?.add(new DataResourceContentService(
    tableFileService,
  )) ?? new DataResourceContentService(tableFileService);
  const tableModelService = tableTestStore?.add(new TableModelResolverService(
    dataResourceContentService,
    tableFileService,
  )) ?? new TableModelResolverService(dataResourceContentService, tableFileService);
  const decorationsService = tableTestStore?.add(new DecorationsService())
    ?? new DecorationsService();
  const service = new TableService(
    storageService as never,
    settingsService as never,
    tableModelService as never,
    decorationsService as never,
  );
  tableTestStore?.add(service);
  return {
    decorationsService,
    service,
    storageService,
    tableModelService,
  };
};

class TestTableDecorationsProvider extends Disposable implements IDecorationsProvider {
  public readonly label = "test.table";
  private readonly onDidChangeEmitter = this._register(new Emitter<readonly URI[] | undefined>());
  public readonly onDidChange = this.onDidChangeEmitter.event;
  private readonly dataRangesByResource = new Map<string, readonly TableRange[]>();
  private readonly decorationsByResource = new Map<string, readonly TableRangeDecoration[]>();

  public provideDecorations(
    uri: URI,
    _token: CancellationToken,
  ): IDecorationData | undefined {
    return createTableDecorationData({
      tableDisplayDataRanges: this.dataRangesByResource.get(uri.toString()) ?? [],
      tableRangeDecorations: this.decorationsByResource.get(uri.toString()) ?? [],
    });
  }

  public setDecorations(
    resource: URI,
    decorations: readonly TableRangeDecoration[],
  ): void {
    this.decorationsByResource.set(resource.toString(), decorations);
    this.onDidChangeEmitter.fire([resource]);
  }

  public setDisplayDataRanges(
    resource: URI,
    ranges: readonly TableRange[],
  ): void {
    this.dataRangesByResource.set(resource.toString(), ranges);
    this.onDidChangeEmitter.fire([resource]);
  }
}

const createSettingsServiceStub = (
  overrides: Partial<ISettingsService> = {},
): ISettingsService => ({
  _serviceBrand: undefined,
  getConductorSettings: () => ({
    numericDisplayMode: "raw",
    tableAutoFitColumnWidthsEnabled: false,
  }),
  onDidChangeConductorSettings: Event.None,
  onDidChangeNumericDisplayMode: Event.None,
  onDidChangeOriginSettingsViewInput: Event.None,
  onDidChangeSettingsViewInput: Event.None,
  ...overrides,
} as ISettingsService);

const createFileServiceStub = (
  overrides: Partial<IFileService> = {},
): IFileService => ({
  _serviceBrand: undefined,
  deleteFile: async () => undefined,
  exists: async () => true,
  getProvider: () => undefined,
  getProviderCapabilities: () => FileSystemProviderCapabilities.FileRead |
    FileSystemProviderCapabilities.FileReadRange |
    FileSystemProviderCapabilities.FileWatch,
  moveFileToTrash: async () => undefined,
  onDidFilesChange: Event.None,
  readDir: async () => [],
  readFile: async () => textFileContent("A,B\n1,2"),
  realpath: async resource => resource,
  registerProvider: () => ({ dispose: () => undefined }),
  stat: async resource => ({
    ctime: 1,
    mtime: 2,
    path: resource.path,
    size: 7,
    type: FileType.File,
  }),
  watch: () => ({ dispose: () => undefined }),
  writeFile: async () => undefined,
  ...overrides,
} as IFileService);

const createCsvFileService = (rows: readonly (readonly unknown[])[]): IFileService =>
  createFileServiceStub({
    readFile: async () => textFileContent(createCsvContent(rows)),
  });

const textFileContent = (value: string): { readonly value: Uint8Array } => ({
  value: new TextEncoder().encode(value),
});

const base64FileContent = (value: string): { readonly value: Uint8Array } => ({
  value: Uint8Array.from(globalThis.atob(value), character => character.charCodeAt(0)),
});

const createCsvContent = (rows: readonly (readonly unknown[])[]): string =>
  rows.map(row => row.map(formatCsvCell).join(",")).join("\n");

const formatCsvCell = (value: unknown): string => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, "\"\"")}"`
    : text;
};

const createXlsxBase64 = async (
  sheets: readonly { readonly name: string; readonly rows: readonly (readonly string[])[] }[],
): Promise<string> => {
  const entries: ZipEntry[] = [];
  entries.push({
    path: "xl/workbook.xml",
    contents: [
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "<sheets>",
    ...sheets.map((sheet, index) =>
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    ),
    "</sheets>",
    "</workbook>",
  ].join(""),
  });
  entries.push({
    path: "xl/_rels/workbook.xml.rels",
    contents: [
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...sheets.map((_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    ),
    "</Relationships>",
  ].join(""),
  });
  for (let index = 0; index < sheets.length; index += 1) {
    entries.push({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      contents: createXlsxSheetXml(sheets[index]!.rows),
    });
  }
  return bytesToBase64(createZipBuffer(entries));
};

const createXlsxSheetXml = (
  rows: readonly (readonly string[])[],
): string => [
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  "<sheetData>",
  ...rows.map((row, rowIndex) => [
    `<row r="${rowIndex + 1}">`,
    ...row.map((value, columnIndex) =>
      `<c r="${getCellReference(rowIndex, columnIndex)}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
    ),
    "</row>",
  ].join("")),
  "</sheetData>",
  "</worksheet>",
].join("");

const getCellReference = (rowIndex: number, columnIndex: number): string =>
  `${getColumnLabel(columnIndex)}${rowIndex + 1}`;

const getColumnLabel = (columnIndex: number): string => {
  let value = columnIndex + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
};

const createResourceSourceInput = (
  resource: URI,
  {
    fileName = "Raw.csv",
    rows,
    sheetId,
    sourceVersion = 0,
  }: {
    readonly fileName?: string;
    readonly rows: readonly (readonly unknown[])[];
    readonly sheetId?: string | null;
    readonly sourceVersion?: number;
  },
) => {
  const content = createTableModelContent(rows);
  return {
    data: {
      columnCount: content.columnCount,
      fileName,
      maxCellLengths: content.maxCellLengths,
      resource,
      rowCount: content.rowCount,
      ...(sheetId ? { sheetId } : {}),
      sourceVersion,
      tableModelContent: content,
    },
    source: {
      resource,
      sheetId: sheetId ?? null,
    },
  };
};

const createTableModelContent = (
  rows: readonly (readonly unknown[])[],
): TableModelContentSnapshot => {
  const normalizedRows = rows.map(row => row.map(cell => String(cell ?? "")));
  const columnCount = normalizedRows.reduce(
    (count, row) => Math.max(count, row.length),
    0,
  );
  return {
    columnCount,
    maxCellLengths: Array.from({ length: columnCount }, (_, columnIndex) =>
      normalizedRows.reduce(
        (length, row) => Math.max(length, String(row[columnIndex] ?? "").length),
        0,
      )
    ),
    rowCount: normalizedRows.length,
    rows: normalizedRows,
  };
};

class TestStorageService extends AbstractStorageService {
  private readonly values = new Map<string, string>();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    return this.values.get(this.storageKey(key, scope));
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    this.values.set(this.storageKey(key, scope), value);
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    this.values.delete(this.storageKey(key, scope));
  }

  protected readKeys(scope: StorageScope): string[] {
    const prefix = `${scope}:`;
    const keys: string[] = [];
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key.slice(prefix.length));
      }
    }
    return keys;
  }

  private storageKey(key: string, scope: StorageScope): string {
    return `${scope}:${key}`;
  }
}

const getRequiredTableViewModel = (service: TableService): TableWidgetViewModel => {
  const model = service.getViewInput()?.tableViewModel;
  assert.ok(model);
  return model;
};

const waitForTableService = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

const waitForReadyTableService = async (service: TableService): Promise<void> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (service.getViewInput()?.tableState.loadState.state === "ready") {
      return;
    }
    await waitForTableService();
  }
};
