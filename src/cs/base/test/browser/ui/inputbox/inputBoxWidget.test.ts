import assert from "assert";

import { InputBoxWidget, type IInputBoxWidgetItem } from "src/cs/base/browser/ui/inputbox/inputBoxWidget";
import { LxIcon } from "src/cs/base/common/lxicon";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/browser/ui/inputbox/InputBoxWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("leaves Enter handling to the input owner", () => {
    const inputBox = new InputBoxWidget();
    document.body.appendChild(inputBox.element);

    try {
      inputBox.input.value = "V";
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
      });

      const defaultAllowed = inputBox.input.dispatchEvent(event);

      assert.equal(defaultAllowed, true);
      assert.equal(event.defaultPrevented, false);
    }
    finally {
      inputBox.dispose();
    }
  });

  test("focuses the native input when the field is clicked", () => {
    const inputBox = new InputBoxWidget();
    document.body.appendChild(inputBox.element);

    try {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });

      const defaultAllowed = inputBox.field.dispatchEvent(event);

      assert.equal(defaultAllowed, false);
      assert.equal(event.defaultPrevented, true);
      assert.equal(document.activeElement, inputBox.input);
    }
    finally {
      inputBox.dispose();
    }
  });

  test("keeps native input mouse defaults so the browser can place the caret", () => {
    const inputBox = new InputBoxWidget();
    document.body.appendChild(inputBox.element);

    try {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });

      const defaultAllowed = inputBox.input.dispatchEvent(event);

      assert.equal(defaultAllowed, true);
      assert.equal(event.defaultPrevented, false);
    }
    finally {
      inputBox.dispose();
    }
  });

  test("patches keyed items without replacing unchanged item nodes", () => {
    const inputBox = new InputBoxWidget({
      items: [
        createItem("alpha", "Alpha"),
        createItem("beta", "Beta"),
        createItem("gamma", "Gamma"),
      ],
    });
    document.body.appendChild(inputBox.element);

    try {
      const alpha = getItem(inputBox, "alpha");
      const alphaAction = getItemAction(alpha);
      const gamma = getItem(inputBox, "gamma");
      let actionItemLabel = "";
      const actionDisposable = inputBox.onDidTriggerItemAction(({ item }) => {
        actionItemLabel = item.label;
      });

      inputBox.update({
        disabled: true,
        items: [
          createItem("alpha", "Alpha Updated"),
          createItem("gamma", "Gamma"),
          createItem("delta", "Delta"),
        ],
      });

      const nextAlpha = getItem(inputBox, "alpha");
      const nextGamma = getItem(inputBox, "gamma");
      const delta = getItem(inputBox, "delta");
      assert.equal(nextAlpha, alpha);
      assert.equal(getItemAction(nextAlpha), alphaAction);
      assert.equal(nextAlpha.querySelector(".inputbox_widget_item_label")?.textContent, "Alpha Updated");
      assert.equal(nextGamma, gamma);
      assert.ok(delta);
      assert.equal(inputBox.field.querySelector('[data-item-id="beta"]'), null);
      assert.deepEqual(
        Array.from(inputBox.field.querySelectorAll<HTMLElement>(".inputbox_widget_item"))
          .map(item => item.dataset.itemId),
        ["alpha", "gamma", "delta"],
      );
      assert.equal(getItemAction(nextAlpha).disabled, true);

      inputBox.update({ disabled: false });
      assert.equal(getItemAction(nextAlpha), alphaAction);
      assert.equal(getItemAction(nextAlpha).disabled, false);
      getItemAction(nextAlpha).click();
      assert.equal(actionItemLabel, "Alpha Updated");

      actionDisposable.dispose();
    }
    finally {
      inputBox.dispose();
    }
  });

  test("renders removable items with a close action and remove event", () => {
    const inputBox = new InputBoxWidget({
      items: [
        createRemovableItem("alpha", "Alpha"),
      ],
    });
    document.body.appendChild(inputBox.element);

    try {
      const alpha = getItem(inputBox, "alpha");
      const action = getItemAction(alpha);
      let removedItemLabel = "";
      const removeDisposable = inputBox.onDidRemoveItem(({ item }) => {
        removedItemLabel = item.label;
      });

      assert.equal(action.getAttribute("aria-label"), "Remove token Alpha");
      action.click();
      assert.equal(removedItemLabel, "Alpha");

      removeDisposable.dispose();
    }
    finally {
      inputBox.dispose();
    }
  });

  test("does not reorder items unless item reordering is enabled", () => {
    const inputBox = new InputBoxWidget({
      items: [
        createItem("alpha", "Alpha"),
        createItem("beta", "Beta"),
      ],
    });
    document.body.appendChild(inputBox.element);

    try {
      const alpha = getItem(inputBox, "alpha");
      const beta = getItem(inputBox, "beta");
      let reorderCount = 0;
      const reorderDisposable = inputBox.onDidMoveItem(() => {
        reorderCount++;
      });

      const dragAllowed = alpha.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
      const dropAllowed = beta.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

      assert.equal(dragAllowed, false);
      assert.equal(dropAllowed, true);
      assert.equal(reorderCount, 0);
      assert.deepEqual(getItemIds(inputBox), ["alpha", "beta"]);

      reorderDisposable.dispose();
    }
    finally {
      inputBox.dispose();
    }
  });

  test("reorders items when item reordering is enabled", () => {
    const inputBox = new InputBoxWidget({
      itemsReorderable: true,
      items: [
        createItem("alpha", "Alpha"),
        createItem("beta", "Beta"),
        createItem("gamma", "Gamma"),
      ],
    });
    document.body.appendChild(inputBox.element);

    try {
      const alpha = getItem(inputBox, "alpha");
      const gamma = getItem(inputBox, "gamma");
      let reorder: readonly unknown[] = [];
      const reorderDisposable = inputBox.onDidMoveItem(event => {
        reorder = [
          event.sourceItem.id,
          event.sourceIndex,
          event.targetItem.id,
          event.targetIndex,
          event.items.map(item => item.id),
        ];
      });

      alpha.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
      assert.equal(alpha.classList.contains("dragging"), true);
      gamma.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
      assert.equal(gamma.classList.contains("drop-target"), true);
      const defaultAllowed = gamma.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

      assert.equal(defaultAllowed, false);
      assert.deepEqual(reorder, ["alpha", 0, "gamma", 2, ["beta", "gamma", "alpha"]]);
      assert.deepEqual(getItemIds(inputBox), ["beta", "gamma", "alpha"]);
      assert.equal(getItem(inputBox, "alpha").classList.contains("dragging"), false);
      assert.equal(getItem(inputBox, "gamma").classList.contains("drop-target"), false);

      reorderDisposable.dispose();
    }
    finally {
      inputBox.dispose();
    }
  });
});

function createItem(id: string, label: string) {
  return {
    id,
    label,
    action: {
      ariaLabel: `Remove ${label}`,
      icon: LxIcon.close,
    },
  };
}

function createRemovableItem(id: string, label: string): IInputBoxWidgetItem {
  return {
    id,
    label,
    removable: true,
    removeAriaLabel: `Remove token ${label}`,
  };
}

function getItemIds(inputBox: InputBoxWidget): string[] {
  return Array.from(inputBox.field.querySelectorAll<HTMLElement>(".inputbox_widget_item"))
    .map(item => item.dataset.itemId ?? "");
}

function getItem(inputBox: InputBoxWidget, id: string): HTMLElement {
  const item = inputBox.field.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
  assert.ok(item);
  return item;
}

function getItemAction(item: HTMLElement): HTMLButtonElement {
  const action = item.querySelector<HTMLButtonElement>(".inputbox_widget_item_action");
  assert.ok(action);
  return action;
}
