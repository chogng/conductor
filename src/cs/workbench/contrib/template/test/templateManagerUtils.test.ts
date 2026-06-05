import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneTemplateConfig,
  normalizeTemplateConfigRecord,
} from "../common/templateManagerUtils.ts";

test("template config defaults empty X end to End when X start is set", () => {
  assert.equal(
    cloneTemplateConfig({ xDataStart: "D5", xDataEnd: "" }).xDataEnd,
    "End",
  );
  assert.equal(
    normalizeTemplateConfigRecord({ xDataStart: "D5", xDataEnd: "" }).xDataEnd,
    "End",
  );
});

test("template config preserves explicit X end values", () => {
  assert.equal(
    cloneTemplateConfig({ xDataStart: "D5", xDataEnd: "D20" }).xDataEnd,
    "D20",
  );
  assert.equal(
    cloneTemplateConfig({ xDataStart: "D5", xDataEnd: "end" }).xDataEnd,
    "End",
  );
});
