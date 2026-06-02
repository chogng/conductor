import test from "node:test";
import assert from "node:assert/strict";

import { filterUserTemplateRecords } from "../common/templateRecords.ts";

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
