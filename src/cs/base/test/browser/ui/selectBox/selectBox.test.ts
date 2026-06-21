import assert from "assert";

import { SelectBox } from "../../../../browser/ui/selectBox/selectBox.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/selectBox/selectBox", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();

  test("applies custom dropdown z-index to the opened context view", () => {
    const select = disposables.add(new SelectBox({
      dropdownZIndex: 70,
      onDidSelect: () => undefined,
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
});
