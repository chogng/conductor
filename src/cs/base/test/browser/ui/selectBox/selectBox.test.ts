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
});
