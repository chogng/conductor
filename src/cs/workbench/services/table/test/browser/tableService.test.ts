import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import type {
  TableRowsReaderProvider,
  TableState,
} from "src/cs/workbench/services/table/common/table";
import {
  createTableModelWithScope,
  TableService,
} from "src/cs/workbench/services/table/browser/tableService";
import {
  areTableSelectionsEqual,
  normalizeTableSelection,
} from "src/cs/workbench/services/table/browser/tableModel";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import { mergeRawFilesIntoRecords } from "src/cs/workbench/services/session/common/sessionModelAdapter";

type TableFile = NonNullable<TableState["file"]>;
type TableLoadState = TableState["loadState"];

suite("workbench/services/table/browser/tableService", () => {
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

    const model = createTableModelWithScope({
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
    const model = createTableModelWithScope({
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

  test("publishes table view input from the current session source", () => {
    const { service, sessionService } = createTableServiceFixture({
      rawFiles: [createRawFile()],
    });
    let changeCount = 0;
    const disposable = service.onDidChangeTableViewInput(() => {
      changeCount += 1;
    });

    const model = service.open({ fileId: "file-a" });
    sessionService.setRawFiles([createRawFile()]);

    assert.equal(service.getViewInput()?.tableModel, model);
    assert.equal(service.getViewInput()?.tableState.selectedFileId, "file-a");
    assert.equal(changeCount, 2);
    disposable.dispose();
    service.dispose();
  });

  test("keeps table view input stable for equivalent open sources", () => {
    const { service } = createTableServiceFixture({
      rawFiles: [createRawFile()],
    });
    let changeCount = 0;
    const disposable = service.onDidChangeTableViewInput(() => {
      changeCount += 1;
    });

    const model = service.open({ fileId: "file-a" });
    const firstOpenChangeCount = changeCount;
    const sameModel = service.open({ fileId: "file-a" });

    assert.equal(sameModel, model);
    assert.equal(changeCount, firstOpenChangeCount);
    disposable.dispose();
    service.dispose();
  });

  test("returns TSV text for selected table ranges", async () => {
    const rows = [
      ["A1", "B\t1"],
      ["A2", "B\"2"],
    ];
    const { service } = createTableServiceFixture({
      rawFiles: [createRawFile({ normalizedCsvPath: "C:/tmp/raw.csv" })],
      tableRowsReaderService: createRowsTableReader(rows),
    });
    service.open({ fileId: "file-a" });
    await waitForTableService();
    service.select({
      kind: "range",
      range: {
        endCol: 1,
        endRow: 1,
        fileId: "file-a",
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
    const { service } = createTableServiceFixture({
      rawFiles: [createRawFile({ normalizedCsvPath: "C:/tmp/raw.csv" })],
      tableRowsReaderService: createRowsTableReader([
        ["A1", "B1"],
        ["A2", "B2"],
      ]),
    });
    service.open({ fileId: "file-a" });
    await waitForTableService();
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
      tableRowsReaderService: createTableRowsReaderService(),
      workerRef: scopeRef,
    });

    const model = createTableModelWithScope({
      rawFiles,
      source: { fileId: "file-b" },
      tableRowsReaderService: createTableRowsReaderService(),
      workerRef: scopeRef,
    });

    assert.equal(model.getState().selectedFileId, "file-b");
    assert.equal(model.getState().file, null);
    assert.equal(model.getState().loadState.state, "loading");
  });

  test("keeps an active preview request across equivalent caller refreshes", async () => {
    let openSourceCount = 0;
    const { service, sessionService } = createTableServiceFixture({
      rawFiles: [createRawFile({
        normalizedCsvPath: "C:/tmp/raw.csv",
        sourceVersion: 1,
      })],
      tableRowsReaderService: createTableRowsReaderService({
        openSource: async () => {
          openSourceCount += 1;
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
      }),
    });
    const createRawFiles = () => [{
      file: {},
      fileId: "file-a",
      fileName: "Raw.csv",
      normalizedCsvPath: "C:/tmp/raw.csv",
      sourceKey: "source-key-a",
      sourceVersion: 1,
    }];
    let model = service.open({ fileId: "file-a" });
    let refreshCount = 0;
    const disposeListener = model.onDidChangeState(() => {
      refreshCount += 1;
      if (refreshCount > 8) {
        assert.fail("Equivalent table refreshes should not restart preview indefinitely.");
      }

      sessionService.setRawFiles(createRawFiles());
      model = service.getViewInput()?.tableModel ?? model;
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(openSourceCount, 1);
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
      tableRowsReaderService: createTableRowsReaderService({
        canOpenSource: () => false,
      }),
    });

    assert.equal(model.getState().selectedFileId, "file-a");
    assert.equal(model.getState().file, null);
    assert.equal(model.getState().loadState.state, "loading");
  });

  test("runs table owner operations through the service active model", async () => {
    const { service } = createTableServiceFixture({
      rawFiles: [createRawFile({ normalizedCsvPath: "C:/tmp/raw.csv" })],
      tableRowsReaderService: createRowsTableReader([
        ["A1", "B1"],
        ["A2", "B2"],
      ]),
    });
    assert.equal(service.selectAllColumns(), false);

    const model = service.open({ fileId: "file-a" });
    await waitForTableService();

    assert.equal(service.selectAllColumns(), true);
    assert.deepEqual(model.getSelection().selectedColumns, [0, 1]);
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
    const { service } = createTableServiceFixture({
      rawFiles: [createRawFile({
        normalizedCsvPath: "C:/tmp/raw.csv",
        sheetId: "sheet-a",
        sourceKey: "source-key-a",
      })],
      tableRowsReaderService: createRowsTableReader([
        ["A1", "B1", "C1"],
        ["A2", "B2", "C2"],
        ["A3", "B3", "C3"],
        ["A4", "B4", "C4"],
      ], {
        fileId: "source-key-a",
        sheetId: "sheet-a",
        sourceKey: "source-key-a",
      }),
    });
    const events: unknown[] = [];
    const disposable = service.onDidChangeSelection(selection => {
      events.push(selection);
    });

    assert.equal(service.select({
      kind: "cell",
      cell: { colIndex: 0, rowIndex: 0 },
    }), false);

    const model = service.open({ fileId: "file-a", sheetId: "sheet-a" });
    await waitForTableService();

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
      fileId: "file-a",
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
    assert.equal(events.length, 5);

    disposable.dispose();
    service.dispose();
  });

  test("clears table highlight through the service owner API", async () => {
    const { service } = createTableServiceFixture({
      rawFiles: [createRawFile({ normalizedCsvPath: "C:/tmp/raw.csv" })],
      tableRowsReaderService: createRowsTableReader([
        ["A1", "B1", "C1"],
        ["A2", "B2", "C2"],
        ["A3", "B3", "C3"],
        ["A4", "B4", "C4"],
      ]),
    });
    const model = service.open({ fileId: "file-a" });
    await waitForTableService();
    const highlightEvents: unknown[] = [];
    model.onDidChangeHighlight((highlight) => {
      highlightEvents.push(highlight);
    });

    model.highlightColumns([1, 2]);
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
    const { service } = createTableServiceFixture({
      rawFiles: [createRawFile({
        normalizedCsvPath: "C:/tmp/raw.csv",
        sheetId: "sheet-a",
        sourceKey: "source-key-a",
      })],
      tableRowsReaderService: createRowsTableReader([
        ["A1", "B1", "C1"],
        ["A2", "B2", "C2"],
        ["A3", "B3", "C3"],
        ["A4", "B4", "C4"],
      ], {
        fileId: "source-key-a",
        sheetId: "sheet-a",
        sourceKey: "source-key-a",
      }),
    });
    assert.equal(service.reveal({
      kind: "cell",
      cell: { colIndex: 0, rowIndex: 0 },
    }), false);

    const model = service.open({ fileId: "file-a", sheetId: "sheet-a" });
    await waitForTableService();
    const revealEvents: unknown[] = [];
    model.onDidChangeRevealCell((cell) => {
      revealEvents.push(cell);
    });

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
      fileId: "file-a",
      rowIndex: 2,
      sheetId: "sheet-a",
    });

    assert.equal(service.reveal(null), true);
    assert.equal(model.getRevealCell(), null);
    assert.deepEqual(revealEvents, [
      {
        colIndex: 1,
        fileId: "file-a",
        rowIndex: 2,
        sheetId: "sheet-a",
      },
      null,
    ]);
    service.dispose();
  });

  test("clears worker preview cache when preview state is cleared", () => {
    const workerMessages: unknown[] = [];
    const model = createTableModelWithScope({
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

  test("releases stale reader sources after source changes", async () => {
    let resolveFirstOpen:
      | ((value: Awaited<ReturnType<TableRowsReaderProvider["openSource"]>>) => void)
      | null = null;
    let openSourceCount = 0;
    const releasePayloads: unknown[] = [];
    const tableRowsReaderService = createTableRowsReaderService({
      canReleaseSource: () => true,
      releaseSource: async (payload) => {
        releasePayloads.push(payload);
        return {};
      },
      openSource: async () => {
        openSourceCount += 1;
        if (openSourceCount === 1) {
          return new Promise(resolve => {
            resolveFirstOpen = resolve;
          });
        }

        return new Promise(() => undefined);
      },
    });
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
    const { service } = createTableServiceFixture({
      rawFiles,
      tableRowsReaderService,
    });

    service.open({ fileId: "file-a" });
    service.open({ fileId: "file-b" });

    assert.notEqual(resolveFirstOpen, null);
    const completeFirstOpen = resolveFirstOpen as unknown as ((
      value: Awaited<ReturnType<TableRowsReaderProvider["openSource"]>>,
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
      releasePayloads.some(payload =>
        (payload as { fileId?: unknown }).fileId === "source-key-a"),
      true,
    );
    service.dispose();
  });

  test("clears published table view input on dispose", () => {
    const { service } = createTableServiceFixture({
      rawFiles: [createRawFile({ normalizedCsvPath: "C:/tmp/raw.csv" })],
      tableRowsReaderService: createRowsTableReader([
        ["A1", "B1"],
        ["A2", "B2"],
      ]),
    });
    let changeCount = 0;
    service.onDidChangeTableViewInput(() => {
      changeCount += 1;
    });

    service.open({ fileId: "file-a" });
    service.dispose();

    assert.equal(service.getViewInput(), null);
    assert.equal(changeCount, 3);
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
  readonly sessionService: TestSessionService;
  readonly storageService: TestStorageService;
};

const createTableServiceFixture = ({
  rawFiles = [],
  storageService = new TestStorageService(),
  tableRowsReaderService = createTableRowsReaderService(),
}: {
  readonly rawFiles?: readonly SessionFile[];
  readonly storageService?: TestStorageService;
  readonly tableRowsReaderService?: TableRowsReaderProvider;
} = {}): TableServiceFixture => {
  const sessionService = new TestSessionService(rawFiles);
  const service = new TableService(
    tableRowsReaderService as never,
    sessionService as never,
    storageService as never,
  );
  return {
    service,
    sessionService,
    storageService,
  };
};

class TestSessionService {
  private readonly onDidChangeSessionEmitter = new Emitter<SessionChangeEvent>();
  public readonly onDidChangeSession = this.onDidChangeSessionEmitter.event;
  private sessionVersion = 0;
  private snapshot: SessionSnapshot = createSessionSnapshot([]);

  public constructor(rawFiles: readonly SessionFile[] = []) {
    this.setRawFiles(rawFiles, false);
  }

  public getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  public setRawFiles(
    rawFiles: readonly SessionFile[],
    fireEvent = true,
  ): void {
    this.sessionVersion += 1;
    this.snapshot = createSessionSnapshot(rawFiles, this.sessionVersion);
    if (fireEvent) {
      this.onDidChangeSessionEmitter.fire({
        fileIds: this.snapshot.fileOrder,
        rawTableRefs: [],
        reason: "rawTablesChanged",
        sessionVersion: this.sessionVersion,
      });
    }
  }
}

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

const createSessionSnapshot = (
  rawFiles: readonly SessionFile[],
  sessionVersion = 0,
): SessionSnapshot => {
  const records = mergeRawFilesIntoRecords({}, [], rawFiles);
  return {
    schemaVersion: 1,
    sessionVersion,
    filesById: records.filesById,
    fileOrder: records.fileOrder,
  };
};

const createRawFile = (
  overrides: Partial<SessionFile> = {},
): SessionFile => ({
  file: {},
  fileId: "file-a",
  fileName: "Raw.csv",
  sourceKey: "source-key-a",
  ...overrides,
});

const createRowsTableReader = (
  rows: readonly unknown[][],
  options: {
    readonly fileId?: string;
    readonly sheetId?: string | null;
    readonly sourceKey?: string;
  } = {},
): TableRowsReaderProvider => {
  const sourceKey = options.sourceKey ?? "source-key-a";
  const fileId = options.fileId ?? sourceKey;
  const sheetId = options.sheetId ?? null;
  const normalizedRows = rows.map(row => [...row]);
  return createTableRowsReaderService({
    canReadRows: () => true,
    openSource: async () => ({
      ok: true,
      result: {
        columnCount: Math.max(0, normalizedRows[0]?.length ?? 0),
        fileId,
        fileName: "Raw.csv",
        maxCellLengths: [],
        rowCount: normalizedRows.length,
        seedRows: normalizedRows,
        seedStartRow: 0,
        sheetId,
        sourceKey,
      },
    }),
    readRows: async (payload) => {
      const payloadRange = payload as {
        readonly endRow?: unknown;
        readonly startRow?: unknown;
      };
      const startRow = Math.max(
        0,
        Math.floor(Number(payloadRange.startRow) || 0),
      );
      const endRow = Math.max(
        startRow,
        Math.floor(Number(payloadRange.endRow) || startRow),
      );
      return {
        ok: true,
        result: {
          fileId,
          rows: normalizedRows.slice(startRow, endRow),
          sourceKey,
          startRow,
        },
      };
    },
  });
};

const waitForTableService = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};
