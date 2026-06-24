/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  cloneTemplateEditorConfig,
  normalizeTemplateEditorConfigRecord,
} from "src/cs/workbench/services/template/common/templateEditorConfig";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/common/templateEditorConfig", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("template editor config keeps empty X end as the default end sentinel", () => {
    assert.equal(
      cloneTemplateEditorConfig({ xDataStart: "D5", xDataEnd: "" }).xDataEnd,
      "",
    );
    assert.equal(
      normalizeTemplateEditorConfigRecord({ xDataStart: "D5", xDataEnd: "" }).xDataEnd,
      "",
    );
  });

  test("template editor config preserves explicit X end cells", () => {
    assert.equal(
      cloneTemplateEditorConfig({ xDataStart: "D5", xDataEnd: "D20" }).xDataEnd,
      "D20",
    );
  });

  test("template editor config normalizes End keyword to empty", () => {
    assert.equal(
      cloneTemplateEditorConfig({ xDataStart: "D5", xDataEnd: "end" }).xDataEnd,
      "",
    );
  });

  test("template editor config derives X columns without storing an XY mode", () => {
    const oneYColumn = normalizeTemplateEditorConfigRecord({
      xDataStart: "D5",
      yColumns: [4],
    });
    assert.deepEqual(oneYColumn.xColumns, [3]);

    const multipleYColumns = normalizeTemplateEditorConfigRecord({
      xDataStart: "D5",
      yColumns: [4, 5],
    });
    assert.deepEqual(multipleYColumns.xColumns, [3]);
    assert.deepEqual(multipleYColumns.yColumns, [4, 5]);
  });
});
