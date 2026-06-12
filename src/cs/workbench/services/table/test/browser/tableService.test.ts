import assert from "assert";

import type {
  TableBackendPreviewProvider,
  TableFile,
  TableLoadState,
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
    const inputs: unknown[] = [];
    const disposable = service.onDidChangeTableViewInput(nextInput => {
      inputs.push(nextInput);
    });

    service.updateViewInput(input);

    assert.equal(service.getViewInput(), input);
    assert.deepEqual(inputs, [input]);
    disposable.dispose();
    service.dispose();
  });

  test("owns preview lifecycle when the selected source changes", () => {
    const service = new TableService(createTableBackendService() as never);
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
    service.update({
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
    });

    const model = service.update({
      rawFiles,
      source: { fileId: "file-b" },
    });

    assert.equal(model.getState().selectedFileId, "file-b");
    assert.equal(model.getState().file, null);
    assert.equal(model.getState().loadState.state, "loading");
    service.dispose();
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
    const service = new TableService(createTableBackendService({
      canOpenFile: () => false,
    }) as never);
    const rawFiles = [{
      file: {},
      fileId: "file-a",
      fileName: "Raw.csv",
      sourceKey: "file-a",
      sourceVersion: 2,
    }];

    const model = service.update({
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
    });

    assert.equal(model.getState().selectedFileId, "file-a");
    assert.equal(model.getState().file, null);
    assert.equal(model.getState().loadState.state, "loading");
    service.dispose();
  });

  test("executes table commands through service view input", () => {
    const service = new TableService(createTableBackendService() as never);
    const model = service.update({
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

    assert.equal(service.executeCommand(TableCommandId.zoomIn), false);
    service.updateViewInput({
      tableModel: model,
      tableState: model.getState(),
    });

    assert.equal(service.executeCommand(TableCommandId.zoomIn), true);
    assert.equal(model.getState().zoomPercent, 110);
    assert.equal(service.executeCommand(TableCommandId.selectAllColumns), true);
    assert.deepEqual(model.getSelection().selectedColumns, [0, 1]);
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
      type: "previewDispose",
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

    assert.ok(resolveFirstOpen);
    resolveFirstOpen({
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
    const model = service.update({
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
    const input = {
      tableModel: model,
      tableState: model.getState(),
    };
    const inputs: unknown[] = [];
    service.onDidChangeTableViewInput(nextInput => {
      inputs.push(nextInput);
    });

    service.updateViewInput(input);
    service.dispose();

    assert.equal(service.getViewInput(), null);
    assert.equal(service.executeCommand(TableCommandId.zoomIn), false);
    assert.deepEqual(inputs, [input, null]);
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
