import assert from "assert";

import JSZip from "jszip";
import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  FileType,
  type IFileService,
} from "src/cs/platform/files/common/files";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import type {
  TableRowsReaderProvider,
  TableState,
  TableWidgetViewModel,
} from "src/cs/workbench/services/table/common/table";
import {
  TableService,
} from "src/cs/workbench/services/table/browser/tableService";
import { TableFileService } from "src/cs/workbench/services/tablefile/browser/tableFileService";
import { TableModelResolverService } from "src/cs/workbench/services/tablemodeResolver/common/tableModelResolverService";
import {
  areTableSelectionsEqual,
  createTableViewModelInScope,
  normalizeTableSelection,
  TableStateScope,
  type CreateTableViewModelWithScopeOptions,
} from "src/cs/workbench/services/table/browser/tableViewModel";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";

type TableFile = NonNullable<TableState["file"]>;
type TableLoadState = TableState["loadState"];

let tableTestStore: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite> | undefined;

suite("workbench/services/table/browser/tableService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  tableTestStore = store;
  const createModel = (options: CreateTableViewModelWithScopeOptions) =>
    createTableViewModelInScope(store.add(new TableStateScope()), options);

  test("loads imported preview using the raw source key", async () => {
    let openedPayload: unknown = null;
    let previewFile: TableFile | null = null;
    let loadState: TableLoadState = { state: "idle", message: "" };
    const tableRowsReaderService = createTableRowsReaderService({
      openSource: async (payload) => {
        openedPayload = payload;
        return {
          ok: true,
          result: {
            fileId: "source-key-a",
            sourceKey: "source-key-a",
            fileName: "Raw.csv",
            rowCount: 2,
            columnCount: 2,
            maxCellLengths: [1, 1],
            seedStartRow: 0,
            seedRows: [["x", "y"], [1, 2]],
          },
        };
      },
    });

    const model = createModel({
      tableRowsReaderService,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        normalizedCsvPath: "C:/tmp/raw.csv",
        sourceKey: "source-key-a",
      }],
      source: { fileId: "file-a" },
      setFile: (value) => {
        previewFile = typeof value === "function" ? value(previewFile) : value;
      },
      setLoadState: (value) => {
        loadState = typeof value === "function" ? value(loadState) : value;
      },
      workerRef: { current: null },
    });
    let stateChangeCount = 0;
    model.onDidChangeState(() => {
      stateChangeCount += 1;
    });

    assert.equal(model.getState().sourceKey, "source-key-a");

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(openedPayload, {
      fileId: "source-key-a",
      fileName: "Raw.csv",
      path: "C:/tmp/raw.csv",
      seedRows: 5000,
      sheetId: null,
      sheetName: null,
      sourceKey: "source-key-a",
    });
    assert.equal((previewFile as TableFile | null)?.sourceKey, "source-key-a");
    assert.equal(loadState.state, "ready");
    assert.equal(model.getState().file?.sourceKey, "source-key-a");
    assert.equal(model.getState().loadState.state, "ready");
    assert.equal(stateChangeCount > 0, true);
  });

  test("opens table resource without a session record", async () => {
    let openSourceCount = 0;
    const resource = URI.file("/workspace/data/transfer.csv");
    const { service } = createTableServiceFixture({
      tableRowsReaderService: createTableRowsReaderService({
        openSource: async () => {
          openSourceCount += 1;
          return { ok: false };
        },
      }),
    });

    service.open({ resource });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (service.getViewInput()?.tableState.loadState.state === "ready") {
        break;
      }
      await waitForTableService();
    }

    assert.equal(openSourceCount, 0);
    assert.equal(service.getViewInput()?.tableState.source?.resource?.toString(), resource.toString());
    assert.equal(service.getViewInput()?.tableState.file?.fileId, undefined);
    assert.equal(service.getViewInput()?.tableState.file?.sourceKey, resource.toString());
    assert.deepStrictEqual(service.getPreviewRow(0), ["A", "B"]);
    assert.deepStrictEqual(service.getPreviewRow(1), ["1", "2"]);
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
        readFile: async () => ({ encoding: "base64", value: workbookBase64 }),
      }),
    });

    service.open({ resource, sheetId: "2:Reverse" });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (service.getViewInput()?.tableState.loadState.state === "ready") {
        break;
      }
      await waitForTableService();
    }

    assert.equal(service.getViewInput()?.tableState.selectedSheetId, "2:Reverse");
    assert.equal(service.getViewInput()?.tableState.file?.sheetName, "Reverse");
    assert.deepStrictEqual(service.getPreviewRow(0), ["Vd", "Id"]);
    assert.deepStrictEqual(service.getPreviewRow(1), ["1", "2"]);
  });

  test("table selection equality accepts normalized duplicates", () => {
    const first = normalizeTableSelection({
      activeCell: {
        colIndex: 2.9,
        fileId: "file",
        rowIndex: 1.2,
        sheetId: "sheet",
      },
      ranges: [{
        endCol: 3,
        endRow: 2,
        fileId: "file",
        sheetId: "sheet",
        startCol: 1,
        startRow: 5,
      }],
      selectedColumns: [3, 1, 3],
    });
    const second = normalizeTableSelection({
      activeCell: {
        colIndex: 2,
        fileId: "file",
        rowIndex: 1,
        sheetId: "sheet",
      },
      ranges: [{
        endCol: 3,
        endRow: 5,
        fileId: "file",
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
        fileId: "file",
        rowIndex: 1,
        sheetId: "sheet",
      },
      selectedColumns: [1, 3],
    });
    const second = normalizeTableSelection({
      activeCell: {
        colIndex: 4,
        fileId: "file",
        rowIndex: 1,
        sheetId: "sheet",
      },
      selectedColumns: [1, 3],
    });
    assert.equal(areTableSelectionsEqual(first, second), false);
  });

  test("notifies selection subscribers when selection changes", () => {
    const events: string[] = [];
    const model = createModel({
      tableRowsReaderService: createTableRowsReaderService({
        canOpenSource: () => false,
      }),
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sheetId: "sheet-a",
      }],
      source: { fileId: "file-a" },
    });

    events.length = 0;
    model.onDidChangeSelection((selection) => {
      events.push(`notify:${selection.activeCell?.rowIndex ?? "none"}`);
    });

    model.setSelection({
      activeCell: {
        colIndex: 0,
        fileId: "file-a",
        rowIndex: 1,
        sheetId: "sheet-a",
      },
    });

    assert.deepEqual(events, ["notify:1"]);
    assert.deepEqual(model.getSelection().activeCell, {
      colIndex: 0,
      fileId: "file-a",
      rowIndex: 1,
      sheetId: "sheet-a",
    });
  });

  test("selects all columns through table model command state", () => {
    const model = createModel({
      tableRowsReaderService: createTableRowsReaderService({
        canOpenSource: () => false,
      }),
      file: {
        columnCount: 3,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1, 1, 1],
        rowCount: 2,
        sourceKey: "file-a",
      },
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
      }],
      source: { fileId: "file-a" },
    });

    assert.equal(model.selectAllColumns(), true);
    assert.deepEqual(model.getSelection().selectedColumns, [0, 1, 2]);
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

  test("ignores non-resource table sources", () => {
    const { service } = createTableServiceFixture();

    service.open({ fileId: "file-a", sourceKey: "source-key-b" });

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

  test("owns preview lifecycle when the selected source changes", () => {
    const scopeRef = { current: null };
    const rawFiles = [
      {
        file: {},
        fileId: "file-a",
        fileName: "Raw A.csv",
      },
      {
        file: {},
        fileId: "file-b",
        fileName: "Raw B.csv",
      },
    ];
    createModel({
      file: {
        columnCount: 2,
        fileId: "file-a",
        fileName: "Raw A.csv",
        maxCellLengths: [1, 1],
        rowCount: 2,
        sourceKey: "file-a",
      },
      rawFiles,
      source: { fileId: "file-a" },
      tableRowsReaderService: createTableRowsReaderService(),
      workerRef: scopeRef,
    });

    const model = createModel({
      rawFiles,
      source: { fileId: "file-b" },
      tableRowsReaderService: createTableRowsReaderService(),
      workerRef: scopeRef,
    });

    assert.equal(model.getState().selectedFileId, "file-b");
    assert.equal(model.getState().file, null);
    assert.equal(model.getState().loadState.state, "loading");
  });

  test("clears preview lifecycle when the selected source version changes", () => {
    const rawFiles = [{
      file: {},
      fileId: "file-a",
      fileName: "Raw.csv",
      sourceKey: "file-a",
      sourceVersion: 2,
    }];

    const model = createModel({
      file: {
        columnCount: 2,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1, 1],
        rowCount: 2,
        sourceKey: "file-a",
        sourceVersion: 1,
      },
      rawFiles,
      source: { fileId: "file-a" },
      tableRowsReaderService: createTableRowsReaderService({
        canOpenSource: () => false,
      }),
    });

    assert.equal(model.getState().selectedFileId, "file-a");
    assert.equal(model.getState().file, null);
    assert.equal(model.getState().loadState.state, "loading");
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
    const { service } = createTableServiceFixture({
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

  test("owns table column width persistence", () => {
    const storageService = new TestStorageService();
    const { service } = createTableServiceFixture({
      storageService,
    });

    assert.deepEqual(service.getColumnWidths("source-key-a"), []);

    service.storeColumnWidths("source-key-a", [
      { colIndex: 2, width: 243.6 },
      { colIndex: 1, width: -12 },
    ]);

    assert.deepEqual(service.getColumnWidths("source-key-a"), [
      { colIndex: 1, width: 0 },
      { colIndex: 2, width: 244 },
    ]);

    service.storeColumnWidths("source-key-a", []);

    assert.deepEqual(service.getColumnWidths("source-key-a"), []);
    service.dispose();
    storageService.dispose();
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
      fileId: null,
      rowIndex: 1,
      sheetId: null,
    });

    assert.equal(service.select({
      kind: "columns",
      columns: [2, 0, 2],
    }), true);
    assert.deepEqual(model.getSelection().selectedColumns, [0, 2]);

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
    assert.equal(events.length, 5);

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
      fileId: null,
      rowIndex: 2,
      sheetId: null,
    });

    assert.equal(service.reveal(null), true);
    assert.equal(model.getRevealCell(), null);
    assert.deepEqual(revealEvents, [
      {
        colIndex: 1,
        fileId: null,
        rowIndex: 2,
        sheetId: null,
      },
      null,
    ]);
    service.dispose();
  });

  test("clears worker preview cache when preview state is cleared", () => {
    const workerMessages: unknown[] = [];
    const model = createModel({
      tableRowsReaderService: createTableRowsReaderService({
        canOpenSource: () => false,
      }),
      workerRef: {
        current: {
          postMessage: (message: unknown) => {
            workerMessages.push(message);
          },
          terminate: () => undefined,
        },
      },
    });

    workerMessages.length = 0;
    model.clearState();

    assert.deepEqual(workerMessages, [{
      type: "tableDispose",
      payload: { clear: true },
    }]);
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

const createTableRowsReaderService = (
  overrides: Partial<TableRowsReaderProvider> = {},
): TableRowsReaderProvider => ({
  canReleaseSource: () => false,
  canReadRows: () => false,
  canOpenSource: () => true,
  canReadConvertedCsv: () => false,
  canReadCells: () => false,
  releaseSource: async () => ({}),
  readRows: async () => ({}),
  openSource: async () => ({}),
  readConvertedCsv: async () => ({ ok: false }),
  readCells: async () => ({}),
  ...overrides,
});

type TableServiceFixture = {
  readonly service: TableService;
  readonly storageService: TestStorageService;
};

const createTableServiceFixture = ({
  fileService = createFileServiceStub(),
  settingsService = createSettingsServiceStub(),
  storageService = new TestStorageService(),
  tableRowsReaderService = createTableRowsReaderService(),
}: {
  readonly settingsService?: ISettingsService;
  readonly storageService?: TestStorageService;
  readonly fileService?: IFileService;
  readonly tableRowsReaderService?: TableRowsReaderProvider;
} = {}): TableServiceFixture => {
  tableTestStore?.add(storageService);
  const tableFileService = tableTestStore?.add(new TableFileService(fileService))
    ?? new TableFileService(fileService);
  const tableModelService = tableTestStore?.add(new TableModelResolverService(
    tableFileService,
  )) ?? new TableModelResolverService(tableFileService);
  const service = new TableService(
    tableRowsReaderService as never,
    storageService as never,
    settingsService as never,
    tableModelService as never,
  );
  tableTestStore?.add(service);
  return {
    service,
    storageService,
  };
};

const createSettingsServiceStub = (
  overrides: Partial<ISettingsService> = {},
): ISettingsService => ({
  _serviceBrand: undefined,
  getConductorSettings: () => ({ numericDisplayMode: "raw" }),
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
  moveFileToTrash: async () => undefined,
  onDidFilesChange: Event.None,
  readDir: async () => [],
  readFile: async () => ({ encoding: "utf8", value: "A,B\n1,2" }),
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
    readFile: async () => ({
      encoding: "utf8",
      value: createCsvContent(rows),
    }),
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
  const zip = new JSZip();
  zip.file("xl/workbook.xml", [
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "<sheets>",
    ...sheets.map((sheet, index) =>
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    ),
    "</sheets>",
    "</workbook>",
  ].join(""));
  zip.file("xl/_rels/workbook.xml.rels", [
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...sheets.map((_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    ),
    "</Relationships>",
  ].join(""));
  for (let index = 0; index < sheets.length; index += 1) {
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, createXlsxSheetXml(sheets[index]!.rows));
  }
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return arrayBufferToBase64(buffer);
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

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
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

const createRawFile = (
  overrides: Partial<SessionFile> = {},
): SessionFile => ({
  file: {},
  fileId: "file-a",
  fileName: "Raw.csv",
  sourceKey: "source-key-a",
  ...overrides,
});

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
