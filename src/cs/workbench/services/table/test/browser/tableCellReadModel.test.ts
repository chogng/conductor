import assert from "assert";
import {
	buildTableCellReadRequests,
	rowsFromTableCellReads,
} from "../../browser/tableCellReadModel.ts";

suite("workbench/services/table/browser/tableCellReadModel", () => {
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
