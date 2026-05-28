import test from "node:test";
import assert from "node:assert/strict";
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX,
} from "../../browser/layoutConstants.ts";

test("sidebar width constants remain in a valid order", () => {
  assert.ok(SIDEBAR_MIN_WIDTH_PX < SIDEBAR_DEFAULT_WIDTH_PX);
  assert.ok(SIDEBAR_DEFAULT_WIDTH_PX < SIDEBAR_MAX_WIDTH_PX);
  assert.ok(
    SIDEBAR_MIN_WIDTH_PX <
      TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX,
  );
  assert.ok(
    TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX <
      SIDEBAR_DEFAULT_WIDTH_PX,
  );
});
