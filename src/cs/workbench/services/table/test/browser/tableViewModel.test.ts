import assert from "assert";
import {
	clearChunkRows,
	collectMissingChunkRanges,
	createTableViewModelInScope,
	hasChunkRowsInCache,
	mergeChunkRangeRows,
	mergeChunkRows,
	sanitizeTableRowBatch,
	TableStateScope,
} from "../../browser/tableViewModel.ts";
import { CancellationToken } from "src/cs/base/common/cancellation";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { TableModelContentSnapshot } from "src/cs/workbench/services/table/common/model";

suite("workbench/services/table/browser/tableViewModel row cache", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
	test("sanitizeTableRowBatch normalizes non-array rows", () => {
		const rows = sanitizeTableRowBatch([["a"], null, 1, ["b", "c"]]);
		assert.deepEqual(rows, [["a"], [], [], ["b", "c"]]);
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

	test("ensureRows expands row requests to the full chunk", async () => {
		const resource = URI.file("/workspace/chunk.csv");
		const model = createTableViewModelInScope(store.add(new TableStateScope()), {
			previewSources: [createResourceSourceInput(resource, {
				rows: Array.from({ length: 180 }, (_, index): string[] => [`row_${index}`]),
			})],
			source: { resource },
		});
		store.add({ dispose: () => model.clearState() });

		assert.equal(model.getRow(143), null);
		await model.ensureRows(143, 144);

		assert.deepEqual(model.getRow(100), ["row_100"]);
		assert.deepEqual(model.getRow(143), ["row_143"]);
		assert.deepEqual(model.getRow(149), ["row_149"]);
		assert.equal(model.getRow(150), null);
	});

	test("resolve waits for an existing chunk request before reading the row", async () => {
		const resource = URI.file("/workspace/concurrent-chunk.csv");
		const model = createTableViewModelInScope(store.add(new TableStateScope()), {
			previewSources: [createResourceSourceInput(resource, {
				rows: Array.from({ length: 180 }, (_, index): string[] => [`row_${index}`]),
			})],
			source: { resource },
		});
		store.add({ dispose: () => model.clearState() });

		const [firstRow, secondRow] = await Promise.all([
			model.resolve(143, CancellationToken.None),
			model.resolve(144, CancellationToken.None),
		]);

		assert.deepEqual(firstRow, ["row_143"]);
		assert.deepEqual(secondRow, ["row_144"]);
		assert.deepEqual(model.getRow(149), ["row_149"]);
	});
});

suite("workbench/services/table/browser/tableViewModel range decorations", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("normalizes decorations without changing selection and clears them on source switch", () => {
    const scope = store.add(new TableStateScope());
    const resource = URI.file("/workspace/decorated.csv");
    let model = createTableViewModelInScope(scope, {
      previewSources: [createResourceSourceInput(resource, {
        rows: [
          ["A", "B", "C"],
          ["1", "2", "3"],
          ["4", "5", "6"],
        ],
        sheetId: "sheet-a",
      })],
      source: { resource, sheetId: "sheet-a" },
    });
    store.add({ dispose: () => model.clearState() });

    const changes: (readonly unknown[])[] = [];
    model.onDidChangeRangeDecorations(decorations => {
      changes.push(decorations);
    });
    model.setSelection({
      activeCell: { sheetId: "sheet-a", rowIndex: 1, colIndex: 1 },
      selectedColumns: [2],
      ranges: [{ sheetId: "sheet-a", startRow: 1, endRow: 1, startCol: 1, endCol: 1 }],
    });
    const selection = model.getSelection();

    model.setRangeDecorations([
      { kind: "templateX", sheetId: "sheet-a", startRow: 0, endRow: 9, startCol: 0, endCol: 1 },
      { kind: "templateY", sheetId: "other", startRow: 0, endRow: 1, startCol: 2, endCol: 2 },
      { kind: "unknown", startRow: 0, endRow: 1, startCol: 0, endCol: 0 } as never,
      { kind: "templateBlock", startRow: 2, endRow: 1, startCol: 2, endCol: 9 },
    ]);

    assert.deepEqual(model.getSelection(), selection);
    assert.deepEqual(model.getRangeDecorations(), [
      { kind: "templateX", sheetId: "sheet-a", startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
      { kind: "templateBlock", sheetId: "sheet-a", startRow: 1, endRow: 2, startCol: 2, endCol: 2 },
    ]);

    const nextResource = URI.file("/workspace/next.csv");
    model = createTableViewModelInScope(scope, {
      previewSources: [createResourceSourceInput(nextResource, {
        rows: [["Next"]],
        sheetId: "sheet-b",
      })],
      source: { resource: nextResource, sheetId: "sheet-b" },
    });

    assert.deepEqual(model.getRangeDecorations(), []);
    assert.deepEqual(changes, [
      [
        { kind: "templateX", sheetId: "sheet-a", startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
        { kind: "templateBlock", sheetId: "sheet-a", startRow: 1, endRow: 2, startCol: 2, endCol: 2 },
      ],
      [],
    ]);
  });
});

suite("workbench/services/table/browser/tableViewModel display profiles", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("creates column-scale profiles from cached column samples", () => {
    const resource = URI.file("/workspace/raw.csv");
    const model = createTableViewModelInScope(store.add(new TableStateScope()), {
      numericDisplayMode: "smart",
      settingsVersion: 3,
      previewSources: [createResourceSourceInput(resource, {
        sourceVersion: 7,
        rows: [
          ["Time", "Current", "Status"],
          ["0", "-3.70327E-009", "ok"],
          ["1", "-4.00000E-009", "N/A"],
          ["2", "-5.00000E-009", "overflow"],
          ["3", "-6.00000E-009", "ok"],
        ],
      })],
      source: { resource },
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
    const resource = URI.file("/workspace/mixed.csv");
    const model = createTableViewModelInScope(store.add(new TableStateScope()), {
      numericDisplayMode: "smart",
      settingsVersion: 4,
      previewSources: [createResourceSourceInput(resource, {
        sourceVersion: 8,
        rows: [
          ["", "1.0E-009"],
          ["1.0E-012", "N/A"],
          ["", "overflow"],
          ["2.0E-012", "2.0E-009"],
          ["", "bad"],
          ["3.0E-012", "3.0E-009"],
        ],
      })],
      source: { resource },
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
    const resource = URI.file("/workspace/small.csv");
    const model = createTableViewModelInScope(store.add(new TableStateScope()), {
      numericDisplayMode: "smart",
      settingsVersion: 4,
      previewSources: [createResourceSourceInput(resource, {
        sourceVersion: 8,
        rows: [
          ["Current"],
          ["-3.70327E-009"],
          ["-3.49201E-009"],
          ["-3.04700E-009"],
        ],
      })],
      source: { resource },
    });
    store.add({ dispose: () => model.clearState() });

    const profile = model.getColumnDisplayProfile(0);
    assert.equal(profile.mode, "columnScale");
    assert.equal(profile.isNumericColumn, true);
    assert.equal(profile.scaleExponent, -9);
    assert.equal(profile.headerSuffix, "×10⁻⁹");
  });

  test("keeps cached profiles stable across repeated visible-range reads", () => {
    const resource = URI.file("/workspace/cached.csv");
    const model = createTableViewModelInScope(store.add(new TableStateScope()), {
      numericDisplayMode: "smart",
      settingsVersion: 5,
      previewSources: [createResourceSourceInput(resource, {
        sourceVersion: 9,
        rows: [
          ["1.0E+006"],
          ["2.0E+006"],
          ["3.0E+006"],
        ],
      })],
      source: { resource },
    });
    store.add({ dispose: () => model.clearState() });

    const firstProfile = model.getColumnDisplayProfile(0);
    const secondProfile = model.getColumnDisplayProfile(0);

    assert.equal(secondProfile, firstProfile);
    assert.equal(secondProfile.scaleExponent, 6);
    assert.equal(secondProfile.headerSuffix, "×10⁶");
  });

  test("uses scientific notation density when choosing profile scale", () => {
    const resource = URI.file("/workspace/density.csv");
    const model = createTableViewModelInScope(store.add(new TableStateScope()), {
      numericDisplayMode: "smart",
      settingsVersion: 6,
      previewSources: [createResourceSourceInput(resource, {
        sourceVersion: 10,
        rows: [
          ["1.000000"],
          ["-2.76E-009"],
          ["-3.00E-009"],
          ["1.100000"],
        ],
      })],
      source: { resource },
    });
    store.add({ dispose: () => model.clearState() });

    const profile = model.getColumnDisplayProfile(0);
    assert.equal(profile.mode, "columnScale");
    assert.equal(profile.scaleExponent, -9);
    assert.equal(profile.headerSuffix, "×10⁻⁹");
  });

  test("uses nano scale for CH1 current scientific data", () => {
    const resource = URI.file("/workspace/current.csv");
    const model = createTableViewModelInScope(store.add(new TableStateScope()), {
      numericDisplayMode: "smart",
      settingsVersion: 7,
      previewSources: [createResourceSourceInput(resource, {
        sourceVersion: 11,
        rows: [
          ["Repeat", "VAR2", "Point", "CH1 Voltage", "CH1 Current", "CH1 Resistance"],
          ["1.00000", "1.00000", "1.00000", "-3.00000E+000", "-3.70327E-009", "810.09486E+006"],
          ["1.00000", "1.00000", "2.00000", "-2.97001E+000", "-3.49201E-009", "850.90577E+006"],
          ["1.00000", "1.00000", "3.00000", "-2.94000E+000", "-3.04700E-009", "963.61533E+006"],
          ["1.00000", "1.00000", "4.00000", "-2.91000E+000", "-2.96000E-009", "981.84432E+006"],
          ["1.00000", "1.00000", "5.00000", "-2.88000E+000", "-2.82000E-009", "1019.80000E+006"],
        ],
      })],
      source: { resource },
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
    const resource = URI.file("/workspace/manual.csv");
    const model = createTableViewModelInScope(store.add(new TableStateScope()), {
      numericDisplayMode: "smart",
      settingsVersion: 8,
      previewSources: [createResourceSourceInput(resource, {
        sourceVersion: 12,
        rows: [
          ["CH1 Current"],
          ["-3.70327E-009"],
          ["-3.49201E-009"],
          ["-3.04700E-009"],
          ["-2.96000E-009"],
        ],
      })],
      source: { resource },
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

    assert.equal(model.adjustColumnDisplayScale(0, -20), true);
    assert.equal(model.getColumnDisplayProfile(0).scaleExponent, -30);

    assert.equal(model.adjustColumnDisplayScale(0, 70), true);
    assert.equal(model.getColumnDisplayProfile(0).scaleExponent, 40);

    assert.equal(model.resetColumnDisplayScale(0), true);
    const resetProfile = model.getColumnDisplayProfile(0);
    assert.equal(resetProfile.scaleExponent, -9);
    assert.equal(resetProfile.isScaleManual, undefined);
  });

  test("keeps adjacent lower current scale when cached column rows mix nano and micro samples", () => {
    const resource = URI.file("/workspace/mixed-scale.csv");
    const model = createTableViewModelInScope(store.add(new TableStateScope()), {
      numericDisplayMode: "smart",
      settingsVersion: 8,
      previewSources: [createResourceSourceInput(resource, {
        sourceVersion: 12,
        rows: [
          ["CH1 Current"],
          ["-8.70000E-013"],
          ...Array.from({ length: 59 }, (_, index): string[] => [
            `-${(1 + index / 100).toFixed(5)}E-012`,
          ]),
          ...Array.from({ length: 604 }, (_, index): string[] => [
            `-${(3 + index / 100).toFixed(5)}E-009`,
          ]),
          ...Array.from({ length: 743 }, (_, index): string[] => [
            `-${(3 + index / 100).toFixed(5)}E-006`,
          ]),
        ],
      })],
      source: { resource },
    });
    store.add({ dispose: () => model.clearState() });

    const profile = model.getColumnDisplayProfile(0);
    assert.equal(profile.scaleExponent, -9);
    assert.equal(profile.headerSuffix, "×10⁻⁹");
  });

  test("loads missing chunk rows from the table model snapshot", async () => {
    const resource = URI.file("/workspace/large.csv");
    const rows = Array.from({ length: 5051 }, (_, index): string[] => [
      index === 0 ? "CH1 Current" : `-${(3 + index / 100).toFixed(5)}E-009`,
    ]);
    const model = createTableViewModelInScope(store.add(new TableStateScope()), {
      numericDisplayMode: "smart",
      settingsVersion: 9,
      previewSources: [createResourceSourceInput(resource, {
        sourceVersion: 13,
        rows,
      })],
      source: { resource },
    });
    store.add({ dispose: () => model.clearState() });

    assert.equal(model.getRow(5050), null);
    await model.ensureRows(5050, 5051);
    assert.deepEqual(model.getRow(5050), ["-53.50000E-009"]);
  });

  test("keeps raw profiles when numeric display mode is raw", () => {
    const resource = URI.file("/workspace/raw-mode.csv");
    const model = createTableViewModelInScope(store.add(new TableStateScope()), {
      numericDisplayMode: "raw",
      previewSources: [createResourceSourceInput(resource, {
        rows: [
          ["-3.70327E-009"],
          ["-4.00000E-009"],
        ],
      })],
      source: { resource },
    });
    store.add({ dispose: () => model.clearState() });

    assert.equal(model.getColumnDisplayProfile(0).mode, "raw");
  });
});

const createResourceSourceInput = (
  resource: URI,
  {
    fileName = "Raw.csv",
    rows,
    sheetId = null,
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
    source: { resource, ...(sheetId ? { sheetId } : {}) },
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
