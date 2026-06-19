import assert from "assert";

import { TabView, type TabViewContent } from "src/cs/base/browser/ui/tab/tabView";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type TestTabId = "first" | "second";

suite("base/browser/ui/tab/tabView", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("keeps active panel view mounted when active tab is unchanged", () => {
    const tabView = new TestTabView({
      activeTabId: "first",
      tabs: [
        { id: "first", label: "First" },
        { id: "second", label: "Second" },
      ],
    });
    const panel = tabView.element.querySelector(".tab_view_panel") as HTMLElement;
    const firstPanelChild = panel.firstElementChild;
    const originalReplaceChildren = panel.replaceChildren.bind(panel);
    let replaceCalls = 0;
    panel.replaceChildren = (...children) => {
      replaceCalls++;
      originalReplaceChildren(...children);
    };

    tabView.update({
      activeTabId: "first",
      tabs: [
        { id: "first", label: "First" },
        { id: "second", label: "Second" },
      ],
    });

    assert.equal(replaceCalls, 0);
    assert.equal(panel.firstElementChild, firstPanelChild);

    tabView.setActiveTab("second");

    assert.equal(replaceCalls, 1);
    assert.ok(panel.firstElementChild !== firstPanelChild);
    tabView.dispose();
  });
});

class TestTabView extends TabView<TestTabId> {
  protected createView(tabId: TestTabId): TabViewContent {
    const element = document.createElement("div");
    element.dataset.tabId = tabId;
    return {
      element,
      dispose: () => {
        element.remove();
      },
    };
  }
}
