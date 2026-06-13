import assert from "assert";

import { createSwitch, updateSwitch } from "../../../../browser/ui/switch/switch.ts";
import { SwitchWidget } from "../../../../browser/ui/switch/switchWidget.ts";

suite("base/test/browser/ui/switch/switch", () => {
  class FakeStyle {
    readonly values = new Map<string, string>();

    setProperty(name: string, value: string): void {
      this.values.set(name, value);
    }

    removeProperty(name: string): void {
      this.values.delete(name);
    }
  }

  class FakeSwitchButton {
    className = "";
    disabled = false;
    id = "";
    readonly style = new FakeStyle();
    readonly attributes = new Map<string, string>();
    private hasThumb = true;

    setAttribute(name: string, value: string): void {
      this.attributes.set(name, value);
    }

    removeAttribute(name: string): void {
      if (name === "style") {
        this.style.values.clear();
      }
      this.attributes.delete(name);
    }

    querySelector(selector: string): unknown {
      return selector === ".ui-switch__thumb" && this.hasThumb ? {} : null;
    }

    appendChild(): void {
      this.hasThumb = true;
    }
  }

  test("updateSwitch updates classes, ARIA state and custom colors", () => {
    const button = new FakeSwitchButton();

    updateSwitch(button as unknown as HTMLButtonElement, {
      checked: true,
      className: "extra",
      disabled: true,
      id: "switch",
      style: {
        "--switch-on": "#fff",
        "--switch-on-hover": "",
      },
    });

    assert.equal(button.id, "switch");
    assert.equal(button.disabled, true);
    assert.equal(button.className, "ui-switch extra");
    assert.equal(button.attributes.get("aria-checked"), "true");
    assert.equal(button.attributes.get("data-state"), "checked");
    assert.equal(button.style.values.get("--switch-on"), "#fff");
    assert.equal(button.style.values.has("--switch-on-hover"), false);

    updateSwitch(button as unknown as HTMLButtonElement, { checked: false });

    assert.equal(button.disabled, false);
    assert.equal(button.className, "ui-switch");
    assert.equal(button.attributes.get("aria-checked"), "false");
    assert.equal(button.attributes.get("data-state"), "unchecked");
    assert.equal(button.style.values.size, 0);
  });

  test("createSwitch renders switch semantics and thumb", () => {
    const button = createSwitch({
      checked: true,
      id: "power",
      style: {
        "--switch-on": "rgb(10, 20, 30)",
      },
    });

    assert.equal(button.id, "power");
    assert.equal(button.getAttribute("role"), "switch");
    assert.equal(button.getAttribute("aria-checked"), "true");
    assert.equal(button.getAttribute("data-state"), "checked");
    assert.ok(button.querySelector(".ui-switch__thumb"));
    assert.equal(button.style.getPropertyValue("--switch-on"), "rgb(10, 20, 30)");
  });

  test("updateSwitch keeps a thumb and clears stale style", () => {
    const button = createSwitch({
      checked: true,
      style: {
        "--switch-on": "red",
      },
    });

    updateSwitch(button, {
      checked: false,
      disabled: true,
    });

    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute("aria-checked"), "false");
    assert.equal(button.getAttribute("data-state"), "unchecked");
    assert.equal(button.style.getPropertyValue("--switch-on"), "");
    assert.ok(button.querySelector(".ui-switch__thumb"));
  });

  test("SwitchWidget toggles, preserves options on update and disposes listener", () => {
    const widget = new SwitchWidget({
      checked: false,
      className: "extra",
      id: "widget-switch",
    });
    const changes: boolean[] = [];
    widget.onDidChangeChecked(checked => changes.push(checked));

    widget.domNode.click();

    assert.deepEqual(changes, [true]);
    assert.equal(widget.checked, true);
    assert.equal(widget.domNode.className, "ui-switch extra");
    assert.equal(widget.domNode.id, "widget-switch");
    assert.equal(widget.domNode.getAttribute("aria-checked"), "true");

    widget.update({ checked: false });

    assert.equal(widget.checked, false);
    assert.equal(widget.domNode.className, "ui-switch extra");
    assert.equal(widget.domNode.id, "widget-switch");
    assert.equal(widget.domNode.getAttribute("aria-checked"), "false");

    widget.dispose();
    widget.domNode.click();

    assert.deepEqual(changes, [true]);
    assert.equal(widget.checked, false);
  });

  test("SwitchWidget ignores clicks while disabled", () => {
    const widget = new SwitchWidget({
      checked: false,
      disabled: true,
    });
    const changes: boolean[] = [];
    widget.onDidChangeChecked(checked => changes.push(checked));

    widget.domNode.click();

    assert.deepEqual(changes, []);
    assert.equal(widget.checked, false);
    assert.equal(widget.domNode.getAttribute("aria-checked"), "false");

    widget.dispose();
  });
});
