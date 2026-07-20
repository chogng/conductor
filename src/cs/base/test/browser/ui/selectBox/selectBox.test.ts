import assert from "assert";

import { SelectBox } from "../../../../browser/ui/selectBox/selectBox.ts";
import { EventType } from "src/cs/base/browser/dom";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/selectBox/selectBox", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();

  test("applies custom dropdown z-index to the opened context view", () => {
    const select = disposables.add(new SelectBox({
      dropdownZIndex: 70,
      options: [{ label: "Template 1", value: "template-1" }],
      value: "template-1",
    }));
    document.body.append(select.domNode);

    try {
      select.domNode.click();

      const dropdown = document.body.querySelector<HTMLElement>(".context-view.ui-selectbox__dropdown");
      assert.ok(dropdown);
      assert.equal(dropdown.style.zIndex, "70");
    } finally {
      select.hide();
      select.domNode.remove();
    }
  });

  test("owns its selected value and emits only changed selections", () => {
    const select = disposables.add(new SelectBox({
      options: [
        { label: "Template 1", value: "template-1" },
        { label: "Template 2", value: "template-2" },
      ],
      value: "template-1",
    }));
    const selected: string[] = [];
    const listener = select.onDidSelect(value => selected.push(value));
    document.body.append(select.domNode);

    try {
      select.domNode.click();
      const option = document.body.querySelectorAll<HTMLButtonElement>(".ui-selectbox__option")[1];
      option.dispatchEvent(new MouseEvent(EventType.CLICK, { bubbles: true }));

      assert.deepEqual(selected, ["template-2"]);
      assert.equal(select.domNode.querySelector(".ui-selectbox__label")?.textContent, "Template 2");

      select.domNode.click();
      document.body.querySelectorAll<HTMLButtonElement>(".ui-selectbox__option")[1]
        .dispatchEvent(new MouseEvent(EventType.CLICK, { bubbles: true }));

      assert.deepEqual(selected, ["template-2"]);

      select.select("template-1");
      assert.equal(select.domNode.querySelector(".ui-selectbox__label")?.textContent, "Template 1");
      assert.deepEqual(selected, ["template-2"]);
    } finally {
      listener.dispose();
      select.hide();
      select.domNode.remove();
    }
  });

  test("synchronizes replaced options and closes when disabled", () => {
    const select = disposables.add(new SelectBox<string>({
      options: [
        { label: "Template 1", value: "template-1" },
        { label: "Template 2", value: "template-2" },
      ],
      value: "template-1",
    }));
    const selected: string[] = [];
    const listener = select.onDidSelect(value => selected.push(value));
    document.body.append(select.domNode);

    try {
      select.domNode.click();
      select.setOptions([
        { label: "Template 3", value: "template-3" },
        { label: "Template 4", value: "template-4" },
      ], "template-3");

      const option = document.body.querySelector<HTMLButtonElement>(".ui-selectbox__option.selected");
      assert.ok(option);
      assert.equal(option.textContent, "Template 3");
      assert.equal(option.getAttribute("aria-selected"), "true");
      assert.equal(select.domNode.querySelector(".ui-selectbox__label")?.textContent, "Template 3");

      document.body.querySelectorAll<HTMLButtonElement>(".ui-selectbox__option")[1]
        .dispatchEvent(new MouseEvent(EventType.CLICK, { bubbles: true }));
      assert.deepEqual(selected, ["template-4"]);

      select.domNode.click();
      select.setEnabled(false);
      assert.equal(select.domNode.disabled, true);
      assert.equal(select.domNode.getAttribute("aria-expanded"), "false");

      select.setEnabled(true);
      assert.equal(select.domNode.disabled, false);
      select.domNode.click();
      assert.equal(document.body.querySelectorAll(".ui-selectbox__option").length, 2);
    } finally {
      listener.dispose();
      select.hide();
      select.domNode.remove();
    }
  });
});
