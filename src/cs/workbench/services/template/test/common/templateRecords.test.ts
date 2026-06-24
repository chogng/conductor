/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { filterUserTemplateApplyPresetRecords } from "src/cs/workbench/services/template/common/templateRecords";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/common/templateRecords", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("template records keep only user apply presets", () => {
    assert.deepEqual(
      filterUserTemplateApplyPresetRecords([
        { id: "__auto__", name: "Recommended template" },
        { id: "tpl-1", name: "User template" },
        null,
        "invalid",
      ]),
      [{ id: "tpl-1", name: "User template" }],
    );
  });
});
