import assert from "assert";
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX,
} from "./layout.ts";

suite("workbench/browser/layout", () => {
  test("sidebar width can be resized within workbench bounds", () => {
    assert.equal(SIDEBAR_MIN_WIDTH_PX, 220);
    assert.equal(SIDEBAR_DEFAULT_WIDTH_PX, 300);
    assert.equal(SIDEBAR_MAX_WIDTH_PX, 520);
  });

  test("template icon-only threshold stays below the default sidebar width", () => {
    assert.ok(TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX < SIDEBAR_DEFAULT_WIDTH_PX);
  });
});
