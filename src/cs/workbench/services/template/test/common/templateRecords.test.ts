/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { filterUserTemplateRecords } from "src/cs/workbench/services/template/common/templateRecords";

suite("workbench/services/template/common/templateRecords", () => {
  test("template records keep only user templates", () => {
    assert.deepEqual(
      filterUserTemplateRecords([
        { id: "__auto__", name: "Auto extraction" },
        { id: "tpl-1", name: "User template" },
        null,
        "invalid",
      ]),
      [{ id: "tpl-1", name: "User template" }],
    );
  });
});
