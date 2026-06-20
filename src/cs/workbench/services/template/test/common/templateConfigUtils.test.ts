/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  cloneTemplateConfig,
  normalizeTemplateConfigRecord,
} from "src/cs/workbench/services/template/common/templateConfigUtils";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/common/templateConfigUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("template config keeps empty X end as the default end sentinel", () => {
    assert.equal(
      cloneTemplateConfig({ xDataStart: "D5", xDataEnd: "" }).xDataEnd,
      "",
    );
    assert.equal(
      normalizeTemplateConfigRecord({ xDataStart: "D5", xDataEnd: "" }).xDataEnd,
      "",
    );
  });

  test("template config preserves explicit X end cells", () => {
    assert.equal(
      cloneTemplateConfig({ xDataStart: "D5", xDataEnd: "D20" }).xDataEnd,
      "D20",
    );
  });

  test("template config normalizes legacy End keyword to empty", () => {
    assert.equal(
      cloneTemplateConfig({ xDataStart: "D5", xDataEnd: "end" }).xDataEnd,
      "",
    );
  });

  test("template config derives legacy X columns without storing an XY mode", () => {
    const oneYColumn = normalizeTemplateConfigRecord({
      xDataStart: "D5",
      yColumns: [4],
    });
    assert.deepEqual(oneYColumn.xColumns, [3]);

    const multipleYColumns = normalizeTemplateConfigRecord({
      xDataStart: "D5",
      yColumns: [4, 5],
    });
    assert.deepEqual(multipleYColumns.xColumns, [3]);
    assert.deepEqual(multipleYColumns.yColumns, [4, 5]);
  });
});
