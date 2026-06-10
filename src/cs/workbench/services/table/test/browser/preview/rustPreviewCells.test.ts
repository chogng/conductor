import assert from "assert";
import {
  buildRustPreviewCellRequests,
  rowsFromRustPreviewCells,
} from "../../../browser/preview/rustPreviewCells.ts";

suite("workbench/services/table/browser/preview/rustPreviewCells", () => {
  test("buildRustPreviewCellRequests expands unique rows into full-row cell reads", () => {
    const cells = buildRustPreviewCellRequests({
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

  test("buildRustPreviewCellRequests refuses oversized batches", () => {
    assert.deepEqual(
      buildRustPreviewCellRequests({
        columnCount: 4,
        maxCells: 7,
        rowIndices: [0, 1],
      }),
      [],
    );
  });

  test("rowsFromRustPreviewCells reconstructs full rows from Rust cell results", () => {
    const rows = rowsFromRustPreviewCells({
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
