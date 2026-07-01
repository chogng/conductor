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
            kind: "control",
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
            kind: "control",
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
            kind: "control",
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
            kind: "control",
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
            kind: "control",
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

  test("stores item search text on the card", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const control = document.createElement("button");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            kind: "control",
            control,
            description: "Search Description",
            id: "settings-search-card",
            searchText: "Option Label",
            title: "Search Title",
          },
        ],
      },
    ]);

    assert.equal(
      tree.element.querySelector<HTMLElement>("#settings-search-card")?.dataset.search,
      "search title search description option label",
    );
  });

  test("mounts caller-owned element items as settings cards", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const firstElement = document.createElement("div");
    firstElement.className = "settings-card-block";
    firstElement.dataset.search = "first element";
    const secondElement = document.createElement("div");
    secondElement.className = "settings-card-block";
    secondElement.dataset.search = "second element";

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            kind: "element",
            element: firstElement,
            id: "settings-element-card",
          },
        ],
      },
    ]);

    assert.equal(tree.element.querySelector("#settings-element-card"), firstElement);
    assert.equal(firstElement.classList.contains("settings-card"), true);
    assert.equal(firstElement.classList.contains("settings-card-block"), true);
    assert.equal(firstElement.dataset.search, "first element");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            kind: "element",
            element: secondElement,
            id: "settings-element-card",
          },
        ],
      },
    ]);

    assert.equal(tree.element.querySelector("#settings-element-card"), secondElement);
    assert.equal(tree.element.contains(firstElement), false);
    assert.equal(secondElement.classList.contains("settings-card"), true);
    assert.equal(secondElement.dataset.search, "second element");
  });

  test("uses item group ids for visual row boundaries", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const firstElement = document.createElement("div");
    const secondElement = document.createElement("div");
    const control = document.createElement("button");

    tree.update([
      {
        id: "settings-test-section",
        items: [
          {
            kind: "element",
            element: firstElement,
            groupId: "settings-semantic-group",
            id: "settings-semantic-header-card",
          },
          {
            kind: "element",
            element: secondElement,
            groupId: "settings-semantic-group",
            id: "settings-semantic-active-card",
          },
          {
            kind: "control",
            control,
            id: "settings-plain-card",
            title: "Plain",
          },
        ],
      },
    ]);

    const firstRow = tree.element.querySelector("#settings-semantic-header-card")?.closest<HTMLElement>(".settings-tree-item");
    const secondRow = tree.element.querySelector("#settings-semantic-active-card")?.closest<HTMLElement>(".settings-tree-item");
    const plainRow = tree.element.querySelector("#settings-plain-card")?.closest<HTMLElement>(".settings-tree-item");

    assert.equal(firstRow?.dataset.groupId, "settings-semantic-group");
    assert.equal(secondRow?.dataset.groupId, "settings-semantic-group");
    assert.equal(plainRow?.dataset.groupId, "settings-test-section");
    assert.equal(firstRow?.parentElement, secondRow?.parentElement);
    assert.equal(secondRow?.previousElementSibling, firstRow);
    assert.equal(plainRow?.previousElementSibling, secondRow);
    assert.equal(firstRow?.classList.contains("settings-tree-item--first"), true);
    assert.equal(firstRow?.classList.contains("settings-tree-item--last"), false);
    assert.equal(secondRow?.classList.contains("settings-tree-item--first"), false);
    assert.equal(secondRow?.classList.contains("settings-tree-item--last"), true);
    assert.equal(plainRow?.classList.contains("settings-tree-item--first"), true);
    assert.equal(plainRow?.classList.contains("settings-tree-item--last"), true);
  });

  test("updates a targeted item without replacing the parent row", () => {
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
            kind: "control",
            control: firstControl,
            id: "settings-control-card",
            title: "Control",
          },
        ],
      },
    ]);
    const card = tree.element.querySelector("#settings-control-card");
    const row = card?.closest(".settings-tree-item");

    tree.updateItems([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            kind: "control",
            control: secondControl,
            id: "settings-control-card",
            title: "Updated Control",
          },
        ],
      },
    ], ["settings-control-card"]);

    assert.equal(tree.element.querySelector("#settings-control-card"), card);
    assert.equal(tree.element.querySelector("#settings-control-card")?.closest(".settings-tree-item"), row);
    assert.equal(tree.element.querySelector("#settings-control-card")?.closest(".ui-list__row"), null);
    assert.equal(tree.element.querySelector("#settings-first-control"), null);
    assert.equal(tree.element.querySelector("#settings-second-control"), secondControl);
    assert.equal(
      tree.element.querySelector("#settings-control-card .settings-title")?.textContent,
      "Updated Control",
    );
  });

  test("updates a targeted composite child without replacing the parent row", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const headerElement = document.createElement("div");
    headerElement.textContent = "Header";
    const activeElement = document.createElement("div");
    activeElement.textContent = "Active";
    const recommendedElement = document.createElement("div");
    recommendedElement.textContent = "Recommended";
    const nextActiveElement = document.createElement("div");
    nextActiveElement.textContent = "Active updated";

    tree.update([
      {
        id: "settings-test-section",
        items: [
          {
            kind: "composite",
            id: "settings-composite-card",
            items: [
              { id: "settings-header-child", element: headerElement },
              { id: "settings-active-child", element: activeElement },
              { id: "settings-recommended-child", element: recommendedElement },
            ],
          },
        ],
      },
    ]);
    const card = tree.element.querySelector("#settings-composite-card");
    const row = card?.closest(".settings-tree-item");
    const headerSlot = tree.element.querySelector("#settings-header-child");
    const activeSlot = tree.element.querySelector("#settings-active-child");
    const recommendedSlot = tree.element.querySelector("#settings-recommended-child");

    tree.updateItems([
      {
        id: "settings-test-section",
        items: [
          {
            kind: "composite",
            id: "settings-composite-card",
            items: [
              { id: "settings-header-child", element: headerElement },
              { id: "settings-active-child", element: nextActiveElement },
              { id: "settings-recommended-child", element: recommendedElement },
            ],
          },
        ],
      },
    ], ["settings-active-child"]);

    assert.equal(tree.element.querySelector("#settings-composite-card"), card);
    assert.equal(tree.element.querySelector("#settings-composite-card")?.closest(".settings-tree-item"), row);
    assert.equal(tree.element.querySelector("#settings-composite-card")?.closest(".ui-list__row"), null);
    assert.equal(tree.element.querySelector("#settings-header-child"), headerSlot);
    assert.equal(tree.element.querySelector("#settings-active-child"), activeSlot);
    assert.equal(tree.element.querySelector("#settings-recommended-child"), recommendedSlot);
    assert.equal(activeSlot?.firstChild, nextActiveElement);
    assert.equal(headerSlot?.firstChild, headerElement);
    assert.equal(recommendedSlot?.firstChild, recommendedElement);
  });
});
