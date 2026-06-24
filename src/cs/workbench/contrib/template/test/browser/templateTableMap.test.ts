import assert from "assert";

import { toColumnLabel } from "src/cs/workbench/services/template/common/templateCellRef";
import type { TemplateEditorConfig } from "src/cs/workbench/services/template/common/templateEditorConfig";
import {
  areTableCellsEqual,
  areColumnIndexesEqual,
  normalizeColumnIndexes,
  resolveTemplateCellSelection,
  resolveTemplateCellSelectionUpdate,
  resolveTemplateColumnSelectionUpdate,
  resolveTemplateXRangeSelectionUpdate,
} from "../../browser/templateTableMap.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/template/test/browser/templateTableMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("template table map normalizes and labels columns", () => {
    assert.deepEqual(normalizeColumnIndexes([2.9, 0, 2, -1, Number.NaN, 1]), [2, 0, 1]);
    assert.equal(areColumnIndexesEqual([2, 0, 2], [0, 2]), false);
    assert.equal(toColumnLabel(0), "A");
    assert.equal(toColumnLabel(25), "Z");
    assert.equal(toColumnLabel(26), "AA");
  });

  test("template table map compares active cells", () => {
    assert.equal(areTableCellsEqual(null, undefined), true);
    assert.equal(
      areTableCellsEqual(
        { fileId: "file", sheetId: "sheet", rowIndex: 1, colIndex: 2 },
        { fileId: "file", sheetId: "sheet", rowIndex: 1, colIndex: 2 },
      ),
      true,
    );
    assert.equal(
      areTableCellsEqual(
        { fileId: "file", sheetId: "sheet", rowIndex: 1, colIndex: 2 },
        { fileId: "file", sheetId: "sheet", rowIndex: 1, colIndex: 3 },
      ),
      false,
    );
  });

  test("template table map resolves column updates", () => {
    assert.deepEqual(
      resolveTemplateColumnSelectionUpdate({
        selectedColumns: [4, 3, 4],
        activeCell: { rowIndex: 3, colIndex: 3 },
      }),
      {
        yColumns: [4, 3],
      },
    );

    assert.deepEqual(
      resolveTemplateColumnSelectionUpdate({}),
      {
        yColumns: [],
      },
    );
  });

  test("template table map resolves X range updates", () => {
    assert.deepEqual(
      resolveTemplateXRangeSelectionUpdate({
        ranges: [{
          startRow: 1,
          endRow: 9,
          startCol: 1,
          endCol: 2,
        }],
      }, {
        rowCount: 10,
      }),
      {
        xColumns: [1, 2],
        xDataEnd: "",
        xDataStart: "B2",
        xRanges: [
          { start: "B2", end: "End" },
          { start: "C2", end: "End" },
        ],
      },
    );
  });

  test("template table map resolves active cell updates", () => {
    assert.deepEqual(
      resolveTemplateCellSelectionUpdate(
        { rowIndex: 3, colIndex: 3 },
        "yLegendStart",
      ),
      {
        yLegendStart: "D4",
      },
    );

    assert.deepEqual(
      resolveTemplateCellSelectionUpdate(
        { rowIndex: 0, colIndex: 2 },
        "xPointsPerGroup",
      ),
      {
        xPointsPerGroup: "C1",
      },
    );

    assert.deepEqual(
      resolveTemplateCellSelectionUpdate(
        { rowIndex: 4, colIndex: 5 },
        "xSegmentCount",
      ),
      {
        xSegmentCount: "F5",
      },
    );

    assert.deepEqual(
      resolveTemplateCellSelectionUpdate(
        { rowIndex: 5, colIndex: 4 },
        null,
      ),
      {},
    );
  });

  test("template table map resolves focused field back to active cell", () => {
    const config: TemplateEditorConfig = {
      bottomTitle: "",
      leftTitle: "",
      legendPrefix: "",
      name: "",
      stopOnError: false,
      xColumns: [1],
      xDataEnd: "",
      xDataStart: "B3",
      xRanges: [{ start: "B3", end: "End" }],
      xPointsPerGroup: "",
      xSegmentCount: "",
      xSegmentationMode: "auto",
      xUnit: "V",
      yColumns: [],
      yLegendCount: "",
      yLegendStart: "",
      yLegendStep: "",
      yLegendTarget: "auto",
      yUnit: "A",
    };

    assert.deepEqual(
      resolveTemplateCellSelection(
        config,
        "xDataStart",
        { fileId: "file", sheetId: "sheet", rowIndex: 0, colIndex: 0 },
      ),
      { fileId: "file", sheetId: "sheet", rowIndex: 2, colIndex: 1 },
    );

    assert.deepEqual(
      resolveTemplateCellSelection(
        {
          ...config,
          xSegmentCount: "C1",
        },
        "xSegmentCount",
        { fileId: "file", sheetId: "sheet", rowIndex: 0, colIndex: 0 },
      ),
      { fileId: "file", sheetId: "sheet", rowIndex: 0, colIndex: 2 },
    );

    assert.equal(
      resolveTemplateCellSelection(
        {
          ...config,
          xDataStart: "not-a-cell",
        },
        "xDataStart",
        null,
      ),
      null,
    );
  });
});
