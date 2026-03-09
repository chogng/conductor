import test from "node:test";
import assert from "node:assert/strict";
import {
  computeNextPreviewCell,
  computePreviewPageRows,
  getSelectionModeFromPointerEvent,
  isPreviewNavigationKey,
  resolveSelectionDragStart,
} from "./previewSelectionNavigation.js";

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
