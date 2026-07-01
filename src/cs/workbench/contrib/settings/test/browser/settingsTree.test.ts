/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { SettingsTree } from "src/cs/workbench/contrib/settings/browser/settingsTree";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/settings/test/browser/settingsTree", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("reuses caller-owned element items across keyed updates", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const element = createRowElement("settings-custom-card", "Custom");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createElementItem({
            element,
            id: "settings-custom-card",
          }),
        ],
      },
    ]);
    const card = tree.element.querySelector("#settings-custom-card");
    const row = card?.closest(".settings-tree-item");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createElementItem({
            element,
            id: "settings-custom-card",
            searchText: "Updated Custom",
          }),
        ],
      },
    ]);

    assert.equal(tree.element.querySelector("#settings-custom-card"), card);
    assert.equal(tree.element.querySelector("#settings-custom-card")?.closest(".settings-tree-item"), row);
    assert.equal((card as HTMLElement | null)?.dataset.search, "updated custom");
  });

  test("stores item search text on the card", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const element = createRowElement("settings-search-card", "Search Title", "Search Description");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createElementItem({
            element,
            id: "settings-search-card",
            searchText: "Search Title Search Description Option Label",
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

  test("renders settings sections as lists with settings list item cards", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const element = createRowElement("settings-element-card", "Element");
    const compositeChild = document.createElement("div");
    compositeChild.textContent = "Composite child";

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createElementItem({
            element,
            id: "settings-element-card",
          }),
          {
            kind: "composite",
            id: "settings-composite-card",
            items: [
              {
                element: compositeChild,
                id: "settings-composite-child",
              },
            ],
          },
        ],
      },
    ]);

    const list = tree.element.querySelector<HTMLElement>(".settings-section-list");
    const elementCard = tree.element.querySelector<HTMLElement>("#settings-element-card");
    const compositeCard = tree.element.querySelector<HTMLElement>("#settings-composite-card");
    const elementRow = elementCard?.closest<HTMLElement>(".settings-tree-item");
    const compositeRow = compositeCard?.closest<HTMLElement>(".settings-tree-item");

    assert.equal(list?.getAttribute("role"), "list");
    assert.equal(elementRow?.getAttribute("role"), "presentation");
    assert.equal(compositeRow?.getAttribute("role"), "presentation");
    assert.equal(elementCard?.getAttribute("role"), "listitem");
    assert.equal(compositeCard?.getAttribute("role"), "listitem");
    assert.equal(elementCard?.classList.contains("settings-list-item"), true);
    assert.equal(compositeCard?.classList.contains("settings-list-item"), true);
  });

  test("uses item group ids for visual row boundaries", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree());
    const firstElement = document.createElement("div");
    const secondElement = document.createElement("div");
    const plainElement = createRowElement("settings-plain-card", "Plain");

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
            kind: "element",
            element: plainElement,
            id: "settings-plain-card",
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
    const firstElement = createRowElement("settings-control-card", "Control");
    const secondElement = createRowElement("settings-control-card", "Updated Control");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createElementItem({
            element: firstElement,
            id: "settings-control-card",
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
          createElementItem({
            element: secondElement,
            id: "settings-control-card",
          }),
        ],
      },
    ], ["settings-control-card"]);

    assert.equal(tree.element.querySelector("#settings-control-card"), secondElement);
    assert.equal(tree.element.querySelector("#settings-control-card")?.closest(".settings-tree-item"), row);
    assert.equal(tree.element.querySelector("#settings-control-card")?.closest(".ui-list__row"), null);
    assert.equal(tree.element.contains(firstElement), false);
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

function createElementItem(options: {
  readonly element: HTMLElement;
  readonly id: string;
  readonly searchText?: string;
}) {
  return {
    kind: "element" as const,
    element: options.element,
    id: options.id,
    searchText: options.searchText,
  };
}

function createRowElement(id: string, title: string, description?: string): HTMLElement {
  const card = document.createElement("div");
  card.id = id;
  card.className = "settings-card settings-card-row";
  const row = document.createElement("div");
  row.className = "settings-row";
  const element = document.createElement("div");
  element.className = description ? "settings-row-item settings-row-leading settings-heading" : "settings-row-item settings-row-leading";
  element.appendChild(text("settings-title", title));
  if (description) {
    element.appendChild(text("settings-description", description));
  }
  row.appendChild(element);
  card.appendChild(row);
  return card;
}

function text(className: string, value: string): HTMLElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = value;
  return element;
}
