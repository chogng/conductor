import assert from "assert";

import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { Action } from "src/cs/base/common/actions";
import { getBaseLayerHoverDelegate, setBaseLayerHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { IHoverService } from "src/cs/platform/hover/browser/hoverService";

suite("base/test/browser/ui/hover/hoverService", () => {
  teardown(() => {
    document.querySelectorAll(".workbench-hover-widget").forEach(element => element.remove());
  });

  test("managed hover update does not show a hidden hover", () => {
    const target = document.createElement("button");
    document.body.appendChild(target);
    const instantiationService = new InstantiationService();

    try {
      const hoverService = instantiationService.invokeFunction(accessor => accessor.get(IHoverService));
      const hover = hoverService.setupManagedHover(target, "Before", {
        suppressOnPointerDown: 1000,
      });

      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      hover.update("After");

      assert.equal(document.querySelector(".workbench-hover-widget"), null);
    }
    finally {
      instantiationService.dispose();
      target.remove();
    }
  });

  test("managed hover update refreshes a visible hover", () => {
    const target = document.createElement("button");
    document.body.appendChild(target);
    const instantiationService = new InstantiationService();

    try {
      const hoverService = instantiationService.invokeFunction(accessor => accessor.get(IHoverService));
      const hover = hoverService.setupManagedHover(target, "Before");

      hover.show();
      assert.equal(document.querySelector(".workbench-hover-widget")?.textContent, "Before");

      hover.update("After");
      assert.equal(document.querySelector(".workbench-hover-widget")?.textContent, "After");
    }
    finally {
      instantiationService.dispose();
      target.remove();
    }
  });

  test("actionbar tooltip update after click does not show hidden hover", () => {
    const previousHoverDelegate = getBaseLayerHoverDelegate();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const instantiationService = new InstantiationService();
    const actionBar = new ActionBar();

    try {
      const hoverService = instantiationService.invokeFunction(accessor => accessor.get(IHoverService));
      setBaseLayerHoverDelegate(hoverService);

      const action = new Action("test.action", "Before", undefined, true, () => {
        action.tooltip = "After";
      });
      action.tooltip = "Before";
      actionBar.push(action, { label: false });
      container.appendChild(actionBar.domNode);

      const button = container.querySelector<HTMLButtonElement>(".ui-actionbar__label");
      assert.ok(button);

      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      assert.equal(document.querySelector(".workbench-hover-widget"), null);
      assert.equal(button.getAttribute("aria-label"), "After");
    }
    finally {
      actionBar.dispose();
      instantiationService.dispose();
      container.remove();
      setBaseLayerHoverDelegate(previousHoverDelegate);
    }
  });

  test("managed hover show hides visible hover when content becomes empty", () => {
    const target = document.createElement("button");
    document.body.appendChild(target);
    const instantiationService = new InstantiationService();
    let content: string | undefined = "Before";

    try {
      const hoverService = instantiationService.invokeFunction(accessor => accessor.get(IHoverService));
      const hover = hoverService.setupManagedHover(target, () => content);

      hover.show();
      assert.equal(document.querySelector(".workbench-hover-widget")?.textContent, "Before");

      content = undefined;
      hover.show();
      assert.equal(document.querySelector(".workbench-hover-widget"), null);
    }
    finally {
      instantiationService.dispose();
      target.remove();
    }
  });
});
