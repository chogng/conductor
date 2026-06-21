import assert from "assert";

import {
  VirtualTableGridModel,
} from "src/cs/base/browser/ui/table/virtualTable";
import {
  TableColumnLayout,
  toStoredTableColumnLayout,
  toTableColumnWidths,
} from "src/cs/workbench/services/table/common/tableColumnLayout";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/table/browser/tableWidget grid model", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("defines widget column width bounds", () => {
    assert.equal(TableColumnLayout.defaultWidth, 160);
    assert.equal(TableColumnLayout.minWidth, 0);
    assert.equal(TableColumnLayout.maxWidth, 640);
  });

  test("clamps and rounds widget column widths", () => {
    assert.equal(TableColumnLayout.clampWidth(-20), 0);
    assert.equal(TableColumnLayout.clampWidth(20), 20);
    assert.equal(TableColumnLayout.clampWidth(20.4), 20);
    assert.equal(TableColumnLayout.clampWidth(20.5), 21);
    assert.equal(TableColumnLayout.clampWidth(900), 640);
  });

  test("normalizes non-finite widget column widths", () => {
    assert.equal(TableColumnLayout.clampWidth(Number.NaN), 0);
    assert.equal(TableColumnLayout.clampWidth(Number.POSITIVE_INFINITY), 640);
    assert.equal(TableColumnLayout.clampWidth(Number.NEGATIVE_INFINITY), 0);
  });

  test("serializes table column width storage", () => {
    assert.deepEqual(toStoredTableColumnLayout([
      { colIndex: 2, width: 243.6 },
      { colIndex: 1, width: -12 },
    ]), {
      version: 1,
      widths: {
        "1": 0,
        "2": 244,
      },
    });
  });

  test("restores table column widths from storage", () => {
    assert.deepEqual(toTableColumnWidths({
      version: 1,
      widths: {
        "2": 243.6,
        invalid: 120,
        "1": -12,
      },
    }), [
      { colIndex: 1, width: 0 },
      { colIndex: 2, width: 244 },
    ]);
  });

  test("resolves bounded render ranges", () => {
    assert.deepEqual(VirtualTableGridModel.resolveRange({
      totalCount: 500,
      startIndex: 20,
      maxRenderedCount: 80,
    }), {
      totalCount: 500,
      startIndex: 20,
      endIndex: 100,
      renderedCount: 80,
    });

    assert.deepEqual(VirtualTableGridModel.resolveRange({
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
    assert.deepEqual(VirtualTableGridModel.resolveRange({
      totalCount: -1,
      startIndex: 10,
      maxRenderedCount: 80,
    }), {
      totalCount: 0,
      startIndex: 0,
      endIndex: 0,
      renderedCount: 0,
    });

    assert.deepEqual(VirtualTableGridModel.resolveRange({
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
    assert.deepEqual(VirtualTableGridModel.resolveViewportRange({
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
    assert.deepEqual(VirtualTableGridModel.resolveViewportRange({
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
    assert.deepEqual(VirtualTableGridModel.getSpacerHeights({
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

    assert.deepEqual(VirtualTableGridModel.resolveColumnViewportRange({
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
    assert.deepEqual(VirtualTableGridModel.resolveColumnViewportRange({
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

  test("extends narrow tables with bounded virtual display columns", () => {
    assert.equal(VirtualTableGridModel.resolveDisplayColumnCount({
      totalCount: 3,
      viewportWidth: 500,
      zoomPercent: 100,
      maxDisplayedCount: 8,
      overscanCount: 1,
      getColumnWidth: () => 160,
    }), 5);
    assert.equal(VirtualTableGridModel.resolveDisplayColumnCount({
      totalCount: 3,
      viewportWidth: 120,
      zoomPercent: 100,
      maxDisplayedCount: 8,
      overscanCount: 1,
      getColumnWidth: () => 160,
    }), 3);
    assert.equal(VirtualTableGridModel.resolveDisplayColumnCount({
      totalCount: 20,
      viewportWidth: 4_000,
      zoomPercent: 100,
      maxDisplayedCount: 8,
      overscanCount: 1,
      getColumnWidth: () => 160,
    }), 20);
  });

  test("resolves arrow keyboard targets", () => {
    assert.deepEqual(VirtualTableGridModel.resolveKeyboardTarget({
      rowCount: 10,
      columnCount: 5,
      currentCell: { rowIndex: 3, colIndex: 2 },
      key: "ArrowDown",
    }), { rowIndex: 4, colIndex: 2 });

    assert.deepEqual(VirtualTableGridModel.resolveKeyboardTarget({
      rowCount: 10,
      columnCount: 5,
      currentCell: { rowIndex: 0, colIndex: 0 },
      key: "ArrowLeft",
    }), { rowIndex: 0, colIndex: 0 });
  });

  test("resolves page and edge keyboard targets", () => {
    assert.deepEqual(VirtualTableGridModel.resolveKeyboardTarget({
      rowCount: 100,
      columnCount: 5,
      currentCell: { rowIndex: 20, colIndex: 2 },
      key: "PageDown",
      pageRowCount: 12,
    }), { rowIndex: 32, colIndex: 2 });

    assert.deepEqual(VirtualTableGridModel.resolveKeyboardTarget({
      rowCount: 100,
      columnCount: 5,
      currentCell: { rowIndex: 20, colIndex: 2 },
      key: "Home",
    }), { rowIndex: 20, colIndex: 0 });

    assert.deepEqual(VirtualTableGridModel.resolveKeyboardTarget({
      rowCount: 100,
      columnCount: 5,
      currentCell: { rowIndex: 20, colIndex: 2 },
      key: "End",
      toBoundary: true,
    }), { rowIndex: 99, colIndex: 4 });
  });

  test("rejects keyboard targets for empty tables or unsupported keys", () => {
    assert.equal(VirtualTableGridModel.resolveKeyboardTarget({
      rowCount: 0,
      columnCount: 5,
      key: "ArrowDown",
    }), null);

    assert.equal(VirtualTableGridModel.resolveKeyboardTarget({
      rowCount: 10,
      columnCount: 5,
      key: "Escape",
    }), null);
  });

  test("resolves normalized cell ranges", () => {
    assert.deepEqual(VirtualTableGridModel.resolveCellRange(
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
    assert.equal(VirtualTableGridModel.getColumnLabel(0), "A");
    assert.equal(VirtualTableGridModel.getColumnLabel(25), "Z");
    assert.equal(VirtualTableGridModel.getColumnLabel(26), "AA");
    assert.equal(VirtualTableGridModel.getColumnLabel(701), "ZZ");
    assert.equal(VirtualTableGridModel.getRowLabel(0), "1");
    assert.equal(VirtualTableGridModel.getRowLabel(41), "42");
  });

  test("scales grid metrics", () => {
    assert.equal(VirtualTableGridModel.getZoomScale(0), 1);
    assert.equal(VirtualTableGridModel.getZoomScale(10), 0.25);
    assert.equal(VirtualTableGridModel.getZoomScale(150), 1.5);
    assert.equal(VirtualTableGridModel.getRowHeight(150), 42);
  });

  test("resizes logical column widths independent of zoom", () => {
    assert.equal(VirtualTableGridModel.resizeColumnWidth(240, 60, 150), 280);
    assert.equal(VirtualTableGridModel.resizeColumnWidth(240, -1_000, 100), 0);
    assert.equal(VirtualTableGridModel.resizeColumnWidth(240, 1_000, 50), 640);
  });

  test("resolves column resize targets from pointer input", () => {
    const columnRange = {
      startIndex: 3,
      renderedCount: 4,
      leadingWidth: 240,
    };
    const getColumnWidth = () => 80;

    assert.equal(VirtualTableGridModel.resolveColumnResizeTarget({
      button: 0,
      clientX: 548,
      columnRange,
      containerLeft: 100,
      getColumnWidth,
      scrollLeft: 0,
      zoomPercent: 100,
    }), 4);
    assert.equal(VirtualTableGridModel.resolveColumnResizeTarget({
      button: 1,
      clientX: 548,
      columnRange,
      containerLeft: 100,
      getColumnWidth,
      scrollLeft: 0,
      zoomPercent: 100,
    }), null);
    assert.equal(VirtualTableGridModel.resolveColumnResizeTarget({
      button: 0,
      clientX: 700,
      columnRange,
      containerLeft: 100,
      getColumnWidth,
      hitSlop: 4,
      scrollLeft: 0,
      zoomPercent: 100,
    }), null);
  });

  test("prefers the later column when zero-width resize boundaries overlap", () => {
    const widths = [160, 0, 120];

    assert.equal(VirtualTableGridModel.resolveColumnResizeTarget({
      button: 0,
      clientX: 308,
      columnRange: {
        startIndex: 0,
        renderedCount: 3,
        leadingWidth: 0,
      },
      containerLeft: 100,
      getColumnWidth: colIndex => widths[colIndex] ?? 80,
      scrollLeft: 0,
      zoomPercent: 100,
    }), 1);
  });

  test("resolves active column resize guide positions", () => {
    const columnRange = {
      startIndex: 2,
      renderedCount: 3,
      leadingWidth: 220,
    };

    assert.equal(VirtualTableGridModel.resolveColumnResizeGuideLeft({
      colIndex: 3,
      columnRange,
      getColumnWidth: colIndex => colIndex === 2 ? 100 : 80,
      scrollLeft: 30,
      zoomPercent: 100,
    }), 418);
    assert.equal(VirtualTableGridModel.resolveColumnResizeGuideLeft({
      colIndex: 3,
      columnRange,
      getColumnWidth: () => 100,
      scrollLeft: 0,
      visible: false,
      zoomPercent: 100,
    }), null);
    assert.equal(VirtualTableGridModel.resolveColumnResizeGuideLeft({
      colIndex: 5,
      columnRange,
      getColumnWidth: () => 100,
      scrollLeft: 0,
      zoomPercent: 100,
    }), null);
    assert.equal(VirtualTableGridModel.resolveColumnResizeGuideLeft({
      colIndex: null,
      columnRange,
      getColumnWidth: () => 100,
      scrollLeft: 0,
      zoomPercent: 100,
    }), null);
    assert.equal(VirtualTableGridModel.getRowHeaderWidth(150), 72);
  });

  test("resolves column resize drag guide positions from the locked boundary", () => {
    assert.equal(VirtualTableGridModel.resolveColumnResizeDragGuideLeft({
      startGuideLeft: 300,
      startWidth: 160,
      width: 220,
      zoomPercent: 100,
    }), 360);
    assert.equal(VirtualTableGridModel.resolveColumnResizeDragGuideLeft({
      startGuideLeft: 300,
      startWidth: 160,
      width: 220,
      zoomPercent: 150,
    }), 390);
    assert.equal(VirtualTableGridModel.resolveColumnResizeDragGuideLeft({
      startGuideLeft: 300,
      startWidth: 160,
      width: -20,
      zoomPercent: 100,
    }), 140);
    assert.equal(VirtualTableGridModel.resolveColumnResizeDragGuideLeft({
      startGuideLeft: 300,
      startWidth: 160,
      width: 220,
      visible: false,
      zoomPercent: 100,
    }), null);
  });

  test("base virtual table model resolves bounded viewport ranges", () => {
    assert.deepEqual(VirtualTableGridModel.resolveViewportRange({
      totalCount: 100,
      maxRenderedCount: 4,
      rowHeight: 28,
      scrollTop: 28 * 20,
      viewportHeight: 56,
    }), {
      totalCount: 100,
      startIndex: 12,
      endIndex: 16,
      renderedCount: 4,
    });
  });

  test("base virtual table model keeps logical columns beyond the pooled count", () => {
    assert.equal(VirtualTableGridModel.resolveDisplayColumnCount({
      totalCount: 20,
      viewportWidth: 4_000,
      zoomPercent: 100,
      maxDisplayedCount: 8,
      overscanCount: 1,
      getColumnWidth: () => 160,
    }), 20);
    assert.equal(VirtualTableGridModel.resolveDisplayColumnCount({
      totalCount: 3,
      viewportWidth: 500,
      zoomPercent: 100,
      maxDisplayedCount: 8,
      overscanCount: 1,
      getColumnWidth: () => 160,
    }), 5);
  });
});
