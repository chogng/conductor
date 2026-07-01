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
          createControlItem({
            id: "settings-custom-card",
            title: "Custom",
            control,
          }),
        ],
      },
    ]);
    const card = tree.element.querySelector("#settings-custom-card");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createControlItem({
            description: "Updated description",
            id: "settings-custom-card",
            title: "Updated Custom",
            control,
          }),
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

  test("mounts control leading and trailing items", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const control = document.createElement("div");
    control.className = "settings-test-custom-container";
    const accessory = document.createElement("span");
    accessory.textContent = "Accessory";
    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            kind: "control",
            id: "settings-layout-card",
            leading: [
              {
                id: "label",
                element: text("settings-title", "Layout"),
                searchText: "Layout",
              },
              {
                id: "accessory",
                element: accessory,
                searchText: "Accessory",
              },
            ],
            trailing: [
              {
                id: "control",
                element: control,
              },
            ],
          },
        ],
      },
    ]);

    const leading = tree.element.querySelector("#settings-layout-card .settings-row-leading");
    const trailing = tree.element.querySelector("#settings-layout-card .settings-row-trailing");
    assert.equal(leading?.children.length, 2);
    assert.equal(leading?.children[1]?.firstChild, accessory);
    assert.equal(trailing?.className, "settings-row-trailing");
    assert.equal(trailing?.firstElementChild?.className, "settings-row-item settings-row-item--trailing");
    assert.equal(trailing?.firstElementChild?.firstChild, control);
  });

  test("replaces the trailing item when the caller supplies a different control", () => {
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
          createControlItem({
            description: "Description",
            id: "settings-switch-card",
            title: "Control",
            control: firstControl,
          }),
        ],
      },
    ]);
    const card = tree.element.querySelector("#settings-switch-card");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createControlItem({
            id: "settings-switch-card",
            title: "Control",
            control: secondControl,
          }),
        ],
      },
    ]);

    const trailing = tree.element.querySelector("#settings-switch-card .settings-row-trailing");
    assert.equal(tree.element.querySelector("#settings-switch-card"), card);
    assert.equal(trailing?.className, "settings-row-trailing");
    assert.equal(trailing?.firstElementChild?.firstChild, secondControl);
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
          createControlItem({
            description: "Search Description",
            id: "settings-search-card",
            searchText: "Option Label",
            title: "Search Title",
            control,
          }),
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
            id: "settings-plain-card",
            leading: [
              {
                id: "label",
                element: text("settings-title", "Plain"),
                searchText: "Plain",
              },
            ],
            trailing: [
              {
                id: "control",
                element: control,
              },
            ],
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
          createControlItem({
            id: "settings-control-card",
            title: "Control",
            control: firstControl,
          }),
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
          createControlItem({
            id: "settings-control-card",
            title: "Updated Control",
            control: secondControl,
          }),
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
    const headerChild = tree.element.querySelector("#settings-header-child");
    const activeChild = tree.element.querySelector("#settings-active-child");
    const recommendedChild = tree.element.querySelector("#settings-recommended-child");

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
    assert.equal(tree.element.querySelector("#settings-header-child"), headerChild);
    assert.equal(tree.element.querySelector("#settings-active-child"), activeChild);
    assert.equal(tree.element.querySelector("#settings-recommended-child"), recommendedChild);
    assert.equal(activeChild?.firstChild, nextActiveElement);
    assert.equal(headerChild?.firstChild, headerElement);
    assert.equal(recommendedChild?.firstChild, recommendedElement);
  });
});

function createControlItem(options: {
  readonly control: HTMLElement;
  readonly description?: string;
  readonly id: string;
  readonly searchText?: string;
  readonly title: string;
}) {
  return {
    kind: "control" as const,
    id: options.id,
    leading: [
      {
        id: "label",
        element: label(options.title, options.description),
        searchText: [options.title, options.description].filter(Boolean).join(" "),
      },
    ],
    searchText: options.searchText,
    trailing: [
      {
        id: "control",
        element: options.control,
      },
    ],
  };
}

function label(title: string, description?: string): HTMLElement {
  const element = document.createElement("div");
  element.className = description ? "settings-row-label settings-heading" : "settings-row-label";
  element.appendChild(text("settings-title", title));
  if (description) {
    element.appendChild(text("settings-description", description));
  }
  return element;
}

function text(className: string, value: string): HTMLElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = value;
  return element;
}
