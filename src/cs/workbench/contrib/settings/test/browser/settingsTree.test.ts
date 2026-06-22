/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { SettingsTree } from "src/cs/workbench/contrib/settings/browser/settingsTree";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/settings/test/browser/settingsTree", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("reuses custom item controls across keyed updates", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const control = document.createElement("button");
    control.id = "settings-custom-control";
    control.textContent = "Control";

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            control,
            id: "settings-custom-card",
            kind: "custom",
            title: "Custom",
          },
        ],
      },
    ]);
    const card = tree.element.querySelector("#settings-custom-card");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            control,
            description: "Updated description",
            id: "settings-custom-card",
            kind: "custom",
            title: "Updated Custom",
          },
        ],
      },
    ]);

    assert.equal(tree.element.querySelector("#settings-custom-card"), card);
    assert.equal(tree.element.querySelector("#settings-custom-control"), control);
    assert.equal(
      tree.element.querySelector("#settings-custom-card .settings-title")?.textContent,
      "Updated Custom",
    );
    assert.equal(
      tree.element.querySelector("#settings-custom-card .settings-description")?.textContent,
      "Updated description",
    );
  });

  test("mounts custom control containers without layout variants", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const control = document.createElement("div");
    control.className = "settings-test-custom-container";
    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            control,
            id: "settings-layout-card",
            kind: "custom",
            title: "Layout",
          },
        ],
      },
    ]);

    const controlSlot = tree.element.querySelector("#settings-layout-card .settings-row-control");
    assert.equal(controlSlot?.className, "settings-row-control");
    assert.equal(controlSlot?.firstChild, control);
  });

  test("uses fixed control slot for built-in controls", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            ariaLabel: "Switch",
            checked: false,
            controlId: "settings-switch-control",
            description: "Description",
            id: "settings-switch-card",
            kind: "switch",
            title: "Switch",
          },
        ],
      },
    ]);

    const controlSlot = tree.element.querySelector("#settings-switch-card .settings-row-control");
    assert.equal(controlSlot?.className, "settings-row-control");
    assert.equal(controlSlot?.firstChild, tree.element.querySelector("#settings-switch-control"));
  });

  test("emits onDidChangeItem for built-in controls", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const events: unknown[] = [];
    store.add(tree.onDidChangeItem(event => events.push(event)));

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            ariaLabel: "Switch",
            checked: false,
            controlId: "settings-switch-control",
            id: "settings-switch-card",
            kind: "switch",
            title: "Switch",
          },
        ],
      },
    ]);

    tree.element.querySelector<HTMLButtonElement>("#settings-switch-control")?.click();

    assert.deepEqual(events, [
      {
        checked: true,
        id: "settings-switch-card",
        kind: "switch",
      },
    ]);
  });
});
