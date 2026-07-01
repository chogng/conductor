import { append } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { normalizeSettingsSearchText } from "src/cs/workbench/contrib/settings/browser/settingsSearch";

type ControlItem = {
  readonly kind: "control";
  readonly groupId?: string;
  readonly id: string;
  readonly leading: readonly ControlChildItem[];
  readonly searchText?: string;
  readonly trailing: readonly ControlChildItem[];
};

type ControlChildItem = {
  readonly element: HTMLElement;
  readonly id: string;
  readonly searchText?: string;
};

export type SettingsTreeElementItem = {
  readonly kind: "element";
  readonly element: HTMLElement;
  readonly groupId?: string;
  readonly id: string;
  readonly searchText?: string;
};

export type SettingsTreeCompositeChildItem = {
  readonly element: HTMLElement;
  readonly id: string;
  readonly searchText?: string;
};

export type SettingsTreeCompositeItem = {
  readonly kind: "composite";
  readonly groupId?: string;
  readonly id: string;
  readonly items: readonly SettingsTreeCompositeChildItem[];
  readonly searchText?: string;
};

export type SettingsTreeItem = ControlItem | SettingsTreeElementItem | SettingsTreeCompositeItem;

export type SettingsTreeSection = {
  readonly id: string;
  readonly items: readonly SettingsTreeItem[];
  readonly title?: string;
};

type SettingsTreeEntry = SettingsTreeSectionEntry | SettingsTreeItemEntry;

type SettingsTreeSectionEntry = {
  readonly kind: "section";
  readonly id: string;
  readonly title: string;
};

type SettingsTreeItemEntry = {
  readonly first: boolean;
  readonly groupId: string;
  readonly id: string;
  readonly item: SettingsTreeItem;
  readonly kind: "item";
  readonly last: boolean;
};

type SettingsTreeSectionState = {
  readonly element: HTMLElement;
  readonly items: Map<string, SettingsTreeItemState>;
  readonly listElement: HTMLElement;
  titleElement: HTMLElement | null;
};

type SettingsTreeItemState = {
  readonly element: HTMLElement;
  entry: SettingsTreeItemEntry;
  widget: SettingsTreeItemWidget;
};

// Small settings tree: section and item ids are stable keys. Control items use
// keyed leading/trailing child items; element items use caller-owned item content.
// SettingsView owns control behavior and lifecycle.
export class SettingsTree extends Disposable {
  public readonly element = div("settings-tree");
  private entries: readonly SettingsTreeEntry[] = [];
  private readonly sections = new Map<string, SettingsTreeSectionState>();

  public update(sections: readonly SettingsTreeSection[]): void {
    this.entries = flattenSettingsTree(sections);
    this.updateSections(sections, null);
  }

  public updateItems(sections: readonly SettingsTreeSection[], itemIds: readonly string[]): void {
    const nextEntries = flattenSettingsTree(sections);
    if (!haveSameEntryIds(this.entries, nextEntries)) {
      this.update(sections);
      return;
    }

    const targetIds = new Set(itemIds);
    this.entries = nextEntries;
    this.updateSections(sections, targetIds);
  }

  public override dispose(): void {
    super.dispose();
    for (const section of this.sections.values()) {
      this.disposeSectionState(section);
    }
    this.sections.clear();
    this.element.remove();
  }

  private updateSections(sections: readonly SettingsTreeSection[], targetIds: ReadonlySet<string> | null): void {
    const nextSectionIds = new Set(sections.map(section => section.id));
    for (const [sectionId, section] of Array.from(this.sections)) {
      if (!nextSectionIds.has(sectionId)) {
        this.disposeSectionState(section);
        this.sections.delete(sectionId);
      }
    }

    for (let index = 0; index < sections.length; index++) {
      const section = sections[index]!;
      let state = this.sections.get(section.id);
      if (!state) {
        state = this.createSectionState(section);
        this.sections.set(section.id, state);
      }

      this.updateSectionTitle(state, section);
      this.updateSectionItems(state, section, targetIds);
      const reference = this.element.children[index] ?? null;
      if (reference !== state.element) {
        this.element.insertBefore(state.element, reference);
      }
    }
  }

  private createSectionState(section: SettingsTreeSection): SettingsTreeSectionState {
    const element = div("settings-section");
    updateElementId(element, section.id);
    const listElement = div("settings-section-list");
    element.appendChild(listElement);
    return {
      element,
      items: new Map(),
      listElement,
      titleElement: null,
    };
  }

  private updateSectionTitle(state: SettingsTreeSectionState, section: SettingsTreeSection): void {
    updateElementId(state.element, section.id);
    if (!section.title) {
      state.titleElement?.remove();
      state.titleElement = null;
      return;
    }

    if (!state.titleElement) {
      state.titleElement = title("");
      state.element.insertBefore(state.titleElement, state.listElement);
    }

    if (state.titleElement.textContent !== section.title) {
      state.titleElement.textContent = section.title;
    }
  }

  private updateSectionItems(
    state: SettingsTreeSectionState,
    section: SettingsTreeSection,
    targetIds: ReadonlySet<string> | null,
  ): void {
    const nextItemIds = new Set(section.items.map(item => item.id));
    for (const [itemId, item] of Array.from(state.items)) {
      if (!nextItemIds.has(itemId)) {
        this.disposeItemState(item);
        state.items.delete(itemId);
      }
    }

    for (let index = 0; index < section.items.length; index++) {
      const item = section.items[index]!;
      const entry = createSettingsTreeItemEntry(section, item, index);
      let itemState = state.items.get(entry.id);
      if (!itemState) {
        itemState = this.createItemState(entry);
        state.items.set(entry.id, itemState);
      }
      else {
        this.updateItemState(itemState, entry, targetIds);
      }

      const reference = state.listElement.children[index] ?? null;
      if (reference !== itemState.element) {
        state.listElement.insertBefore(itemState.element, reference);
      }
    }
  }

  private createItemState(entry: SettingsTreeItemEntry): SettingsTreeItemState {
    const state: SettingsTreeItemState = {
      element: div("settings-tree-item"),
      entry,
      widget: new SettingsTreeItemWidget(entry.item),
    };
    this.updateItemState(state, entry, null);
    return state;
  }

  private updateItemState(
    state: SettingsTreeItemState,
    entry: SettingsTreeItemEntry,
    targetIds: ReadonlySet<string> | null,
  ): void {
    updateElementClassName(state.element, getSettingsTreeItemClassName(entry));
    updateElementDataset(state.element, "groupId", entry.groupId);
    if (state.widget.kind !== entry.item.kind) {
      state.widget.dispose();
      state.widget = new SettingsTreeItemWidget(entry.item);
    }
    else if (!targetIds || targetIds.has(entry.id)) {
      state.widget.update(entry.item);
    }
    else if (entry.item.kind === "composite" && settingsTreeCompositeItemContainsTarget(entry.item, targetIds)) {
      state.widget.updateCompositeChildren(entry.item, targetIds);
    }

    state.entry = entry;
    if (state.element.firstChild !== state.widget.element) {
      state.element.replaceChildren(state.widget.element);
    }
  }

  private disposeSectionState(section: SettingsTreeSectionState): void {
    for (const item of section.items.values()) {
      this.disposeItemState(item);
    }
    section.items.clear();
    section.element.remove();
  }

  private disposeItemState(item: SettingsTreeItemState): void {
    item.widget.dispose();
    item.element.remove();
  }
}

export class SettingsTreeItemWidget extends Disposable {
  public element: HTMLElement;
  public readonly kind: SettingsTreeItem["kind"];
  private readonly compositeChildren = new Map<string, HTMLElement>();
  private readonly controlChildElements = new Map<string, HTMLElement>();
  private readonly rowElement: HTMLElement | null = null;
  private readonly leadingElement: HTMLElement | null = null;
  private readonly trailingElement: HTMLElement | null = null;

  constructor(item: SettingsTreeItem) {
    super();
    this.kind = item.kind;

    if (item.kind === "control") {
      this.element = card("");
      this.rowElement = div("settings-row");
      this.leadingElement = div("settings-row-leading");
      this.trailingElement = div("settings-row-trailing");
      this.rowElement.append(this.leadingElement, this.trailingElement);
      this.element.appendChild(this.rowElement);
    }
    else if (item.kind === "composite") {
      this.element = card("");
    }
    else {
      this.element = item.element;
    }

    this.update(item);
  }

  public update(item: SettingsTreeItem): void {
    if (item.kind !== this.kind) {
      throw new Error(`Cannot update settings tree ${this.kind} item with ${item.kind} item`);
    }

    if (item.kind === "element") {
      this.updateElementItem(item);
      return;
    }

    if (item.kind === "composite") {
      this.updateCompositeItem(item);
      return;
    }

    updateElementId(this.element, item.id);
    this.updateSearchText(item);
    updateElementClassName(this.rowElement!, "settings-row");
    this.updateControlChildItems("leading", this.leadingElement!, item.leading);
    this.updateControlChildItems("trailing", this.trailingElement!, item.trailing);
  }

  public updateCompositeChildren(item: SettingsTreeCompositeItem, childIds: ReadonlySet<string>): void {
    if (this.kind !== "composite") {
      throw new Error(`Cannot update settings tree ${this.kind} item with composite children`);
    }

    updateElementId(this.element, item.id);
    updateElementClassName(this.element, "settings-card settings-card-composite");
    updateItemSearchText(
      this.element,
      normalizeSettingsSearchText(item.searchText, item.items.map(child => child.searchText)),
    );

    for (let index = 0; index < item.items.length; index++) {
      const child = item.items[index]!;
      if (!childIds.has(child.id)) {
        continue;
      }

      this.updateCompositeChild(child, index);
    }
  }

  public override dispose(): void {
    super.dispose();
    this.element.remove();
  }

  private updateSearchText(item: ControlItem): void {
    const searchText = normalizeSettingsSearchText(
      item.searchText,
      item.leading.map(child => child.searchText),
      item.trailing.map(child => child.searchText),
    );
    updateItemSearchText(this.element, searchText);
  }

  private updateControlChildItems(
    placement: "leading" | "trailing",
    container: HTMLElement,
    items: readonly ControlChildItem[],
  ): void {
    updateElementClassName(container, `settings-row-${placement}`);

    const nextItemKeys = new Set(items.map(item => getControlChildItemKey(placement, item.id)));
    for (const [itemKey, itemElement] of Array.from(this.controlChildElements)) {
      if (itemKey.startsWith(`${placement}:`) && !nextItemKeys.has(itemKey)) {
        itemElement.remove();
        this.controlChildElements.delete(itemKey);
      }
    }

    for (let index = 0; index < items.length; index++) {
      const item = items[index]!;
      const itemKey = getControlChildItemKey(placement, item.id);
      let itemElement = this.controlChildElements.get(itemKey);
      if (!itemElement) {
        itemElement = div(`settings-row-item settings-row-item--${placement}`);
        itemElement.dataset.itemId = item.id;
        this.controlChildElements.set(itemKey, itemElement);
      }
      updateElementClassName(itemElement, `settings-row-item settings-row-item--${placement}`);
      updateElementDataset(itemElement, "itemId", item.id);
      if (itemElement.childNodes.length !== 1 || itemElement.firstChild !== item.element) {
        itemElement.replaceChildren(item.element);
      }

      const expectedNextSibling = container.children[index] ?? null;
      if (expectedNextSibling !== itemElement) {
        container.insertBefore(itemElement, expectedNextSibling);
      }
    }
  }

  private updateElementItem(item: SettingsTreeElementItem): void {
    if (this.element !== item.element) {
      this.element.replaceWith(item.element);
      this.element = item.element;
    }
    updateElementId(this.element, item.id);
    this.element.classList.add("settings-card");
    if (item.searchText !== undefined) {
      updateItemSearchText(this.element, normalizeSettingsSearchText(item.searchText));
    }
  }

  private updateCompositeItem(item: SettingsTreeCompositeItem): void {
    updateElementId(this.element, item.id);
    updateElementClassName(this.element, "settings-card settings-card-composite");
    updateItemSearchText(
      this.element,
      normalizeSettingsSearchText(item.searchText, item.items.map(child => child.searchText)),
    );

    const nextIds = new Set<string>();
    for (let index = 0; index < item.items.length; index++) {
      const child = item.items[index]!;
      nextIds.add(child.id);

      this.updateCompositeChild(child, index);
    }

    for (const [id, childElement] of Array.from(this.compositeChildren)) {
      if (!nextIds.has(id)) {
        childElement.remove();
        this.compositeChildren.delete(id);
      }
    }
  }

  private updateCompositeChild(
    child: SettingsTreeCompositeChildItem,
    index: number,
    childElement = this.compositeChildren.get(child.id),
  ): HTMLElement {
    if (!childElement) {
      childElement = div("settings-tree-composite-child");
      updateElementId(childElement, child.id);
      this.compositeChildren.set(child.id, childElement);
    }

    updateElementClassName(childElement, "settings-tree-composite-child");
    if (childElement.childNodes.length !== 1 || childElement.firstChild !== child.element) {
      childElement.replaceChildren(child.element);
    }

    const expectedNextSibling = this.element.children[index] ?? null;
    if (expectedNextSibling !== childElement) {
      this.element.insertBefore(childElement, expectedNextSibling);
    }
    return childElement;
  }
}

function card(id: string): HTMLDivElement {
  const element = div("settings-card settings-card-row");
  element.id = id;
  return element;
}

function div(className: string, ...children: Array<Node | string>): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  append(element, ...children);
  return element;
}

function updateItemSearchText(element: HTMLElement, searchText: string): void {
  if (searchText) {
    if (element.dataset.search !== searchText) {
      element.dataset.search = searchText;
    }
  }
  else if (element.dataset.search !== undefined) {
    delete element.dataset.search;
  }
}

function updateElementClassName(element: HTMLElement, className: string): void {
  if (element.className !== className) {
    element.className = className;
  }
}

function updateElementId(element: HTMLElement, id: string): void {
  if (element.id !== id) {
    element.id = id;
  }
}

function updateElementDataset(element: HTMLElement, key: string, value: string): void {
  if (element.dataset[key] !== value) {
    element.dataset[key] = value;
  }
}

function getControlChildItemKey(placement: "leading" | "trailing", id: string): string {
  return `${placement}:${id}`;
}

function flattenSettingsTree(sections: readonly SettingsTreeSection[]): SettingsTreeEntry[] {
  const entries: SettingsTreeEntry[] = [];
  for (const section of sections) {
    if (section.title) {
      entries.push({
        kind: "section",
        id: section.id,
        title: section.title,
      });
    }

    for (let index = 0; index < section.items.length; index++) {
      const item = section.items[index];
      entries.push(createSettingsTreeItemEntry(section, item, index));
    }
  }
  return entries;
}

function createSettingsTreeItemEntry(
  section: SettingsTreeSection,
  item: SettingsTreeItem,
  index: number,
): SettingsTreeItemEntry {
  const groupId = getSettingsTreeItemGroupId(section, item);
  const previousItem = section.items[index - 1];
  const nextItem = section.items[index + 1];
  return {
    first: !previousItem || getSettingsTreeItemGroupId(section, previousItem) !== groupId,
    groupId,
    id: item.id,
    item,
    kind: "item",
    last: !nextItem || getSettingsTreeItemGroupId(section, nextItem) !== groupId,
  };
}

function getSettingsTreeItemGroupId(section: SettingsTreeSection, item: SettingsTreeItem): string {
  return item.groupId ?? section.id;
}

function haveSameEntryIds(current: readonly SettingsTreeEntry[], next: readonly SettingsTreeEntry[]): boolean {
  return current.length === next.length &&
    current.every((entry, index) => settingsTreeEntriesHaveSameIdentity(entry, next[index]));
}

function settingsTreeEntriesHaveSameIdentity(entry: SettingsTreeEntry, next: SettingsTreeEntry | undefined): boolean {
  if (!next || entry.id !== next.id || entry.kind !== next.kind) {
    return false;
  }
  if (entry.kind === "section" || next.kind === "section") {
    return true;
  }
  return entry.item.kind === next.item.kind;
}

function settingsTreeCompositeItemContainsTarget(item: SettingsTreeCompositeItem, targetIds: ReadonlySet<string>): boolean {
  return item.items.some(item => targetIds.has(item.id));
}

function getSettingsTreeItemClassName(entry: SettingsTreeItemEntry): string {
  return [
    "settings-tree-item",
    entry.first ? "settings-tree-item--first" : undefined,
    entry.last ? "settings-tree-item--last" : undefined,
  ].filter(Boolean).join(" ");
}

function title(value: string): HTMLElement {
  return text("h3", "settings-title", value);
}

function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  value: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}
