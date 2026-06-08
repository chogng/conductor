import assert from "assert";

import type { IAnalysisFileService } from "src/cs/workbench/services/analysisFile/common/analysisFile";
import type { TableSelection as SessionTableSelection } from "src/cs/workbench/services/session/common/sessionModel";
import type { TableFile, TableLoadState } from "../common/tableService.ts";
import { createTableModelWithScope } from "./tableService.ts";
import {
  areTableSelectionsEqual,
  normalizeTableSelection,
} from "../common/selection.ts";

suite("workbench/contrib/table/browser/tableService", () => {
  test("loads imported preview using the raw source key", async () => {
    let openedPayload: unknown = null;
    let previewFile: TableFile | null = null;
    let loadState: TableLoadState = { state: "idle", message: "" };
    const analysisFileService = createAnalysisFileService({
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
      analysisFileService,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        normalizedCsvPath: "C:/tmp/raw.csv",
        sourceKey: "source-key-a",
      }],
      selectedFileId: "file-a",
      setFile: (value) => {
        previewFile = typeof value === "function" ? value(previewFile) : value;
      },
      setLoadState: (value) => {
        loadState = typeof value === "function" ? value(loadState) : value;
      },
      workerRef: { current: null },
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
    assert.equal(previewFile?.sourceKey, "source-key-a");
    assert.equal(loadState.state, "ready");
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

  test("notifies selection subscribers before persisting view selection", () => {
    const events: string[] = [];
    let viewSelection: SessionTableSelection | undefined;
    const model = createTableModelWithScope({
      analysisFileService: createAnalysisFileService({
        canOpenFile: () => false,
      }),
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sheetId: "sheet-a",
      }],
      selectedFileId: "file-a",
      setViewSelection: (value) => {
        events.push("persist");
        viewSelection = typeof value === "function"
          ? value(viewSelection)
          : value;
      },
    });

    events.length = 0;
    model.onDidChangeSelection((selection) => {
      events.push(`notify:${selection.activeCell?.rowIndex ?? "none"}`);
      assert.equal(viewSelection, undefined);
    });

    model.setSelection({
      activeCell: {
        colIndex: 0,
        fileId: "file-a",
        rowIndex: 1,
        sheetId: "sheet-a",
      },
    });

    assert.deepEqual(events, ["notify:1", "persist"]);
    assert.deepEqual(viewSelection, {
      kind: "cell",
      fileId: "file-a",
      sheetId: "sheet-a",
      cell: {
        rowIndex: 1,
        colIndex: 0,
      },
    });
  });
});

const createAnalysisFileService = (
  overrides: Partial<IAnalysisFileService> = {},
): IAnalysisFileService => ({
  _serviceBrand: undefined,
  analyzeRc: async () => ({}),
  canAnalyzeRc: () => false,
  canDisposeFile: () => false,
  canGetDemoFiles: () => false,
  canGetPreviewRows: () => false,
  canOpenFile: () => true,
  canPrepareFile: () => false,
  canProcessFile: () => false,
  canReadCells: () => false,
  canReadConvertedCsv: () => false,
  disposeFile: async () => ({}),
  getDemoFiles: async () => ({}),
  getPreviewMeta: async () => ({}),
  getPreviewRows: async () => ({}),
  inferAutoExtraction: async () => ({}),
  openFile: async () => ({}),
  prepareFile: async () => ({
    assessment: {
      curveType: null,
      curveTypeConfidence: "low",
      curveTypeNeedsTemplate: true,
      curveTypeReasons: [],
      xAxisRole: null,
      xAxisRoleSource: null,
    },
  }),
  processFile: async () => ({}),
  readCell: async () => ({}),
  readCells: async () => ({}),
  ...overrides,
});
