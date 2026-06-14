import assert from "assert";

import { Layout } from "../../../../workbench/browser/layout.ts";

suite("workbench/browser/layout", () => {
  test("keeps overlay child mounted when non-overlay parts change", async () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const layout = new Layout(parent);

    try {
      const overlay = document.createElement("div");
      const firstController = document.createElement("div");
      layout.setParts({
        controller: firstController,
        overlay,
      });

      const overlayHost = layout.element.querySelector<HTMLElement>(".workbench_layout_overlay");
      assert.ok(overlayHost);
      assert.equal(overlay.parentElement, overlayHost);

      const records: MutationRecord[] = [];
      const observer = new MutationObserver((mutations) => {
        records.push(...mutations);
      });
      observer.observe(overlayHost, { childList: true });

      const secondController = document.createElement("div");
      layout.setParts({
        controller: secondController,
        overlay,
      });
      await Promise.resolve();
      observer.disconnect();

      assert.equal(overlay.parentElement, overlayHost);
      assert.equal(records.length, 0);
    } finally {
      layout.dispose();
      parent.remove();
    }
  });
});
