import assert from "assert";

import {
  createToggle,
  getToggleClassName,
  getToggleDataAttributes,
  setToggleChecked,
} from "../../../../browser/ui/toggle/toggle.ts";

suite("base/test/browser/ui/toggle/toggle", () => {
  test("getToggleClassName combines size and caller class", () => {
    assert.equal(getToggleClassName(), "ui-toggle ui-toggle--md");
    assert.equal(getToggleClassName({ className: "extra", size: "sm" }), "ui-toggle ui-toggle--sm extra");
  });

  test("getToggleDataAttributes exposes checked state", () => {
    assert.deepEqual(getToggleDataAttributes({ checked: true }), {
      "data-state": "checked",
      "data-testid": undefined,
    });
    assert.deepEqual(getToggleDataAttributes({ checked: false }), {
      "data-state": "unchecked",
      "data-testid": undefined,
    });
  });

  test("setToggleChecked updates pressed and data state", () => {
    const attributes = new Map<string, string>();
    const button = {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    } as unknown as HTMLButtonElement;

    setToggleChecked(button, true);
    assert.equal(attributes.get("aria-pressed"), "true");
    assert.equal(attributes.get("data-state"), "checked");

    setToggleChecked(button, false);
    assert.equal(attributes.get("aria-pressed"), "false");
    assert.equal(attributes.get("data-state"), "unchecked");
  });

  test("createToggle updates state through real click events", () => {
    const seen: boolean[] = [];
    const button = createToggle({
      checked: false,
      label: "Pin",
      onToggle: (checked) => seen.push(checked),
    });

    button.click();
    button.click();

    assert.equal(button.textContent, "Pin");
    assert.equal(button.getAttribute("aria-pressed"), "false");
    assert.equal(button.getAttribute("data-state"), "unchecked");
    assert.equal(seen.length, 2);
    assert.equal(seen[0], true);
    assert.equal(seen[1], false);
  });
});
