import assert from "assert";

import { BrowserQuickInputService } from "src/cs/platform/quickinput/browser/quickInputService";

suite("base/test/browser/platform/quickInputService", () => {
  teardown(() => {
    document.querySelectorAll(".quick-input-overlay").forEach(element => element.remove());
  });

  test("renders all matching quick pick items", async () => {
    const service = new BrowserQuickInputService();
    const items = Array.from({ length: 35 }, (_, index) => {
      const label = `Item ${index + 1}`;
      return {
        id: label,
        label,
      };
    });

    try {
      void service.pick({ items });
      await animationFrames(1);

      const renderedItems = document.querySelectorAll<HTMLElement>(".quick-input-item");
      assert.equal(renderedItems.length, 35);
      assert.equal(renderedItems[34]?.dataset.quickPickItemId, "Item 35");
    } finally {
      service.dispose();
    }
  });
});

const animationFrames = async (count: number): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};
