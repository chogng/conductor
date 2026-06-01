import test from "node:test";
import assert from "node:assert/strict";
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX,
} from "./layout.ts";

test("sidebar width is fixed at 300px", () => {
  assert.equal(SIDEBAR_MIN_WIDTH_PX, 300);
  assert.equal(SIDEBAR_DEFAULT_WIDTH_PX, 300);
  assert.equal(SIDEBAR_MAX_WIDTH_PX, 300);
});

test("template icon-only threshold stays below the fixed sidebar width", () => {
  assert.ok(TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX < SIDEBAR_DEFAULT_WIDTH_PX);
});
