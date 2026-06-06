import assert from "assert";

import {
  getCheckboxAriaAttributes,
  getCheckboxClassName,
  getCheckboxIconMarkup,
} from "../../../../browser/ui/checkbox/checkbox.ts";

suite("base/test/browser/ui/checkbox/checkbox", () => {
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

  test("getCheckboxIconMarkup returns markup only when checked", () => {
    assert.equal(getCheckboxIconMarkup({ checked: false }), "");

    const markup = getCheckboxIconMarkup({
      checked: true,
      iconClassName: "icon",
      iconSize: 12,
    });

    assert.match(markup, /^<span class="icon" aria-hidden="true">/);
    assert.match(markup, /width="12"/);
    assert.match(markup, /height="12"/);
    assert.match(markup, /currentColor/);
  });
});
