import assert from "assert";
import {
  computeNextPreviewCell,
  computePreviewPageRows,
  getSelectionFocusCell,
  getSelectionModeFromPointerEvent,
  isPreviewNavigationKey,
  resolveSelectionDragStart,
} from "../../../browser/preview/previewSelectionNavigation.js";

suite("workbench/services/table/browser/preview/previewSelectionNavigation", () => {
  test("getSelectionModeFromPointerEvent maps ctrl/meta to append", () => {
    assert.equal(getSelectionModeFromPointerEvent({ ctrlKey: true }), "append");
    assert.equal(getSelectionModeFromPointerEvent({ metaKey: true }), "append");
    assert.equal(
      getSelectionModeFromPointerEvent({ ctrlKey: false, metaKey: false }),
      "replace",
    );
  });

  test("resolveSelectionDragStart uses anchor only when shift is pressed", () => {
    const anchor = { rowIndex: 7, colIndex: 3 };
    const withShift = resolveSelectionDragStart({
      rowIndex: 20,
      colIndex: 8,
      anchor,
      shiftKey: true,
    });
    assert.deepEqual(withShift.startCell, anchor);
    assert.deepEqual(withShift.pointerCell, { rowIndex: 20, colIndex: 8 });
    assert.deepEqual(withShift.nextAnchor, anchor);

    const withoutShift = resolveSelectionDragStart({
      rowIndex: 20,
      colIndex: 8,
      anchor,
      shiftKey: false,
    });
    assert.deepEqual(withoutShift.startCell, { rowIndex: 20, colIndex: 8 });
    assert.deepEqual(withoutShift.nextAnchor, { rowIndex: 20, colIndex: 8 });
  });

  test("isPreviewNavigationKey covers movement keys", () => {
    assert.equal(isPreviewNavigationKey("ArrowUp"), true);
    assert.equal(isPreviewNavigationKey("End"), true);
    assert.equal(isPreviewNavigationKey("PageDown"), true);
    assert.equal(isPreviewNavigationKey("a"), false);
  });

  test("computePreviewPageRows derives page rows from viewport/header/row height", () => {
    const pageRows = computePreviewPageRows({
      viewportHeight: 380,
      headerHeight: 28,
      rowHeight: 28,
    });
    assert.equal(pageRows, 12);
  });

  test("computeNextPreviewCell clamps row/column bounds", () => {
    assert.deepEqual(
      computeNextPreviewCell({
        currentCell: { rowIndex: 0, colIndex: 0 },
        key: "ArrowUp",
        pageRows: 10,
        totalRows: 100,
        totalCols: 26,
      }),
      { rowIndex: 0, colIndex: 0 },
    );

    assert.deepEqual(
      computeNextPreviewCell({
        currentCell: { rowIndex: 5, colIndex: 2 },
        key: "PageDown",
        pageRows: 20,
        totalRows: 12,
        totalCols: 4,
      }),
      { rowIndex: 11, colIndex: 2 },
    );

    assert.deepEqual(
      computeNextPreviewCell({
        currentCell: { rowIndex: 5, colIndex: 2 },
        key: "Home",
        pageRows: 20,
        totalRows: 12,
        totalCols: 4,
      }),
      { rowIndex: 5, colIndex: 0 },
    );

    assert.deepEqual(
      computeNextPreviewCell({
        currentCell: { rowIndex: 5, colIndex: 2 },
        key: "End",
        pageRows: 20,
        totalRows: 12,
        totalCols: 4,
      }),
      { rowIndex: 5, colIndex: 3 },
    );
  });

  test("getSelectionFocusCell returns the normalized range end cell", () => {
    assert.deepEqual(
      getSelectionFocusCell({
        startRow: 3,
        endRow: 9,
        startCol: 2,
        endCol: 6,
      }),
      { rowIndex: 9, colIndex: 6 },
    );
  });

  test("getSelectionFocusCell clamps negatives and rejects invalid ranges", () => {
    assert.deepEqual(
      getSelectionFocusCell({
        startRow: 0,
        endRow: -4,
        startCol: 0,
        endCol: -2,
      }),
      { rowIndex: 0, colIndex: 0 },
    );
    assert.equal(getSelectionFocusCell(null), null);
    assert.equal(getSelectionFocusCell({ endRow: "x", endCol: 3 }), null);
  });
});
