import assert from "assert";
import {
	buildTableCellReadRequests,
	clearChunkRows,
	collectMissingChunkRanges,
	createTableModelInScope,
	hasChunkRowsInCache,
	isTableRowBatchResultForRequest,
	mergeChunkRangeRows,
	mergeChunkRows,
	rowsFromTableCellReads,
	sanitizeTableRowBatch,
	TableStateScope,
} from "../../browser/tableModel.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { TableRowsReaderProvider } from "src/cs/workbench/services/table/common/table";

suite("workbench/services/table/browser/tableModel row cache", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("sanitizeTableRowBatch normalizes non-array rows", () => {
		const rows = sanitizeTableRowBatch([["a"], null, 1, ["b", "c"]]);
		assert.deepEqual(rows, [["a"], [], [], ["b", "c"]]);
	});

	test("isTableRowBatchResultForRequest rejects cross-file and mismatched start row", () => {
		assert.equal(
			isTableRowBatchResultForRequest({
				requestFileId: "file_A",
				requestStartRow: 0,
				payloadFileId: "file_B",
				payloadStartRow: 0,
			}),
			false,
		);

		assert.equal(
			isTableRowBatchResultForRequest({
				requestFileId: "file_A",
				requestStartRow: 50,
				payloadFileId: "file_A",
				payloadStartRow: 0,
			}),
			false,
		);

		assert.equal(
			isTableRowBatchResultForRequest({
				requestFileId: "file_A",
				requestStartRow: 50,
				payloadFileId: "file_A",
				payloadStartRow: 50,
			}),
			true,
		);

		assert.equal(
			isTableRowBatchResultForRequest({
				requestFileId: "file_A:sheet-1",
				requestStartRow: 50,
				payloadFileId: "file_A",
				payloadSourceKey: "file_A:sheet-1",
				payloadStartRow: 50,
			}),
			true,
		);
	});

	test("mergeChunkRows does not mark chunk loaded when payload is short", () => {
		const rowCache = new Map();
		const loadedChunks = new Set([0]);
		rowCache.set(50, ["stale"]);
		rowCache.set(51, ["stale"]);

		const merged = mergeChunkRows({
			rowCache,
			loadedChunks,
			chunkStart: 50,
			chunkEnd: 53,
			rows: [["new_0"], ["new_1"]],
			chunkSize: 50,
			maxChunks: 8,
		});

		assert.equal(merged, false);
		assert.equal(loadedChunks.has(50), false);
		assert.equal(rowCache.has(50), false);
		assert.equal(rowCache.has(51), false);
		assert.equal(rowCache.has(52), false);
	});

	test("mergeChunkRows stores complete chunk and evicts oldest chunk rows by LRU", () => {
		const rowCache = new Map();
		const loadedChunks = new Set([0, 50]);
		rowCache.set(0, ["old_0"]);
		rowCache.set(1, ["old_1"]);
		rowCache.set(50, ["mid_0"]);
		rowCache.set(51, ["mid_1"]);

		const merged = mergeChunkRows({
			rowCache,
			loadedChunks,
			chunkStart: 100,
			chunkEnd: 102,
			rows: [["new_0"], ["new_1"]],
			chunkSize: 50,
			maxChunks: 2,
		});

		assert.equal(merged, true);
		assert.deepEqual(rowCache.get(100), ["new_0"]);
		assert.deepEqual(rowCache.get(101), ["new_1"]);
		assert.equal(loadedChunks.has(100), true);

		assert.equal(loadedChunks.has(0), false);
		assert.equal(rowCache.has(0), false);
		assert.equal(rowCache.has(1), false);
	});

	test("collectMissingChunkRanges merges contiguous gaps and skips cached or pending chunks", () => {
		const rowCache = new Map();
		const pendingChunks = new Set([100]);

		for (let rowIndex = 50; rowIndex < 100; rowIndex += 1) {
			rowCache.set(rowIndex, [`cached_${rowIndex}`]);
		}

		const ranges = collectMissingChunkRanges({
			rowCache,
			pendingChunks,
			startRow: 0,
			endRow: 151,
			chunkSize: 50,
			maxRangeRows: 200,
		});

		assert.deepEqual(ranges, [
			{
				rangeStart: 0,
				rangeEnd: 50,
				chunkStarts: [0],
			},
			{
				rangeStart: 150,
				rangeEnd: 151,
				chunkStarts: [150],
			},
		]);
	});

	test("collectMissingChunkRanges splits oversized missing ranges", () => {
		const ranges = collectMissingChunkRanges({
			rowCache: new Map(),
			pendingChunks: new Set(),
			startRow: 0,
			endRow: 260,
			chunkSize: 50,
			maxRangeRows: 100,
		});

		assert.deepEqual(ranges, [
			{
				rangeStart: 0,
				rangeEnd: 100,
				chunkStarts: [0, 50],
			},
			{
				rangeStart: 100,
				rangeEnd: 200,
				chunkStarts: [100, 150],
			},
			{
				rangeStart: 200,
				rangeEnd: 260,
				chunkStarts: [200, 250],
			},
		]);
	});

	test("mergeChunkRangeRows seeds multiple chunks into cache and updates LRU", () => {
		const rowCache = new Map();
		const loadedChunks = new Set([0]);
		rowCache.set(0, ["old_0"]);
		rowCache.set(1, ["old_1"]);

		const merged = mergeChunkRangeRows({
			rowCache,
			loadedChunks,
			rangeStart: 50,
			rangeEnd: 154,
			rows: Array.from({ length: 104 }, (_, index) => [`row_${index}`]),
			chunkSize: 50,
			maxChunks: 3,
		});

		assert.deepEqual(merged, {
			complete: true,
			mergedChunkStarts: [50, 100, 150],
		});
		assert.deepEqual(rowCache.get(50), ["row_0"]);
		assert.deepEqual(rowCache.get(103), ["row_53"]);
		assert.deepEqual(rowCache.get(153), ["row_103"]);
		assert.equal(loadedChunks.has(0), false);
		assert.equal(loadedChunks.has(50), true);
		assert.equal(loadedChunks.has(100), true);
		assert.equal(loadedChunks.has(150), true);
	});

	test("hasChunkRowsInCache validates full row range presence", () => {
		const rowCache = new Map();
		rowCache.set(0, ["a"]);
		rowCache.set(1, ["b"]);
		assert.equal(hasChunkRowsInCache(rowCache, 0, 2), true);
		clearChunkRows(rowCache, 1, 2);
		assert.equal(hasChunkRowsInCache(rowCache, 0, 2), false);
	});
});

suite("workbench/services/table/browser/tableModel cell reads", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("buildTableCellReadRequests expands unique rows into full-row cell reads", () => {
		const cells = buildTableCellReadRequests({
			columnCount: 3,
			rowIndices: [2, 1, 2, "bad", -1],
		});

		assert.deepEqual(cells, [
			{ colIndex: 0, rowIndex: 1 },
			{ colIndex: 1, rowIndex: 1 },
			{ colIndex: 2, rowIndex: 1 },
			{ colIndex: 0, rowIndex: 2 },
			{ colIndex: 1, rowIndex: 2 },
			{ colIndex: 2, rowIndex: 2 },
		]);
	});

	test("buildTableCellReadRequests refuses oversized batches", () => {
		assert.deepEqual(
			buildTableCellReadRequests({
				columnCount: 4,
				maxCells: 7,
				rowIndices: [0, 1],
			}),
			[],
		);
	});

	test("rowsFromTableCellReads reconstructs full rows from cell read results", () => {
		const rows = rowsFromTableCellReads({
			columnCount: 3,
			cells: [
				{ rowIndex: 4, colIndex: 1, value: "B" },
				{ rowIndex: 4, colIndex: 2, value: null },
				{ rowIndex: 4, colIndex: 99, value: "ignored" },
				{ rowIndex: "bad", colIndex: 0, value: "ignored" },
			],
		});

		assert.deepEqual(rows.get(4), ["", "B", ""]);
	});
});

suite("workbench/services/table/browser/tableModel display profiles", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("creates column-scale profiles from cached column samples", () => {
    const model = createTableModelInScope(store.add(new TableStateScope()), {
      tableRowsReaderService: createTableRowsReaderService(),
      numericDisplayMode: "smart",
      settingsVersion: 3,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sourceKey: "table-a",
        sourceVersion: 7,
      }],
      source: { fileId: "file-a" },
      file: {
        columnCount: 3,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1, 1, 1],
        rowCount: 5,
        sourceKey: "table-a",
        sourceVersion: 7,
      },
      rowsCacheRef: {
        current: new Map([
          [0, ["Time", "Current", "Status"]],
          [1, ["0", "-3.70327E-009", "ok"]],
          [2, ["1", "-4.00000E-009", "N/A"]],
          [3, ["2", "-5.00000E-009", "overflow"]],
          [4, ["3", "-6.00000E-009", "ok"]],
        ]),
      },
    });
    store.add({ dispose: () => model.clearState() });

    const numericProfile = model.getColumnDisplayProfile(1);
    assert.equal(numericProfile.mode, "columnScale");
    assert.equal(numericProfile.isNumericColumn, true);
    assert.equal(numericProfile.scaleExponent, -9);
    assert.equal(numericProfile.headerSuffix, "×10⁻⁹");
    assert.equal(numericProfile.sourceVersion, 7);
    assert.equal(numericProfile.settingsVersion, 3);

    const textProfile = model.getColumnDisplayProfile(2);
    assert.equal(textProfile.mode, "raw");
    assert.equal(textProfile.isNumericColumn, false);
  });

  test("ignores empty cells and falls back for mixed text columns", () => {
    const model = createTableModelInScope(store.add(new TableStateScope()), {
      tableRowsReaderService: createTableRowsReaderService(),
      numericDisplayMode: "smart",
      settingsVersion: 4,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sourceKey: "table-a",
        sourceVersion: 8,
      }],
      source: { fileId: "file-a" },
      file: {
        columnCount: 2,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1, 1],
        rowCount: 6,
        sourceKey: "table-a",
        sourceVersion: 8,
      },
      rowsCacheRef: {
        current: new Map([
          [0, ["", "1.0E-009"]],
          [1, ["1.0E-012", "N/A"]],
          [2, ["", "overflow"]],
          [3, ["2.0E-012", "2.0E-009"]],
          [4, [null, "bad"]],
          [5, ["3.0E-012", "3.0E-009"]],
        ]),
      },
    });
    store.add({ dispose: () => model.clearState() });

    const sparseNumericProfile = model.getColumnDisplayProfile(0);
    assert.equal(sparseNumericProfile.mode, "columnScale");
    assert.equal(sparseNumericProfile.scaleExponent, -12);
    assert.equal(sparseNumericProfile.headerSuffix, "×10⁻¹²");

    const mixedProfile = model.getColumnDisplayProfile(1);
    assert.equal(mixedProfile.mode, "raw");
    assert.equal(mixedProfile.isNumericColumn, false);
  });

  test("treats a small column with a leading text label as numeric", () => {
    const model = createTableModelInScope(store.add(new TableStateScope()), {
      tableRowsReaderService: createTableRowsReaderService(),
      numericDisplayMode: "smart",
      settingsVersion: 4,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sourceKey: "table-a",
        sourceVersion: 8,
      }],
      source: { fileId: "file-a" },
      file: {
        columnCount: 1,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1],
        rowCount: 4,
        sourceKey: "table-a",
        sourceVersion: 8,
      },
      rowsCacheRef: {
        current: new Map([
          [0, ["Current"]],
          [1, ["-3.70327E-009"]],
          [2, ["-3.49201E-009"]],
          [3, ["-3.04700E-009"]],
        ]),
      },
    });
    store.add({ dispose: () => model.clearState() });

    const profile = model.getColumnDisplayProfile(0);
    assert.equal(profile.mode, "columnScale");
    assert.equal(profile.isNumericColumn, true);
    assert.equal(profile.scaleExponent, -9);
    assert.equal(profile.headerSuffix, "×10⁻⁹");
  });

  test("keeps cached profiles stable across repeated visible-range reads", () => {
    const model = createTableModelInScope(store.add(new TableStateScope()), {
      tableRowsReaderService: createTableRowsReaderService(),
      numericDisplayMode: "smart",
      settingsVersion: 5,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sourceKey: "table-a",
        sourceVersion: 9,
      }],
      source: { fileId: "file-a" },
      file: {
        columnCount: 1,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1],
        rowCount: 3,
        sourceKey: "table-a",
        sourceVersion: 9,
      },
      rowsCacheRef: {
        current: new Map([
          [0, ["1.0E+006"]],
          [1, ["2.0E+006"]],
          [2, ["3.0E+006"]],
        ]),
      },
    });
    store.add({ dispose: () => model.clearState() });

    const firstProfile = model.getColumnDisplayProfile(0);
    const secondProfile = model.getColumnDisplayProfile(0);

    assert.equal(secondProfile, firstProfile);
    assert.equal(secondProfile.scaleExponent, 6);
    assert.equal(secondProfile.headerSuffix, "×10⁶");
  });

  test("uses scientific notation density when choosing profile scale", () => {
    const model = createTableModelInScope(store.add(new TableStateScope()), {
      tableRowsReaderService: createTableRowsReaderService(),
      numericDisplayMode: "smart",
      settingsVersion: 6,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sourceKey: "table-a",
        sourceVersion: 10,
      }],
      source: { fileId: "file-a" },
      file: {
        columnCount: 1,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1],
        rowCount: 4,
        sourceKey: "table-a",
        sourceVersion: 10,
      },
      rowsCacheRef: {
        current: new Map([
          [0, ["1.000000"]],
          [1, ["-2.76E-009"]],
          [2, ["-3.00E-009"]],
          [3, ["1.100000"]],
        ]),
      },
    });
    store.add({ dispose: () => model.clearState() });

    const profile = model.getColumnDisplayProfile(0);
    assert.equal(profile.mode, "columnScale");
    assert.equal(profile.scaleExponent, -9);
    assert.equal(profile.headerSuffix, "×10⁻⁹");
  });

  test("uses nano scale for CH1 current scientific data", () => {
    const model = createTableModelInScope(store.add(new TableStateScope()), {
      tableRowsReaderService: createTableRowsReaderService(),
      numericDisplayMode: "smart",
      settingsVersion: 7,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sourceKey: "table-a",
        sourceVersion: 11,
      }],
      source: { fileId: "file-a" },
      file: {
        columnCount: 6,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1, 1, 1, 1, 1, 1],
        rowCount: 6,
        sourceKey: "table-a",
        sourceVersion: 11,
      },
      rowsCacheRef: {
        current: new Map([
          [0, ["Repeat", "VAR2", "Point", "CH1 Voltage", "CH1 Current", "CH1 Resistance"]],
          [1, ["1.00000", "1.00000", "1.00000", "-3.00000E+000", "-3.70327E-009", "810.09486E+006"]],
          [2, ["1.00000", "1.00000", "2.00000", "-2.97001E+000", "-3.49201E-009", "850.90577E+006"]],
          [3, ["1.00000", "1.00000", "3.00000", "-2.94000E+000", "-3.04700E-009", "963.61533E+006"]],
          [4, ["1.00000", "1.00000", "4.00000", "-2.91000E+000", "-2.96000E-009", "981.84432E+006"]],
          [5, ["1.00000", "1.00000", "5.00000", "-2.88000E+000", "-2.82000E-009", "1019.80000E+006"]],
        ]),
      },
    });
    store.add({ dispose: () => model.clearState() });

    const currentProfile = model.getColumnDisplayProfile(4);
    assert.equal(currentProfile.mode, "columnScale");
    assert.equal(currentProfile.scaleExponent, -9);
    assert.equal(currentProfile.headerSuffix, "×10⁻⁹");

    const resistanceProfile = model.getColumnDisplayProfile(5);
    assert.equal(resistanceProfile.scaleExponent, 6);
    assert.equal(resistanceProfile.headerSuffix, "×10⁶");
  });

  test("applies and resets manual column scale overrides", () => {
    const model = createTableModelInScope(store.add(new TableStateScope()), {
      tableRowsReaderService: createTableRowsReaderService(),
      numericDisplayMode: "smart",
      settingsVersion: 8,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sourceKey: "table-a",
        sourceVersion: 12,
      }],
      source: { fileId: "file-a" },
      file: {
        columnCount: 1,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1],
        rowCount: 5,
        sourceKey: "table-a",
        sourceVersion: 12,
      },
      rowsCacheRef: {
        current: new Map([
          [0, ["CH1 Current"]],
          [1, ["-3.70327E-009"]],
          [2, ["-3.49201E-009"]],
          [3, ["-3.04700E-009"]],
          [4, ["-2.96000E-009"]],
        ]),
      },
    });
    store.add({ dispose: () => model.clearState() });

    assert.equal(model.getColumnDisplayProfile(0).scaleExponent, -9);

    assert.equal(model.adjustColumnDisplayScale(0, 1), true);
    const adjustedProfile = model.getColumnDisplayProfile(0);
    assert.equal(adjustedProfile.scaleExponent, -8);
    assert.equal(adjustedProfile.headerSuffix, "×10⁻⁸");
    assert.equal(adjustedProfile.isScaleManual, true);

    assert.equal(model.adjustColumnDisplayScale(0, -2), true);
    assert.equal(model.getColumnDisplayProfile(0).scaleExponent, -10);

    assert.equal(model.resetColumnDisplayScale(0), true);
    const resetProfile = model.getColumnDisplayProfile(0);
    assert.equal(resetProfile.scaleExponent, -9);
    assert.equal(resetProfile.isScaleManual, undefined);
  });

  test("keeps adjacent lower current scale when cached column rows mix nano and micro samples", () => {
    const model = createTableModelInScope(store.add(new TableStateScope()), {
      tableRowsReaderService: createTableRowsReaderService(),
      numericDisplayMode: "smart",
      settingsVersion: 8,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sourceKey: "table-a",
        sourceVersion: 12,
      }],
      source: { fileId: "file-a" },
      file: {
        columnCount: 1,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1],
        rowCount: 1408,
        sourceKey: "table-a",
        sourceVersion: 12,
      },
      rowsCacheRef: {
        current: new Map([
          [0, ["CH1 Current"]],
          [1, ["-8.70000E-013"]],
          ...Array.from({ length: 59 }, (_, index): [number, string[]] => [
            index + 2,
            [`-${(1 + index / 100).toFixed(5)}E-012`],
          ]),
          ...Array.from({ length: 604 }, (_, index): [number, string[]] => [
            index + 61,
            [`-${(3 + index / 100).toFixed(5)}E-009`],
          ]),
          ...Array.from({ length: 743 }, (_, index): [number, string[]] => [
            index + 665,
            [`-${(3 + index / 100).toFixed(5)}E-006`],
          ]),
        ]),
      },
    });
    store.add({ dispose: () => model.clearState() });

    const profile = model.getColumnDisplayProfile(0);
    assert.equal(profile.scaleExponent, -9);
    assert.equal(profile.headerSuffix, "×10⁻⁹");
  });

  test("recomputes cached profiles when row cache changes", async () => {
    const model = createTableModelInScope(store.add(new TableStateScope()), {
      tableRowsReaderService: createTableRowsReaderService({
        canOpenSource: () => true,
        canReadRows: () => true,
        openSource: async () => ({
          ok: true,
          result: {
            columnCount: 1,
            fileId: "table-a",
            fileName: "Raw.csv",
            maxCellLengths: [1],
            rowCount: 60,
            seedRows: [
              ["-3.00000E-006"],
              ["-3.10000E-006"],
              ["-3.20000E-006"],
            ],
            seedStartRow: 50,
            sourceKey: "table-a",
          },
        }),
        readRows: async (payload) => {
          const { endRow, fileId, startRow } = payload as {
            readonly endRow: number;
            readonly fileId: string;
            readonly startRow: number;
          };
          return {
            ok: true,
            result: {
              fileId,
              startRow,
              rows: Array.from({ length: endRow - startRow }, (_, index) => [
                index === 0 ? "CH1 Current" : `-${(3 + index / 100).toFixed(5)}E-009`,
              ]),
            },
          };
        },
      }),
      numericDisplayMode: "smart",
      settingsVersion: 9,
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        normalizedCsvPath: "C:/tmp/raw.csv",
        sourceKey: "table-a",
        sourceVersion: 13,
      }],
      source: { fileId: "file-a" },
    });
    store.add({ dispose: () => model.clearState() });

    await waitForTableModel();

    assert.equal(model.getColumnDisplayProfile(0).scaleExponent, -6);

    await model.ensureRows("table-a", 0, 50);

    const recomputedProfile = model.getColumnDisplayProfile(0);
    assert.equal(recomputedProfile.scaleExponent, -9);
    assert.equal(recomputedProfile.headerSuffix, "×10⁻⁹");
  });

  test("keeps raw profiles when numeric display mode is raw", () => {
    const model = createTableModelInScope(store.add(new TableStateScope()), {
      tableRowsReaderService: createTableRowsReaderService(),
      numericDisplayMode: "raw",
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
        sourceKey: "table-a",
      }],
      source: { fileId: "file-a" },
      file: {
        columnCount: 1,
        fileId: "file-a",
        fileName: "Raw.csv",
        maxCellLengths: [1],
        rowCount: 2,
        sourceKey: "table-a",
      },
      rowsCacheRef: {
        current: new Map([
          [0, ["-3.70327E-009"]],
          [1, ["-4.00000E-009"]],
        ]),
      },
    });
    store.add({ dispose: () => model.clearState() });

    assert.equal(model.getColumnDisplayProfile(0).mode, "raw");
  });
});

const waitForTableModel = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

const createTableRowsReaderService = (
  overrides: Partial<TableRowsReaderProvider> = {},
): TableRowsReaderProvider => ({
  canReleaseSource: () => false,
  canReadRows: () => false,
  canOpenSource: () => false,
  canReadConvertedCsv: () => false,
  canReadCells: () => false,
  releaseSource: async () => ({}),
  readRows: async () => ({}),
  openSource: async () => ({}),
  readConvertedCsv: async () => ({ ok: false }),
  readCells: async () => ({}),
  ...overrides,
});
