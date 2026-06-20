import assert from "assert";

import { WorkbenchTitlebarPart } from "src/cs/workbench/browser/parts/titlebar/titlebarPart";

suite("workbench/browser/parts/titlebar/titlebarPart", () => {
  test("reserves a trailing gutter when window controls are on the left", () => {
    const parent = document.createElement("div");
    const part = new WorkbenchTitlebarPart(parent);

    part.update({
      activePage: "table",
      chrome: {
        showBrandIcon: false,
        windowControlsSide: "left",
      },
    });

    const rightControls = parent.querySelector(".titlebar-right");

    assert.ok(rightControls);
    assert.ok(rightControls.querySelector(".titlebar-right-spacer"));
    assert.equal(rightControls.querySelector(".window-controls-container"), null);

    part.dispose();
  });

  test("uses the native controls reservation when window controls are on the right", () => {
    const parent = document.createElement("div");
    const part = new WorkbenchTitlebarPart(parent);

    part.update({
      activePage: "table",
      chrome: {
        showBrandIcon: true,
        windowControlsSide: "right",
      },
    });

    const rightControls = parent.querySelector(".titlebar-right");
    const windowControls = rightControls?.querySelector<HTMLElement>(".window-controls-container");

    assert.ok(rightControls);
    assert.ok(windowControls);
    assert.equal(windowControls.style.width, "138px");
    assert.equal(rightControls.querySelector(".titlebar-right-spacer"), null);

    part.dispose();
  });
});
