import assert from "assert";

import {
  clampTableGridColumnWidth,
  getTableGridColumnLabel,
  getTableGridRowLabel,
  getTableGridRowHeight,
  getTableGridSpacerHeights,
  getTableGridZoomScale,
  resolveTableGridCellRange,
  resolveTableGridColumnViewportRange,
  resolveTableGridRange,
  resolveTableGridKeyboardTarget,
  resolveTableGridViewportRange,
  resizeTableGridColumnWidth,
} from "src/cs/workbench/contrib/table/browser/tableGridModel";

suite("workbench/contrib/table/browser/tableGridModel", () => {
  test("resolves bounded render ranges", () => {
    assert.deepEqual(resolveTableGridRange({
      totalCount: 500,
      startIndex: 20,
      maxRenderedCount: 80,
    }), {
      totalCount: 500,
      startIndex: 20,
      endIndex: 100,
      renderedCount: 80,
    });

    assert.deepEqual(resolveTableGridRange({
      totalCount: 50,
      startIndex: 40,
      maxRenderedCount: 80,
    }), {
      totalCount: 50,
      startIndex: 40,
      endIndex: 50,
      renderedCount: 10,
    });
  });

  test("normalizes empty or invalid render ranges", () => {
    assert.deepEqual(resolveTableGridRange({
      totalCount: -1,
      startIndex: 10,
      maxRenderedCount: 80,
    }), {
      totalCount: 0,
      startIndex: 0,
      endIndex: 0,
      renderedCount: 0,
    });

    assert.deepEqual(resolveTableGridRange({
      totalCount: 12,
      startIndex: 99,
      maxRenderedCount: 4,
    }), {
      totalCount: 12,
      startIndex: 11,
      endIndex: 12,
      renderedCount: 1,
    });
  });

  test("resolves viewport ranges with overscan", () => {
    assert.deepEqual(resolveTableGridViewportRange({
      totalCount: 1_000,
      scrollTop: 280,
      viewportHeight: 280,
      rowHeight: 28,
      overscanCount: 2,
      maxRenderedCount: 80,
    }), {
      totalCount: 1_000,
      startIndex: 8,
      endIndex: 22,
      renderedCount: 14,
    });
  });

  test("clamps viewport ranges near the end", () => {
    assert.deepEqual(resolveTableGridViewportRange({
      totalCount: 100,
      scrollTop: 2_800,
      viewportHeight: 280,
      rowHeight: 28,
      overscanCount: 2,
      maxRenderedCount: 80,
    }), {
      totalCount: 100,
      startIndex: 86,
      endIndex: 100,
      renderedCount: 14,
    });
  });

  test("computes virtual spacer heights", () => {
    assert.deepEqual(getTableGridSpacerHeights({
      totalCount: 100,
      startIndex: 10,
      endIndex: 20,
      renderedCount: 10,
    }, 28), {
      topHeight: 280,
      bottomHeight: 2_240,
    });
  });

  test("resolves horizontal column viewport ranges", () => {
    const widths = [100, 200, 300, 100, 100];

    assert.deepEqual(resolveTableGridColumnViewportRange({
      totalCount: widths.length,
      scrollLeft: 250,
      viewportWidth: 250,
      zoomPercent: 100,
      overscanCount: 0,
      maxRenderedCount: 24,
      getColumnWidth: colIndex => widths[colIndex] ?? 160,
    }), {
      totalCount: 5,
      startIndex: 1,
      endIndex: 3,
      renderedCount: 2,
      leadingWidth: 100,
      renderedWidth: 500,
      totalWidth: 800,
      trailingWidth: 200,
    });
  });

  test("overscans and caps horizontal column viewport ranges", () => {
    assert.deepEqual(resolveTableGridColumnViewportRange({
      totalCount: 10,
      scrollLeft: 320,
      viewportWidth: 160,
      zoomPercent: 100,
      overscanCount: 1,
      maxRenderedCount: 3,
      getColumnWidth: () => 80,
    }), {
      totalCount: 10,
      startIndex: 3,
      endIndex: 6,
      renderedCount: 3,
      leadingWidth: 240,
      renderedWidth: 240,
      totalWidth: 800,
      trailingWidth: 320,
    });
  });

  test("resolves arrow keyboard targets", () => {
    assert.deepEqual(resolveTableGridKeyboardTarget({
      rowCount: 10,
      columnCount: 5,
      currentCell: { rowIndex: 3, colIndex: 2 },
      key: "ArrowDown",
    }), { rowIndex: 4, colIndex: 2 });

    assert.deepEqual(resolveTableGridKeyboardTarget({
      rowCount: 10,
      columnCount: 5,
      currentCell: { rowIndex: 0, colIndex: 0 },
      key: "ArrowLeft",
    }), { rowIndex: 0, colIndex: 0 });
  });

  test("resolves page and edge keyboard targets", () => {
    assert.deepEqual(resolveTableGridKeyboardTarget({
      rowCount: 100,
      columnCount: 5,
      currentCell: { rowIndex: 20, colIndex: 2 },
      key: "PageDown",
      pageRowCount: 12,
    }), { rowIndex: 32, colIndex: 2 });

    assert.deepEqual(resolveTableGridKeyboardTarget({
      rowCount: 100,
      columnCount: 5,
      currentCell: { rowIndex: 20, colIndex: 2 },
      key: "Home",
    }), { rowIndex: 20, colIndex: 0 });

    assert.deepEqual(resolveTableGridKeyboardTarget({
      rowCount: 100,
      columnCount: 5,
      currentCell: { rowIndex: 20, colIndex: 2 },
      key: "End",
      toBoundary: true,
    }), { rowIndex: 99, colIndex: 4 });
  });

  test("rejects keyboard targets for empty tables or unsupported keys", () => {
    assert.equal(resolveTableGridKeyboardTarget({
      rowCount: 0,
      columnCount: 5,
      key: "ArrowDown",
    }), null);

    assert.equal(resolveTableGridKeyboardTarget({
      rowCount: 10,
      columnCount: 5,
      key: "Escape",
    }), null);
  });

  test("resolves normalized cell ranges", () => {
    assert.deepEqual(resolveTableGridCellRange(
      { rowIndex: 5, colIndex: 4 },
      { rowIndex: 2, colIndex: 8 },
    ), {
      endCol: 8,
      endRow: 5,
      startCol: 4,
      startRow: 2,
    });
  });

  test("labels spreadsheet rows and columns", () => {
    assert.equal(getTableGridColumnLabel(0), "A");
    assert.equal(getTableGridColumnLabel(25), "Z");
    assert.equal(getTableGridColumnLabel(26), "AA");
    assert.equal(getTableGridColumnLabel(701), "ZZ");
    assert.equal(getTableGridRowLabel(0), "1");
    assert.equal(getTableGridRowLabel(41), "42");
  });

  test("clamps and scales column widths", () => {
    assert.equal(clampTableGridColumnWidth(20), 72);
    assert.equal(clampTableGridColumnWidth(200), 200);
    assert.equal(clampTableGridColumnWidth(900), 640);
    assert.equal(getTableGridZoomScale(0), 1);
    assert.equal(getTableGridZoomScale(10), 0.25);
    assert.equal(getTableGridZoomScale(150), 1.5);
    assert.equal(getTableGridRowHeight(150), 42);
  });

  test("resizes logical column widths independent of zoom", () => {
    assert.equal(resizeTableGridColumnWidth(240, 60, 150), 280);
    assert.equal(resizeTableGridColumnWidth(240, -1_000, 100), 72);
    assert.equal(resizeTableGridColumnWidth(240, 1_000, 50), 640);
  });
});
