import assert from "assert";

import {
  createCheckbox,
  getCheckboxAriaAttributes,
  getCheckboxClassName,
  updateCheckbox,
} from "../../../../browser/ui/checkbox/checkbox.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/checkbox/checkbox", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getCheckboxClassName combines size, checked state and caller classes", () => {
    assert.equal(getCheckboxClassName(), "ui-checkbox ui-checkbox--sm");
    assert.equal(
      getCheckboxClassName({ checked: true, className: "extra", size: "lg" }),
      "ui-checkbox ui-checkbox--lg checked extra",
    );
  });

  test("getCheckboxAriaAttributes distinguishes decorative and interactive usage", () => {
    assert.deepEqual(getCheckboxAriaAttributes({ checked: true, decorative: true }), {
      "aria-hidden": true,
    });
    assert.deepEqual(getCheckboxAriaAttributes({ checked: true, decorative: false }), {
      role: "checkbox",
      "aria-checked": true,
    });
  });

  test("createCheckbox owns checked icon rendering", () => {
    const checkbox = createCheckbox("span", {
      checked: true,
      iconClassName: "icon",
      iconSize: 12,
    });
    const icon = checkbox.firstElementChild as HTMLElement | null;
    const svg = icon?.firstElementChild;
    const checkedState = {
      iconClassName: icon?.className,
      iconHeight: icon?.style.height,
      iconWidth: icon?.style.width,
      stroke: svg?.querySelector("path")?.getAttribute("stroke"),
      svgName: svg?.localName,
    };

    updateCheckbox(checkbox, { checked: false });

    assert.deepEqual({
      checkedState,
      uncheckedChildCount: checkbox.childElementCount,
    }, {
      checkedState: {
        iconClassName: "ui-lxicon icon",
        iconHeight: "12px",
        iconWidth: "12px",
        stroke: "currentColor",
        svgName: "svg",
      },
      uncheckedChildCount: 0,
    });
  });
});
