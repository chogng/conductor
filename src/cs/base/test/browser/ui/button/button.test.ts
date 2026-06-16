import assert from "assert";

import {
  createButton,
  getButtonClassName,
  getButtonContentClassName,
  updateButton,
} from "../../../../browser/ui/button/button.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/button/button", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getButtonClassName combines size, variant and state classes", () => {
    assert.equal(
      getButtonClassName({
        className: "extra",
        disabled: false,
        fullWidth: true,
        size: "lg",
        variant: "secondary",
      }),
      "action-btn action-btn--lg action-btn--secondary action-btn--full extra",
    );

    assert.equal(
      getButtonClassName({
        disabled: true,
        fullWidth: false,
        size: "icon",
        variant: "icon",
      }),
      "action-btn action-btn--icon-size action-btn--icon-disabled",
    );
  });

  test("getButtonContentClassName appends caller content class", () => {
    assert.equal(getButtonContentClassName(), "action-btn__content");
    assert.equal(getButtonContentClassName("label"), "action-btn__content label");
  });

  test("createButton renders real DOM content and attributes", () => {
    const button = createButton({
      ariaLabel: "Import files",
      content: "Import",
      dataIcon: "download",
      size: "lg",
      variant: "secondary",
    });

    assert.equal(button.tagName, "BUTTON");
    assert.equal(button.type, "button");
    assert.equal(button.getAttribute("aria-label"), "Import files");
    assert.equal(button.getAttribute("data-icon"), "download");
    assert.ok(button.className.includes("action-btn--lg"));
    assert.ok(button.className.includes("action-btn--secondary"));
    assert.equal(button.textContent, "Import");
  });

  test("createButton keeps native title only for buttons without visible text", () => {
    const textButton = createButton({
      content: "Import",
      title: "Import",
      variant: "primary",
    });
    assert.equal(textButton.getAttribute("title"), null);

    const iconButton = createButton({
      ariaLabel: "Import",
      content: document.createElement("span"),
      title: "Import",
      variant: "icon",
    });
    assert.equal(iconButton.getAttribute("title"), "Import");
  });

  test("updateButton replaces stale content and removes transient labels", () => {
    const button = createButton({
      ariaLabel: "Before",
      content: "Before",
      title: "Before",
      variant: "primary",
    });

    updateButton(button, {
      content: "After",
      disabled: true,
      title: "After",
      variant: "primary",
    });

    assert.equal(button.getAttribute("aria-label"), null);
    assert.equal(button.getAttribute("title"), null);
    assert.equal(button.textContent, "After");
    assert.equal(button.disabled, true);
    assert.ok(button.className.includes("action-btn--disabled"));
  });
});
