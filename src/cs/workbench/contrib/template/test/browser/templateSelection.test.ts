import assert from "assert";

import type { TemplateConfig } from "../../common/templateManagerUtils.ts";
import {
  areTableCellsEqual,
  areColumnIndexesEqual,
  normalizeColumnIndexes,
  resolveTemplateCellSelection,
  resolveTemplateCellSelectionUpdate,
  resolveTemplateColumnSelectionUpdate,
  toColumnLabel,
} from "../../browser/templateSelection.ts";

suite("workbench/contrib/template/test/browser/templateSelection", () => {
  test("template selection normalizes and labels columns", () => {
    assert.deepEqual(normalizeColumnIndexes([2.9, 0, 2, -1, Number.NaN, 1]), [0, 1, 2]);
    assert.equal(areColumnIndexesEqual([2, 0, 2], [0, 2]), true);
    assert.equal(toColumnLabel(0), "A");
    assert.equal(toColumnLabel(25), "Z");
    assert.equal(toColumnLabel(26), "AA");
  });

  test("template selection compares active cells", () => {
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

  test("template selection resolves column updates", () => {
    assert.deepEqual(
      resolveTemplateColumnSelectionUpdate({
        selectedColumns: [4, 3, 4],
        activeCell: { rowIndex: 3, colIndex: 3 },
      }),
      {
        yColumns: [3, 4],
      },
    );

    assert.deepEqual(
      resolveTemplateColumnSelectionUpdate({}),
      {
        yColumns: [],
      },
    );
  });

  test("template selection resolves active cell updates", () => {
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
        { rowIndex: 5, colIndex: 4 },
        null,
      ),
      {},
    );
  });

  test("template selection resolves focused field back to active cell", () => {
    const config: TemplateConfig = {
      bottomTitle: "",
      leftTitle: "",
      legendPrefix: "",
      name: "",
      stopOnError: false,
      xDataEnd: "End",
      xDataStart: "B3",
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
