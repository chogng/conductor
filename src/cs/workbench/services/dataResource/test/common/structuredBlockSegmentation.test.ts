/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createStructuredBlockSegments } from "src/cs/workbench/services/dataResource/common/structuredBlockSegmentation";

suite("workbench/services/dataResource/test/common/structuredBlockSegmentation", () => {
	test("segments horizontal FET blocks with local titles and blank gaps", () => {
		const segments = createStructuredBlockSegments({
			columnCount: 22,
			rows: [
				[
					"1-HS", "Index", "Vd (V)", "Id (A)", "Vg (V)", "Ig (A)",
					"", "", "",
					"Index", "Vd (V)", "Id (A)", "Vg (V)", "Ig (A)",
					"", "2-1-hs", "",
					"Index", "Vd (V)", "Id (A)", "Vg (V)", "Ig (A)",
				],
				[
					"", "1", "3", "1e-10", "60", "4e-10",
					"", "", "",
					"1", "5", "2e-10", "60", "3e-10",
					"", "", "",
					"1", "3", "1e-10", "60", "2e-10",
				],
				[
					"", "2", "2.97", "2e-10", "60", "3e-10",
					"", "", "",
					"2", "4.95", "3e-10", "60", "2e-10",
					"", "", "",
					"2", "2.97", "2e-10", "60", "2.5e-10",
				],
				[
					"", "3", "2.94", "3e-10", "60", "2e-10",
					"", "", "",
					"3", "4.9", "4e-10", "60", "1e-10",
					"", "", "",
					"3", "2.94", "3e-10", "60", "3e-10",
				],
			],
		});

		assert.deepStrictEqual(
			segments.map(segment => ({
				range: segment.range,
				dataRange: segment.dataRange,
				headerRange: segment.headerRange,
				titleCells: segment.titleCells,
				separatorColumns: segment.separatorColumns,
				numericColumns: segment.numericColumns,
			})),
			[
				{
					range: { startRow: 0, endRow: 3, startCol: 0, endCol: 5 },
					dataRange: { startRow: 1, endRow: 3, startCol: 1, endCol: 5 },
					headerRange: { startRow: 0, endRow: 0, startCol: 1, endCol: 5 },
					titleCells: [{ row: 0, column: 0, text: "1-HS" }],
					separatorColumns: [],
					numericColumns: [1, 2, 3, 4, 5],
				},
				{
					range: { startRow: 0, endRow: 3, startCol: 9, endCol: 13 },
					dataRange: { startRow: 1, endRow: 3, startCol: 9, endCol: 13 },
					headerRange: { startRow: 0, endRow: 0, startCol: 9, endCol: 13 },
					titleCells: [],
					separatorColumns: [],
					numericColumns: [9, 10, 11, 12, 13],
				},
				{
					range: { startRow: 0, endRow: 3, startCol: 15, endCol: 21 },
					dataRange: { startRow: 1, endRow: 3, startCol: 17, endCol: 21 },
					headerRange: { startRow: 0, endRow: 0, startCol: 17, endCol: 21 },
					titleCells: [{ row: 0, column: 15, text: "2-1-hs" }],
					separatorColumns: [16],
					numericColumns: [17, 18, 19, 20, 21],
				},
			],
		);
	});

	test("keeps dense text index columns inside physical data blocks", () => {
		const segments = createStructuredBlockSegments({
			columnCount: 5,
			rows: [
				["Index", "Vg (V)", "Id (A)", "Vd (V)", "Ig (A)"],
				["2023-01-01", "60", "1e-10", "-0.1", "4e-10"],
				["2023-01-02", "59.4", "2e-10", "-0.1", "3e-10"],
				["2023-01-03", "58.8", "3e-10", "-0.1", "2e-10"],
			],
		});

		assert.deepStrictEqual(
			segments.map(segment => ({
				dataRange: segment.dataRange,
				dataColumns: segment.dataColumns.map(column => ({
					column: column.column,
					kind: column.kind,
				})),
				numericColumns: segment.numericColumns,
			})),
			[{
				dataRange: { startRow: 1, endRow: 3, startCol: 0, endCol: 4 },
				dataColumns: [
					{ column: 0, kind: "text" },
					{ column: 1, kind: "numeric" },
					{ column: 2, kind: "numeric" },
					{ column: 3, kind: "numeric" },
					{ column: 4, kind: "numeric" },
				],
				numericColumns: [1, 2, 3, 4],
			}],
		);
	});
});
