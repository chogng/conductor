import assert from "node:assert/strict";
import test from "node:test";

import {
  areTableSelectionsEqual,
  normalizeTableSelection,
} from "../common/selection.ts";

test("table selection equality accepts normalized duplicates", () => {
  const first = normalizeTableSelection({
    activeCell: {
      colIndex: 2.9,
      fileId: "file",
      rowIndex: 1.2,
      sheetId: "sheet",
    },
    ranges: [{
      endCol: 3,
      endRow: 2,
      fileId: "file",
      sheetId: "sheet",
      startCol: 1,
      startRow: 5,
    }],
    selectedColumns: [3, 1, 3],
  });
  const second = normalizeTableSelection({
    activeCell: {
      colIndex: 2,
      fileId: "file",
      rowIndex: 1,
      sheetId: "sheet",
    },
    ranges: [{
      endCol: 3,
      endRow: 5,
      fileId: "file",
      sheetId: "sheet",
      startCol: 1,
      startRow: 2,
    }],
    selectedColumns: [1, 3],
  });
  assert.equal(areTableSelectionsEqual(first, second), true);
});

test("table selection equality detects active cell changes", () => {
  const first = normalizeTableSelection({
    activeCell: {
      colIndex: 2,
      fileId: "file",
      rowIndex: 1,
      sheetId: "sheet",
    },
    selectedColumns: [1, 3],
  });
  const second = normalizeTableSelection({
    activeCell: {
      colIndex: 4,
      fileId: "file",
      rowIndex: 1,
      sheetId: "sheet",
    },
    selectedColumns: [1, 3],
  });
  assert.equal(areTableSelectionsEqual(first, second), false);
});
