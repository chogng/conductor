/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  cloneTemplateApplyConfig,
  normalizeTemplateApplyConfigRecord,
} from "src/cs/workbench/services/template/common/templateApplyConfigUtils";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/common/templateApplyConfigUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("template apply config keeps empty X end as the default end sentinel", () => {
    assert.equal(
      cloneTemplateApplyConfig({ xDataStart: "D5", xDataEnd: "" }).xDataEnd,
      "",
    );
    assert.equal(
      normalizeTemplateApplyConfigRecord({ xDataStart: "D5", xDataEnd: "" }).xDataEnd,
      "",
    );
  });

  test("template apply config preserves explicit X end cells", () => {
    assert.equal(
      cloneTemplateApplyConfig({ xDataStart: "D5", xDataEnd: "D20" }).xDataEnd,
      "D20",
    );
  });

  test("template apply config normalizes End keyword to empty", () => {
    assert.equal(
      cloneTemplateApplyConfig({ xDataStart: "D5", xDataEnd: "end" }).xDataEnd,
      "",
    );
  });

  test("template apply config derives X columns without storing an XY mode", () => {
    const oneYColumn = normalizeTemplateApplyConfigRecord({
      xDataStart: "D5",
      yColumns: [4],
    });
    assert.deepEqual(oneYColumn.xColumns, [3]);

    const multipleYColumns = normalizeTemplateApplyConfigRecord({
      xDataStart: "D5",
      yColumns: [4, 5],
    });
    assert.deepEqual(multipleYColumns.xColumns, [3]);
    assert.deepEqual(multipleYColumns.yColumns, [4, 5]);
  });
});
