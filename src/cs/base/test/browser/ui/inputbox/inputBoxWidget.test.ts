import assert from "assert";

import { InputBoxWidget } from "src/cs/base/browser/ui/inputbox/inputBoxWidget";
import { LxIcon } from "src/cs/base/common/lxicon";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/browser/ui/inputbox/InputBoxWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("accepts editable input with Enter", () => {
    const inputBox = new InputBoxWidget();
    document.body.appendChild(inputBox.element);
    let acceptedValue: string | null = null;
    const acceptDisposable = inputBox.onDidAccept(value => {
      acceptedValue = value;
    });

    try {
      inputBox.input.value = "V";
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
      });

      const defaultAllowed = inputBox.input.dispatchEvent(event);

      assert.equal(defaultAllowed, false);
      assert.equal(event.defaultPrevented, true);
      assert.equal(acceptedValue, "V");
    }
    finally {
      acceptDisposable.dispose();
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
