import { append } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { IListRenderer, IListVirtualDelegate } from "src/cs/base/browser/ui/list/list";
import { List } from "src/cs/base/browser/ui/list/listWidget";
import { normalizeSettingsSearchText } from "src/cs/workbench/contrib/settings/browser/settingsSearch";
import "src/cs/base/browser/ui/list/list.css";

export type SettingsTreeControlItem = {
  readonly kind: "control";
  readonly control: HTMLElement;
  readonly description?: string;
  readonly id: string;
  readonly searchText?: string;
  readonly title: string;
};

export type SettingsTreeElementItem = {
  readonly kind: "element";
  readonly element: HTMLElement;
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
  readonly id: string;
  readonly items: readonly SettingsTreeCompositeChildItem[];
  readonly searchText?: string;
};

export type SettingsTreeItem = SettingsTreeControlItem | SettingsTreeElementItem | SettingsTreeCompositeItem;

export type SettingsTreeSection = {
  readonly id: string;
  readonly items: readonly SettingsTreeItem[];
  readonly title?: string;
};

type SettingsTreeListEntry = SettingsTreeSectionEntry | SettingsTreeItemEntry;

type SettingsTreeSectionEntry = {
  readonly kind: "section";
  readonly id: string;
  readonly title: string;
};

type SettingsTreeItemEntry = {
  readonly first: boolean;
  readonly id: string;
  readonly item: SettingsTreeItem;
  readonly kind: "item";
  readonly last: boolean;
};

// Small settings tree: section and item ids are stable keys. Control items use
// fixed label/control slots; element items use caller-owned item content.
// SettingsView owns control behavior and lifecycle.
export class SettingsTree extends Disposable {
  public readonly element = div("settings-tree");
  private entries: readonly SettingsTreeListEntry[] = [];
  private readonly list: List<SettingsTreeListEntry>;

  constructor() {
    super();
    this.list = this._register(new List(this.element, {
      delegate: new SettingsTreeListDelegate(),
      getKey: entry => entry.id,
      identityProvider: {
        getId: entry => entry.id,
      },
      items: [],
      keyboardSupport: false,
      minVirtualCount: Number.MAX_SAFE_INTEGER,
      mouseSupport: false,
      multipleSelectionSupport: false,
      renderers: [
        new SettingsTreeSectionRenderer(),
        new SettingsTreeItemRenderer(),
      ],
      rowRole: "presentation",
    }));
  }

  public update(sections: readonly SettingsTreeSection[]): void {
    this.entries = flattenSettingsTree(sections);
    this.list.setItems(this.entries);
  }

  public updateItems(sections: readonly SettingsTreeSection[], itemIds: readonly string[]): void {
    const nextEntries = flattenSettingsTree(sections);
    if (!haveSameEntryIds(this.entries, nextEntries)) {
      this.entries = nextEntries;
      this.list.setItems(nextEntries);
      return;
    }

    const targetIds = new Set(itemIds);
    const entries = this.entries.slice();
    for (let index = 0; index < nextEntries.length; index++) {
      const nextEntry = nextEntries[index];
      if (!settingsTreeEntryContainsTarget(nextEntry, targetIds)) {
        continue;
      }
      entries[index] = nextEntry;
      this.list.splice(index, 1, [nextEntry]);
    }
    this.entries = entries;
  }

  public override dispose(): void {
    super.dispose();
    this.element.remove();
  }
}

class SettingsTreeListDelegate implements IListVirtualDelegate<SettingsTreeListEntry> {
  public getHeight(entry: SettingsTreeListEntry): number {
    if (entry.kind === "section") {
      return 52;
    }

    if (entry.item.kind === "control") {
      return entry.item.description ? 92 : 72;
    }

    return 160;
  }

  public getTemplateId(entry: SettingsTreeListEntry): string {
    return entry.kind;
  }
}

class SettingsTreeSectionRenderer implements IListRenderer<SettingsTreeListEntry, HTMLElement> {
  public readonly templateId = "section";

  public renderTemplate(container: HTMLElement): HTMLElement {
    const element = div("settings-section", title(""));
    container.appendChild(element);
    return element;
  }

  public renderElement(entry: SettingsTreeListEntry, _index: number, element: HTMLElement): void {
    if (entry.kind !== "section") {
      throw new Error(`Cannot render settings tree ${entry.kind} entry with section renderer`);
    }

    element.id = entry.id;
    const titleElement = element.querySelector<HTMLElement>(".settings-title");
    if (titleElement) {
      titleElement.textContent = entry.title;
    }
  }

  public disposeTemplate(element: HTMLElement): void {
    element.remove();
  }
}

type SettingsTreeItemTemplate = {
  readonly container: HTMLElement;
  widget: SettingsTreeItemWidget | null;
};

class SettingsTreeItemRenderer implements IListRenderer<SettingsTreeListEntry, SettingsTreeItemTemplate> {
  public readonly templateId = "item";

  public renderTemplate(container: HTMLElement): SettingsTreeItemTemplate {
    const itemContainer = div("settings-tree-item");
    container.appendChild(itemContainer);
    return { container: itemContainer, widget: null };
  }

  public renderElement(entry: SettingsTreeListEntry, _index: number, template: SettingsTreeItemTemplate): void {
    if (entry.kind !== "item") {
      throw new Error(`Cannot render settings tree ${entry.kind} entry with item renderer`);
    }

    template.container.className = getSettingsTreeItemClassName(entry);
    if (template.widget && template.widget.kind !== entry.item.kind) {
      template.widget.dispose();
      template.widget = null;
    }
    if (!template.widget) {
      template.widget = new SettingsTreeItemWidget(entry.item);
    }
    else {
      template.widget.update(entry.item);
    }
    if (template.container.firstChild !== template.widget.element) {
      template.container.replaceChildren(template.widget.element);
    }
  }

  public disposeElement(_entry: SettingsTreeListEntry, _index: number, template: SettingsTreeItemTemplate): void {
    template.widget?.dispose();
    template.widget = null;
    template.container.replaceChildren();
  }

  public disposeTemplate(template: SettingsTreeItemTemplate): void {
    template.widget?.dispose();
    template.container.remove();
  }
}

export class SettingsTreeItemWidget extends Disposable {
  public element: HTMLElement;
  public readonly kind: SettingsTreeItem["kind"];
  private readonly compositeChildren = new Map<string, HTMLElement>();
  private readonly rowElement: HTMLElement | null = null;
  private readonly labelElement: HTMLElement | null = null;
  private readonly titleElement: HTMLElement | null = null;
  private readonly descriptionElement: HTMLElement | null = null;
  private readonly controlElement: HTMLElement | null = null;

  constructor(item: SettingsTreeItem) {
    super();
    this.kind = item.kind;

    if (item.kind === "control") {
      this.element = card("");
      this.rowElement = div("settings-row settings-split-row");
      this.labelElement = div("settings-row-title");
      this.titleElement = title("");
      this.descriptionElement = text("p", "settings-description", "");
      this.controlElement = div("settings-row-control");
      this.labelElement.append(this.titleElement, this.descriptionElement);
      this.rowElement.append(this.labelElement, this.controlElement);
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

    this.element.id = item.id;
    this.updateSearchText(item);
    this.updateLabel(item);
    this.controlElement!.className = "settings-row-control";
    this.updateControl(item.control);
  }

  public override dispose(): void {
    super.dispose();
    this.element.remove();
  }

  private updateLabel(item: SettingsTreeControlItem): void {
    this.labelElement!.className = item.description ? "settings-heading" : "settings-row-title";
    this.titleElement!.textContent = item.title;
    this.descriptionElement!.hidden = !item.description;
    this.descriptionElement!.textContent = item.description ?? "";
  }

  private updateSearchText(item: SettingsTreeControlItem): void {
    const searchText = normalizeSettingsSearchText(item.title, item.description, item.searchText);
    updateItemSearchText(this.element, searchText);
  }

  private updateControl(control: HTMLElement): void {
    if (this.controlElement!.childNodes.length !== 1 || this.controlElement!.firstChild !== control) {
      this.controlElement!.replaceChildren(control);
    }
  }

  private updateElementItem(item: SettingsTreeElementItem): void {
    if (this.element !== item.element) {
      this.element.replaceWith(item.element);
      this.element = item.element;
    }
    this.element.id = item.id;
    this.element.classList.add("settings-card");
    if (item.searchText !== undefined) {
      updateItemSearchText(this.element, normalizeSettingsSearchText(item.searchText));
    }
  }

  private updateCompositeItem(item: SettingsTreeCompositeItem): void {
    this.element.id = item.id;
    this.element.className = "settings-card settings-card-composite";
    updateItemSearchText(
      this.element,
      normalizeSettingsSearchText(item.searchText, item.items.map(child => child.searchText)),
    );

    const nextIds = new Set<string>();
    for (let index = 0; index < item.items.length; index++) {
      const child = item.items[index]!;
      nextIds.add(child.id);

      let childSlot = this.compositeChildren.get(child.id);
      if (!childSlot) {
        childSlot = div("settings-tree-composite-child");
        childSlot.id = child.id;
        this.compositeChildren.set(child.id, childSlot);
      }

      childSlot.className = "settings-tree-composite-child";
      if (childSlot.childNodes.length !== 1 || childSlot.firstChild !== child.element) {
        childSlot.replaceChildren(child.element);
      }

      const expectedNextSibling = this.element.children[index] ?? null;
      if (expectedNextSibling !== childSlot) {
        this.element.insertBefore(childSlot, expectedNextSibling);
      }
    }

    for (const [id, childSlot] of Array.from(this.compositeChildren)) {
      if (!nextIds.has(id)) {
        childSlot.remove();
        this.compositeChildren.delete(id);
      }
    }
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
    element.dataset.search = searchText;
  }
  else {
    delete element.dataset.search;
  }
}

function flattenSettingsTree(sections: readonly SettingsTreeSection[]): SettingsTreeListEntry[] {
  const entries: SettingsTreeListEntry[] = [];
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
      entries.push({
        first: index === 0,
        id: item.id,
        item,
        kind: "item",
        last: index === section.items.length - 1,
      });
    }
  }
  return entries;
}

function haveSameEntryIds(current: readonly SettingsTreeListEntry[], next: readonly SettingsTreeListEntry[]): boolean {
  return current.length === next.length &&
    current.every((entry, index) => entry.id === next[index]?.id);
}

function settingsTreeEntryContainsTarget(entry: SettingsTreeListEntry, targetIds: ReadonlySet<string>): boolean {
  if (targetIds.has(entry.id)) {
    return true;
  }
  return entry.kind === "item" &&
    entry.item.kind === "composite" &&
    entry.item.items.some(item => targetIds.has(item.id));
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
