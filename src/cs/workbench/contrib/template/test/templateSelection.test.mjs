import test from "node:test";
import assert from "node:assert/strict";

import {
  areColumnIndexesEqual,
  normalizeColumnIndexes,
  resolveTemplateSelectionUpdate,
  toColumnLabel,
} from "../browser/templateSelection.ts";

test("template selection normalizes and labels columns", () => {
  assert.deepEqual(normalizeColumnIndexes([2.9, 0, 2, -1, Number.NaN, 1]), [0, 1, 2]);
  assert.equal(areColumnIndexesEqual([2, 0, 2], [0, 2]), true);
  assert.equal(toColumnLabel(0), "A");
  assert.equal(toColumnLabel(25), "Z");
  assert.equal(toColumnLabel(26), "AA");
});

test("template selection resolves table selection updates", () => {
  assert.deepEqual(
    resolveTemplateSelectionUpdate({
      selectedColumns: [4, 3, 4],
      activeCell: { rowIndex: 3, colIndex: 3 },
    }, "yLegendStart"),
    {
      yColumns: [3, 4],
      yLegendStart: "D4",
    },
  );

  assert.deepEqual(
    resolveTemplateSelectionUpdate({
      activeCell: { rowIndex: 5, colIndex: 4 },
    }, null),
    {},
  );
});
