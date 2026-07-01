/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { SettingsTree } from "src/cs/workbench/contrib/settings/browser/settingsTree";
import { SettingsTreeModel } from "src/cs/workbench/contrib/settings/browser/settingsTreeModels";
import { settingsTreeRenderer } from "src/cs/workbench/contrib/settings/browser/settingsTreeRenderer";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/settings/test/browser/settingsTree", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("models sections and items as a settings tree element hierarchy", () => {
    if (typeof document === "undefined") {
      return;
    }

    const model = new SettingsTreeModel({
      id: "settings-test-model",
      title: "Settings",
    });
    const firstItem = createElementItem({
      element: createCellElement("settings-first-item", "First"),
      id: "settings-first-item",
    });
    const secondItem = createElementItem({
      element: createCellElement("settings-second-item", "Second"),
      id: "settings-second-item",
    });

    const firstElement = model.addItemToSection({ id: "settings-first-section", title: "First Section" }, firstItem);
    const secondElement = model.addItemToSection({ id: "settings-first-section", title: "First Section" }, secondItem);

    assert.equal(model.root.title, "Settings");
    assert.equal(model.root.children.length, 1);
    assert.equal(model.root.children[0]?.parent, model.root);
    assert.equal(firstElement.parent, model.root.children[0]);
    assert.equal(secondElement.parent, model.root.children[0]);
    assert.deepEqual(model.toSections(), [
      {
        id: "settings-first-section",
        title: "First Section",
        items: [firstItem, secondItem],
      },
    ]);
  });

  test("reuses caller-owned element items across keyed updates", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree(settingsTreeRenderer));
    const element = createCellElement("settings-custom-item", "Custom");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createElementItem({
            element,
            id: "settings-custom-item",
          }),
        ],
      },
    ]);
    const cell = tree.element.querySelector("#settings-custom-item");
    const listItem = cell?.closest(".settings-list-item");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createElementItem({
            element,
            id: "settings-custom-item",
            searchText: "Updated Custom",
          }),
        ],
      },
    ]);

    assert.equal(tree.element.querySelector("#settings-custom-item"), cell);
    assert.equal(tree.element.querySelector("#settings-custom-item")?.closest(".settings-list-item"), listItem);
    assert.equal(tree.filterSearchResults(["updated"]), 1);
    assert.equal(listItem instanceof HTMLElement ? listItem.hidden : true, false);
    assert.equal(cell instanceof HTMLElement ? cell.hasAttribute("data-search") : true, false);
  });

  test("filters item search text without storing it on the cell DOM", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree(settingsTreeRenderer));
    const element = createCellElement("settings-search-item", "Search Title", "Search Description");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section Search Header",
        items: [
          createElementItem({
            element,
            id: "settings-search-item",
            searchText: "Search Title Search Description Option Label",
          }),
        ],
      },
    ]);

    const cell = tree.element.querySelector<HTMLElement>("#settings-search-item");
    const listItem = cell?.closest<HTMLElement>(".settings-list-item");
    const section = cell?.closest<HTMLElement>(".settings-section");
    assert.equal(tree.filterSearchResults(["option", "label"]), 1);
    assert.equal(listItem?.hidden, false);
    assert.equal(section?.hidden, false);
    assert.equal(tree.filterSearchResults(["missing"]), 0);
    assert.equal(listItem?.hidden, true);
    assert.equal(section?.hidden, true);
    assert.equal(tree.filterSearchResults(["section"]), 0);
    assert.equal(listItem?.hidden, true);
    assert.equal(section?.hidden, true);
    assert.equal(cell?.hasAttribute("data-search"), false);
  });

  test("mounts caller-owned element items without rewriting cell classes", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree(settingsTreeRenderer));
    const firstElement = document.createElement("div");
    firstElement.className = "settings-cell-block";
    firstElement.setAttribute("data-search", "legacy first element");
    const secondElement = document.createElement("div");
    secondElement.className = "settings-cell-block";
    secondElement.setAttribute("data-search", "legacy second element");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            kind: "element",
            element: firstElement,
            id: "settings-element-item",
          },
        ],
      },
    ]);

    assert.equal(tree.element.querySelector("#settings-element-item"), firstElement);
    assert.equal(firstElement.className, "settings-cell-block");
    assert.equal(firstElement.classList.contains("settings-cell-block"), true);
    assert.equal(firstElement.hasAttribute("data-search"), false);

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          {
            kind: "element",
            element: secondElement,
            id: "settings-element-item",
          },
        ],
      },
    ]);

    assert.equal(tree.element.querySelector("#settings-element-item"), secondElement);
    assert.equal(tree.element.contains(firstElement), false);
    assert.equal(secondElement.className, "settings-cell-block");
    assert.equal(secondElement.hasAttribute("data-search"), false);
  });

  test("renders settings sections as lists with settings list item cells", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree(settingsTreeRenderer));
    const element = createCellElement("settings-element-item", "Element");
    const compositeChild = document.createElement("div");
    compositeChild.textContent = "Composite child";

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createElementItem({
            element,
            id: "settings-element-item",
          }),
          {
            kind: "composite",
            id: "settings-composite-item",
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

    const section = tree.element.querySelector<HTMLElement>(".settings-section");
    const header = section?.querySelector<HTMLElement>(".settings-section-header");
    const body = section?.querySelector<HTMLElement>(".settings-section-body");
    const list = section?.querySelector<HTMLElement>(".settings-list");
    const elementCell = tree.element.querySelector<HTMLElement>("#settings-element-item");
    const compositeCell = tree.element.querySelector<HTMLElement>("#settings-composite-item");
    const elementListItem = elementCell?.closest<HTMLElement>(".settings-list-item");
    const compositeListItem = compositeCell?.closest<HTMLElement>(".settings-list-item");
    const elementListItemBody = elementListItem?.querySelector<HTMLElement>(".settings-list-item-body");
    const compositeListItemBody = compositeListItem?.querySelector<HTMLElement>(".settings-list-item-body");
    const elementDivider = elementListItem?.querySelector<HTMLElement>(".settings-list-item-divider");
    const compositeDivider = compositeListItem?.querySelector<HTMLElement>(".settings-list-item-divider");

    assert.equal(tree.element.classList.contains("settings-section-list"), true);
    assert.equal(section?.tagName, "SECTION");
    assert.equal(header?.id, "settings-test-section-header");
    assert.equal(header?.parentElement, section);
    assert.equal(body?.parentElement, section);
    assert.equal(header?.closest(".settings-section-body"), null);
    assert.equal(list?.parentElement, body);
    assert.equal(list?.getAttribute("role"), "list");
    assert.equal(elementListItem?.getAttribute("role"), "listitem");
    assert.equal(compositeListItem?.getAttribute("role"), "listitem");
    assert.equal(elementCell?.parentElement, elementListItemBody);
    assert.equal(compositeCell?.parentElement, compositeListItemBody);
    assert.equal(elementDivider?.hidden, true);
    assert.equal(compositeDivider?.hidden, false);
    assert.equal(elementDivider?.nextElementSibling, elementListItemBody);
    assert.equal(compositeDivider?.nextElementSibling, compositeListItemBody);
    assert.equal(elementCell?.getAttribute("role"), null);
    assert.equal(compositeCell?.getAttribute("role"), null);
    assert.equal(elementListItem?.classList.contains("settings-list-item"), true);
    assert.equal(compositeListItem?.classList.contains("settings-list-item"), true);
    assert.equal(elementCell?.classList.contains("settings-list-item"), false);
    assert.equal(compositeCell?.classList.contains("settings-list-item"), false);
    assert.equal(elementCell?.classList.contains("settings-cell"), true);
    assert.equal(compositeCell?.classList.contains("settings-cell"), true);
  });

  test("uses item group ids for visual list item boundaries", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree(settingsTreeRenderer));
    const firstElement = document.createElement("div");
    const secondElement = document.createElement("div");
    const plainElement = createCellElement("settings-plain-item", "Plain");

    tree.update([
      {
        id: "settings-test-section",
        items: [
          {
            kind: "element",
            element: firstElement,
            groupId: "settings-semantic-group",
            id: "settings-semantic-header-item",
          },
          {
            kind: "element",
            element: secondElement,
            groupId: "settings-semantic-group",
            id: "settings-semantic-active-item",
          },
          {
            kind: "element",
            element: plainElement,
            id: "settings-plain-item",
          },
        ],
      },
    ]);

    const firstListItem = tree.element.querySelector("#settings-semantic-header-item")?.closest<HTMLElement>(".settings-list-item");
    const secondListItem = tree.element.querySelector("#settings-semantic-active-item")?.closest<HTMLElement>(".settings-list-item");
    const plainListItem = tree.element.querySelector("#settings-plain-item")?.closest<HTMLElement>(".settings-list-item");

    assert.equal(firstListItem?.dataset.groupId, "settings-semantic-group");
    assert.equal(secondListItem?.dataset.groupId, "settings-semantic-group");
    assert.equal(plainListItem?.dataset.groupId, "settings-test-section");
    assert.equal(firstListItem?.parentElement, secondListItem?.parentElement);
    assert.equal(secondListItem?.previousElementSibling, firstListItem);
    assert.equal(plainListItem?.previousElementSibling, secondListItem);
    assert.equal(firstListItem?.classList.contains("settings-list-item--first"), true);
    assert.equal(firstListItem?.classList.contains("settings-list-item--last"), false);
    assert.equal(secondListItem?.classList.contains("settings-list-item--first"), false);
    assert.equal(secondListItem?.classList.contains("settings-list-item--last"), true);
    assert.equal(plainListItem?.classList.contains("settings-list-item--first"), true);
    assert.equal(plainListItem?.classList.contains("settings-list-item--last"), true);
    assert.equal(firstListItem?.querySelector<HTMLElement>(".settings-list-item-divider")?.hidden, true);
    assert.equal(secondListItem?.querySelector<HTMLElement>(".settings-list-item-divider")?.hidden, false);
    assert.equal(plainListItem?.querySelector<HTMLElement>(".settings-list-item-divider")?.hidden, false);
  });

  test("updates a targeted item without replacing the parent list item", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree(settingsTreeRenderer));
    const firstElement = createCellElement("settings-control-item", "Control");
    const secondElement = createCellElement("settings-control-item", "Updated Control");

    tree.update([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createElementItem({
            element: firstElement,
            id: "settings-control-item",
          }),
        ],
      },
    ]);
    const cell = tree.element.querySelector("#settings-control-item");
    const listItem = cell?.closest(".settings-list-item");

    tree.updateItems([
      {
        id: "settings-test-section",
        title: "Section",
        items: [
          createElementItem({
            element: secondElement,
            id: "settings-control-item",
          }),
        ],
      },
    ], ["settings-control-item"]);

    assert.equal(tree.element.querySelector("#settings-control-item"), secondElement);
    assert.equal(tree.element.querySelector("#settings-control-item")?.closest(".settings-list-item"), listItem);
    assert.equal(tree.element.querySelector("#settings-control-item")?.closest(".ui-list__row"), null);
    assert.equal(tree.element.contains(firstElement), false);
    assert.equal(
      tree.element.querySelector("#settings-control-item .settings-title")?.textContent,
      "Updated Control",
    );
  });

  test("updates a targeted composite child without replacing the parent list item", () => {
    if (typeof document === "undefined") {
      return;
    }

    const tree = store.add(new SettingsTree(settingsTreeRenderer));
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
            id: "settings-composite-item",
            items: [
              { id: "settings-header-child", element: headerElement },
              { id: "settings-active-child", element: activeElement },
              { id: "settings-recommended-child", element: recommendedElement },
            ],
          },
        ],
      },
    ]);
    const cell = tree.element.querySelector("#settings-composite-item");
    const listItem = cell?.closest(".settings-list-item");
    const headerChild = tree.element.querySelector("#settings-header-child");
    const activeChild = tree.element.querySelector("#settings-active-child");
    const recommendedChild = tree.element.querySelector("#settings-recommended-child");

    tree.updateItems([
      {
        id: "settings-test-section",
        items: [
          {
            kind: "composite",
            id: "settings-composite-item",
            items: [
              { id: "settings-header-child", element: headerElement },
              { id: "settings-active-child", element: nextActiveElement },
              { id: "settings-recommended-child", element: recommendedElement },
            ],
          },
        ],
      },
    ], ["settings-active-child"]);

    assert.equal(tree.element.querySelector("#settings-composite-item"), cell);
    assert.equal(tree.element.querySelector("#settings-composite-item")?.closest(".settings-list-item"), listItem);
    assert.equal(tree.element.querySelector("#settings-composite-item")?.closest(".ui-list__row"), null);
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

function createCellElement(id: string, title: string, description?: string): HTMLElement {
  const cell = document.createElement("div");
  cell.id = id;
  cell.className = "settings-cell settings-list-item-cell";
  const content = document.createElement("div");
  content.className = "settings-list-item-content";
  const element = document.createElement("div");
  element.className = description ? "settings-list-item-leading settings-heading" : "settings-list-item-leading";
  element.appendChild(text("settings-title", title));
  if (description) {
    element.appendChild(text("settings-description", description));
  }
  content.appendChild(element);
  cell.appendChild(content);
  return cell;
}

function text(className: string, value: string): HTMLElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = value;
  return element;
}
