import assert from "assert";
import {
  MAIN_MIN_WIDTH_PX,
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX,
} from "./layout.ts";
import {
  AUXILIARY_BAR_DEFAULT_WIDTH_PX,
  AUXILIARY_BAR_MAX_WIDTH_PX,
  AUXILIARY_BAR_MIN_WIDTH_PX,
} from "./parts/auxiliarybar/auxiliaryBarPart.ts";

suite("workbench/browser/layout", () => {
  test("sidebar width follows workbench part bounds", () => {
    assert.equal(SIDEBAR_MIN_WIDTH_PX, 170);
    assert.equal(SIDEBAR_DEFAULT_WIDTH_PX, 300);
    assert.equal(SIDEBAR_MAX_WIDTH_PX, Number.POSITIVE_INFINITY);
  });

  test("auxiliary bar width follows workbench part bounds", () => {
    assert.equal(AUXILIARY_BAR_MIN_WIDTH_PX, 170);
    assert.equal(AUXILIARY_BAR_DEFAULT_WIDTH_PX, 300);
    assert.equal(AUXILIARY_BAR_MAX_WIDTH_PX, Number.POSITIVE_INFINITY);
  });

  test("main area keeps the upstream editor minimum width", () => {
    assert.equal(MAIN_MIN_WIDTH_PX, 220);
  });

  test("template icon-only threshold stays below the default sidebar width", () => {
    assert.ok(TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX < SIDEBAR_DEFAULT_WIDTH_PX);
  });
});
