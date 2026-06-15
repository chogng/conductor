import assert from "assert";

import type {
  TableBackendPreviewProvider,
  TableFile,
  TableLoadState,
  TableModel,
  TableSelection,
} from "src/cs/workbench/services/table/common/table";
import { TableCommandId } from "src/cs/workbench/services/table/common/table";
import {
  createTableModelWithScope,
  TableService,
} from "src/cs/workbench/services/table/browser/tableService";
import {
  areTableSelectionsEqual,
  normalizeTableSelection,
} from "src/cs/workbench/services/table/common/selection";
import {
  AbstractStorageService,
  StorageScope,
} from "src/cs/platform/storage/common/storage";

suite("workbench/services/table/browser/tableService", () => {
  test("loads imported preview using the raw source key", async () => {
    let openedPayload: unknown = null;
    let previewFile: TableFile | null = null;
    let loadState: TableLoadState = { state: "idle", message: "" };
    const tableBackendService = createTableBackendService({
      openFile: async (payload) => {
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

    const model = createTableModelWithScope({
      tableBackendService,
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
    const model = createTableModelWithScope({
      tableBackendService: createTableBackendService({
        canOpenFile: () => false,
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

  test("owns table zoom command state", () => {
    const model = createTableModelWithScope({
      tableBackendService: createTableBackendService({
        canOpenFile: () => false,
      }),
    });
    let stateChangeCount = 0;
    model.onDidChangeState(() => {
      stateChangeCount += 1;
    });

    assert.equal(model.getState().zoomPercent, 100);
    assert.equal(model.zoomIn(), true);
    assert.equal(model.getState().zoomPercent, 110);
    assert.equal(model.resetZoom(), true);
    assert.equal(model.getState().zoomPercent, 100);
    assert.equal(model.setZoomPercent(999), true);
    assert.equal(model.getState().zoomPercent, 200);
    assert.equal(model.zoomIn(), false);
    assert.equal(model.getState().zoomPercent, 200);
    assert.equal(stateChangeCount, 3);
  });

  test("selects all columns through table model command state", () => {
    const model = createTableModelWithScope({
      tableBackendService: createTableBackendService({
        canOpenFile: () => false,
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

  test("publishes table view input", () => {
    const service = new TableService(createTableBackendService() as never);
    const model = service.update({
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
      }],
      source: { fileId: "file-a" },
    });
    const input = {
      tableModel: model,
      tableState: model.getState(),
    };
    let changeCount = 0;
    const disposable = service.onDidChangeTableViewInput(() => {
      changeCount += 1;
    });

    service.updateViewInput(input);
    service.updateViewInput({
      tableModel: model,
      tableState: {
        ...model.getState(),
      },
    });

    assert.equal(service.getViewInput(), input);
    assert.equal(changeCount, 1);
    disposable.dispose();
    service.dispose();
  });

  test("persists column widths by table source", () => {
    const storageService = new TestStorageService();
    const service = new TableService(
      createTableBackendService() as never,
      storageService as never,
    );
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

    const firstModel = service.update({
      rawFiles,
      source: { fileId: "file-a" },
    });
    assert.equal(firstModel.getColumnWidth(2), null);
    assert.equal(service.setColumnWidth({ colIndex: 2, width: 243.6 }), true);
    assert.equal(firstModel.getColumnWidth(2), 244);

    const restoredModel = service.update({
      rawFiles,
      source: { fileId: "file-a" },
    });
    assert.equal(restoredModel.getColumnWidth(2), 244);

    const otherModel = service.update({
      rawFiles,
      source: { fileId: "file-b" },
    });
    assert.equal(otherModel.getColumnWidth(2), null);

    service.dispose();
    storageService.dispose();
  });

  test("returns TSV text for selected table ranges", async () => {
    const service = new TableService(createTableBackendService() as never);
    const { ensureRowsCalls, model } = createTextTableModel({
      rows: [
        ["A1", "B\t1"],
        ["A2", "B\"2"],
      ],
      selection: {
        ranges: [{
          endCol: 1,
          endRow: 1,
          fileId: "file-a",
          startCol: 0,
          startRow: 0,
        }],
      },
    });
    service.updateViewInput(createTableViewInput(model));

    const result = await service.getSelectionText();

    assert.equal(result.kind, "ok");
    assert.equal(result.kind === "ok" ? result.text : "", "A1\t\"B\t1\"\nA2\t\"B\"\"2\"");
    assert.deepEqual(ensureRowsCalls, [["source-key-a", 0, 2]]);
    service.dispose();
  });

  test("refuses oversized table selection text", async () => {
    const service = new TableService(createTableBackendService() as never);
    const { model } = createTextTableModel({
      rows: [
        ["A1", "B1"],
        ["A2", "B2"],
      ],
      selection: {
        selectedColumns: [0, 1],
      },
    });
    service.updateViewInput(createTableViewInput(model));

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
    createTableModelWithScope({
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
      tableBackendService: createTableBackendService(),
      workerRef: scopeRef,
    });

    const model = createTableModelWithScope({
      rawFiles,
      source: { fileId: "file-b" },
      tableBackendService: createTableBackendService(),
      workerRef: scopeRef,
    });

    assert.equal(model.getState().selectedFileId, "file-b");
    assert.equal(model.getState().file, null);
    assert.equal(model.getState().loadState.state, "loading");
  });

  test("keeps an active preview request across equivalent caller refreshes", async () => {
    let openFileCount = 0;
    const service = new TableService(createTableBackendService({
      openFile: async () => {
        openFileCount += 1;
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
    }) as never);
    const createRawFiles = () => [{
      file: {},
      fileId: "file-a",
      fileName: "Raw.csv",
      normalizedCsvPath: "C:/tmp/raw.csv",
      sourceKey: "source-key-a",
      sourceVersion: 1,
    }];
    let model = service.update({
      rawFiles: createRawFiles(),
      source: { fileId: "file-a" },
    });
    let refreshCount = 0;
    const disposeListener = model.onDidChangeState(() => {
      refreshCount += 1;
      if (refreshCount > 8) {
        assert.fail("Equivalent table refreshes should not restart preview indefinitely.");
      }

      model = service.update({
        rawFiles: createRawFiles(),
        source: { fileId: "file-a" },
      });
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(openFileCount, 1);
    assert.equal(model.getState().loadState.state, "ready");
    assert.equal(model.getState().file?.sourceKey, "source-key-a");
    disposeListener();
    service.dispose();
  });

  test("clears preview lifecycle when the selected source version changes", () => {
    const rawFiles = [{
      file: {},
      fileId: "file-a",
      fileName: "Raw.csv",
      sourceKey: "file-a",
      sourceVersion: 2,
    }];

    const model = createTableModelWithScope({
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
      tableBackendService: createTableBackendService({
        canOpenFile: () => false,
      }),
    });

    assert.equal(model.getState().selectedFileId, "file-a");
    assert.equal(model.getState().file, null);
    assert.equal(model.getState().loadState.state, "loading");
  });

  test("executes table commands through the service active model", () => {
    const service = new TableService(createTableBackendService() as never);
    assert.equal(service.executeCommand(TableCommandId.zoomIn), false);

    const model = createReadyTableModel({
      file: {
        columnCount: 2,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1, 1],
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
    service.updateViewInput(createTableViewInput(model));

    assert.equal(service.executeCommand(TableCommandId.zoomIn), true);
    assert.equal(model.getState().zoomPercent, 110);
    assert.equal(service.executeCommand(TableCommandId.selectAllColumns), true);
    assert.deepEqual(model.getSelection().selectedColumns, [0, 1]);
    service.dispose();
  });

  test("selects table targets through the service owner API", () => {
    const service = new TableService(createTableBackendService() as never);
    const events: unknown[] = [];
    const disposable = service.onDidChangeSelection(selection => {
      events.push(selection);
    });

    assert.equal(service.select({
      kind: "cell",
      cell: { colIndex: 0, rowIndex: 0 },
    }), false);

    const model = createReadyTableModel({
      file: {
        columnCount: 3,
        fileId: "source-key-a",
        fileName: "Raw.csv",
        maxCellLengths: [1, 1, 1],
        rowCount: 4,
        sheetId: "sheet-a",
        sourceKey: "source-key-a",
      },
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sheetId: "sheet-a",
        sourceKey: "source-key-a",
      }],
      source: { fileId: "file-a", sheetId: "sheet-a" },
    });
    service.updateViewInput(createTableViewInput(model));

    assert.deepEqual(service.getSelection(), normalizeTableSelection(null));
    assert.equal(service.select({
      kind: "cell",
      cell: {
        colIndex: 2,
        fileId: "file-a",
        rowIndex: 1,
        sheetId: "sheet-a",
      },
    }), true);
    assert.deepEqual(model.getSelection().activeCell, {
      colIndex: 2,
      fileId: "source-key-a",
      rowIndex: 1,
      sheetId: "sheet-a",
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
    assert.equal(events.length, 4);

    disposable.dispose();
    service.dispose();
  });

  test("clears table highlight through the service owner API", () => {
    const service = new TableService(createTableBackendService() as never);
    const model = createReadyTableModel({
      file: {
        columnCount: 3,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1, 1, 1],
        rowCount: 4,
        sourceKey: "file-a",
      },
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
      }],
      source: { fileId: "file-a" },
    });
    service.updateViewInput(createTableViewInput(model));

    model.highlightColumns([1, 2]);
    assert.deepEqual(model.getHighlight().columns, [1, 2]);

    service.clearHighlight();

    assert.deepEqual(model.getHighlight(), {});
    service.dispose();
  });

  test("reveals table targets through the service owner API", () => {
    const service = new TableService(createTableBackendService() as never);
    assert.equal(service.reveal({
      kind: "cell",
      cell: { colIndex: 0, rowIndex: 0 },
    }), false);

    const model = createReadyTableModel({
      file: {
        columnCount: 3,
        fileId: "source-key-a",
        fileName: "Raw.csv",
        maxCellLengths: [1, 1, 1],
        rowCount: 4,
        sheetId: "sheet-a",
        sourceKey: "source-key-a",
      },
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sheetId: "sheet-a",
        sourceKey: "source-key-a",
      }],
      source: { fileId: "file-a", sheetId: "sheet-a" },
    });
    service.updateViewInput(createTableViewInput(model));

    assert.equal(service.reveal({
      kind: "range",
      range: {
        endCol: 2,
        endRow: 3,
        fileId: "file-a",
        sheetId: "sheet-a",
        startCol: 1,
        startRow: 2,
      },
    }), true);
    assert.deepEqual(model.getRevealCell(), {
      colIndex: 1,
      fileId: "source-key-a",
      rowIndex: 2,
      sheetId: "sheet-a",
    });

    assert.equal(service.reveal(null), true);
    assert.equal(model.getRevealCell(), null);
    service.dispose();
  });

  test("clears worker preview cache when preview state is cleared", () => {
    const workerMessages: unknown[] = [];
    const model = createTableModelWithScope({
      tableBackendService: createTableBackendService({
        canOpenFile: () => false,
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

  test("disposes stale backend preview files after source changes", async () => {
    let resolveFirstOpen:
      | ((value: Awaited<ReturnType<TableBackendPreviewProvider["openFile"]>>) => void)
      | null = null;
    let openFileCount = 0;
    const disposePayloads: unknown[] = [];
    const tableBackendService = createTableBackendService({
      canDisposeFile: () => true,
      disposeFile: async (payload) => {
        disposePayloads.push(payload);
        return {};
      },
      openFile: async () => {
        openFileCount += 1;
        if (openFileCount === 1) {
          return new Promise(resolve => {
            resolveFirstOpen = resolve;
          });
        }

        return new Promise(() => undefined);
      },
    });
    const service = new TableService(tableBackendService as never);
    const rawFiles = [
      {
        file: {},
        fileId: "file-a",
        fileName: "Raw A.csv",
        normalizedCsvPath: "C:/tmp/raw-a.csv",
        sourceKey: "source-key-a",
      },
      {
        file: {},
        fileId: "file-b",
        fileName: "Raw B.csv",
        normalizedCsvPath: "C:/tmp/raw-b.csv",
        sourceKey: "source-key-b",
      },
    ];

    service.update({
      rawFiles,
      source: { fileId: "file-a" },
    });
    service.update({
      rawFiles,
      source: { fileId: "file-b" },
    });

    assert.notEqual(resolveFirstOpen, null);
    const completeFirstOpen = resolveFirstOpen as unknown as ((
      value: Awaited<ReturnType<TableBackendPreviewProvider["openFile"]>>,
    ) => void);
    completeFirstOpen({
      ok: true,
      result: {
        columnCount: 2,
        fileId: "source-key-a",
        fileName: "Raw A.csv",
        maxCellLengths: [1, 1],
        rowCount: 2,
        seedRows: [["x", "y"], [1, 2]],
        seedStartRow: 0,
        sourceKey: "source-key-a",
      },
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(
      disposePayloads.some(payload =>
        (payload as { fileId?: unknown }).fileId === "source-key-a"),
      true,
    );
    service.dispose();
  });

  test("clears published table view input on dispose", () => {
    const service = new TableService(createTableBackendService() as never);
    const model = createReadyTableModel({
      file: {
        columnCount: 2,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1, 1],
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
    const input = createTableViewInput(model);
    let changeCount = 0;
    service.onDidChangeTableViewInput(() => {
      changeCount += 1;
    });

    service.updateViewInput(input);
    service.dispose();

    assert.equal(service.getViewInput(), null);
    assert.equal(service.executeCommand(TableCommandId.zoomIn), false);
    assert.equal(changeCount, 2);
  });
});

const createTableBackendService = (
  overrides: Partial<TableBackendPreviewProvider> = {},
): TableBackendPreviewProvider => ({
  canDisposeFile: () => false,
  canGetPreviewRows: () => false,
  canOpenFile: () => true,
  canReadConvertedCsv: () => false,
  canReadCells: () => false,
  disposeFile: async () => ({}),
  getPreviewRows: async () => ({}),
  openFile: async () => ({}),
  readConvertedCsv: async () => ({ ok: false }),
  readCells: async () => ({}),
  ...overrides,
});

type CreateTableModelOptions = Parameters<typeof createTableModelWithScope>[0];

const createReadyTableModel = ({
  tableBackendService = createTableBackendService(),
  workerRef = { current: null },
  ...options
}: CreateTableModelOptions) =>
  createTableModelWithScope({
    tableBackendService,
    workerRef,
    ...options,
  });

const createTableViewInput = (
  tableModel: TableModel,
) => ({
  tableModel,
  tableState: tableModel.getState(),
});

const createTextTableModel = ({
  rows,
  selection = {},
}: {
  readonly rows: unknown[][];
  readonly selection?: TableSelection;
}) => {
  const ensureRowsCalls: Array<[string, number, number]> = [];
  const state = {
    dimensions: `${rows.length} × ${Math.max(0, rows[0]?.length ?? 0)}`,
    file: {
      columnCount: Math.max(0, rows[0]?.length ?? 0),
      fileId: "file-a",
      fileName: "Raw.csv",
      maxCellLengths: [],
      rowCount: rows.length,
      sourceKey: "source-key-a",
    },
    fileName: "Raw.csv",
    loadState: { state: "ready" as const, message: "" },
    selectedFileId: "file-a",
    source: { fileId: "file-a" },
    sourceKey: "source-key-a",
    zoomPercent: 100,
  };
  const model: TableModel = {
    cancelPendingRowRequests: () => undefined,
    clearHighlight: () => undefined,
    clearSelection: () => false,
    clearState: () => undefined,
    disposeFileCache: () => undefined,
    ensureCells: async () => undefined,
    ensureRows: async (fileId, startRow, endRow) => {
      ensureRowsCalls.push([fileId, startRow, endRow]);
    },
    getColumnWidth: () => null,
    getColumnWidths: () => [],
    getHighlight: () => ({}),
    getRevealCell: () => null,
    getRow: rowIndex => rows[rowIndex] ?? null,
    getRowsVersion: () => 1,
    getSelection: () => selection,
    getState: () => state,
    hasSourceFile: fileId => fileId === "file-a" || fileId === "source-key-a",
    highlightColumns: () => undefined,
    invalidateRequests: () => undefined,
    onDidChangeSelection: () => noopDisposable,
    onDidChangeState: () => noopDisposable,
    resetWorker: () => undefined,
    resetZoom: () => false,
    revealCell: () => undefined,
    selectAllColumns: () => false,
    setColumnWidth: () => false,
    setSelection: () => undefined,
    setZoomPercent: () => false,
    subscribeRowsVersion: () => noopDisposable,
    zoomIn: () => false,
    zoomOut: () => false,
  };

  return { ensureRowsCalls, model };
};

const noopDisposable = (): void => undefined;

class TestStorageService extends AbstractStorageService {
  private readonly values = new Map<string, string>();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    return this.values.get(this.getKey(scope, key));
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    this.values.set(this.getKey(scope, key), value);
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    this.values.delete(this.getKey(scope, key));
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

  private getKey(scope: StorageScope, key: string): string {
    return `${scope}:${key}`;
  }
}
