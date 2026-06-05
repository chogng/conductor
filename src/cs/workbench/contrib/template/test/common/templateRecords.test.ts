import assert from "assert";

import { filterUserTemplateRecords } from "../../common/templateRecords.ts";

suite("workbench/contrib/template/test/common/templateRecords", () => {
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
