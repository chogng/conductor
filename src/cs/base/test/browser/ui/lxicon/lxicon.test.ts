import assert from "assert";

import { createLxIcon } from "../../../../browser/ui/lxicon/lxicon.ts";
import { LxIcon } from "../../../../common/lxicon.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/lxicon/lxicon", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("createLxIcon owns icon markup, sizing and accessibility", () => {
    const icon = createLxIcon({
      className: "test-icon",
      icon: LxIcon.check,
      size: 20,
      style: { color: "red" },
    });
    const svg = icon.firstElementChild;

    assert.deepEqual({
      ariaHidden: svg?.getAttribute("aria-hidden"),
      className: icon.className,
      color: icon.style.color,
      focusable: svg?.getAttribute("focusable"),
      height: icon.style.height,
      stroke: svg?.querySelector("path")?.getAttribute("stroke"),
      svgHeight: svg?.getAttribute("height"),
      svgName: svg?.localName,
      svgWidth: svg?.getAttribute("width"),
      width: icon.style.width,
    }, {
      ariaHidden: "true",
      className: "ui-lxicon test-icon",
      color: "red",
      focusable: "false",
      height: "20px",
      stroke: "currentColor",
      svgHeight: "100%",
      svgName: "svg",
      svgWidth: "100%",
      width: "20px",
    });
  });
});
