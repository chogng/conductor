/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { SettingsTree } from "src/cs/workbench/contrib/settings/browser/settingsTree";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/settings/test/browser/settingsTree", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("reuses item controls across keyed updates", () => {
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

  test("mounts control containers without layout variants", () => {
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
            title: "Layout",
          },
        ],
      },
    ]);

    const controlSlot = tree.element.querySelector("#settings-layout-card .settings-row-control");
    assert.equal(controlSlot?.className, "settings-row-control");
    assert.equal(controlSlot?.firstChild, control);
  });

  test("replaces the control slot when the caller supplies a different control", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const firstControl = document.createElement("button");
    firstControl.id = "settings-first-control";
    const secondControl = document.createElement("button");
    secondControl.id = "settings-second-control";

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            control: firstControl,
            description: "Description",
            id: "settings-switch-card",
            title: "Control",
          },
        ],
      },
    ]);
    const card = tree.element.querySelector("#settings-switch-card");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            control: secondControl,
            id: "settings-switch-card",
            title: "Control",
          },
        ],
      },
    ]);

    const controlSlot = tree.element.querySelector("#settings-switch-card .settings-row-control");
    assert.equal(tree.element.querySelector("#settings-switch-card"), card);
    assert.equal(controlSlot?.className, "settings-row-control");
    assert.equal(controlSlot?.firstChild, secondControl);
    assert.equal(tree.element.querySelector("#settings-first-control"), null);
  });
});
