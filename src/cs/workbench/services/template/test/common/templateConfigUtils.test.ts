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
});
