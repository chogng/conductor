import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { ActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import type { IAction } from "src/cs/base/common/actions";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { LxIconDefinition } from "src/cs/base/common/lxicon";
import { normalizeSettingsSearchText, settingsSearchMatches } from "src/cs/workbench/contrib/settings/browser/settingsSearch";

export type SettingsTreeElementItem = {
  readonly bodyPadding?: "standard";
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

export type SettingsTreeItem = SettingsTreeElementItem | SettingsTreeCompositeItem;

export type SettingsTreeSection = {
  readonly description?: string;
  readonly headerActions?: readonly SettingsTreeSectionHeaderAction[];
  readonly headerId?: string;
  readonly id: string;
  readonly items: readonly SettingsTreeItem[];
  readonly title?: string;
};

export type SettingsTreeSectionHeaderAction = {
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly icon?: LxIconDefinition;
  readonly id: string;
  readonly label: string;
  readonly run: () => void;
};

type SettingsTreeEntry = SettingsTreeSectionEntry | SettingsTreeItemEntry;

type SettingsTreeSectionEntry = {
  readonly kind: "section";
  readonly id: string;
};

type SettingsTreeItemEntry = {
  readonly bodyPadding: "none" | "standard";
  readonly first: boolean;
  readonly groupId: string;
  readonly hasDivider: boolean;
  readonly id: string;
  readonly item: SettingsTreeItem;
  readonly kind: "item";
  readonly last: boolean;
};

export type SettingsTreeListItemRenderState = {
  readonly bodyPadding: "none" | "standard";
  readonly first: boolean;
  readonly groupId: string;
  readonly hasDivider: boolean;
  readonly id: string;
  readonly last: boolean;
};

export type SettingsTreeSectionTemplate = {
  readonly bodyElement: HTMLElement;
  readonly element: HTMLElement;
  readonly listElement: HTMLElement;
};

export type SettingsTreeSectionHeaderTemplate = {
  readonly actionBarElement: HTMLElement;
  readonly descriptionElement: HTMLElement;
  readonly element: HTMLElement;
  readonly titleElement: HTMLElement;
};

export type SettingsTreeListItemTemplate = {
  readonly bodyElement: HTMLElement;
  readonly dividerElement: HTMLElement;
  readonly element: HTMLElement;
};

export type SettingsTreeRenderer = {
  readonly createCompositeChild: (item: SettingsTreeCompositeChildItem) => HTMLElement;
  readonly createCompositeItem: (item: SettingsTreeCompositeItem) => HTMLElement;
  readonly createListItem: (item: SettingsTreeListItemRenderState) => SettingsTreeListItemTemplate;
  readonly createRoot: () => HTMLElement;
  readonly createSection: (section: SettingsTreeSection) => SettingsTreeSectionTemplate;
  readonly createSectionHeader: (section: SettingsTreeSection) => SettingsTreeSectionHeaderTemplate;
  readonly updateCompositeChild: (element: HTMLElement, item: SettingsTreeCompositeChildItem) => void;
  readonly updateCompositeItem: (element: HTMLElement, item: SettingsTreeCompositeItem) => void;
  readonly updateListItem: (template: SettingsTreeListItemTemplate, item: SettingsTreeListItemRenderState) => void;
};

type SettingsTreeSectionState = {
  actionBar: ActionBar | null;
  readonly bodyElement: HTMLElement;
  readonly element: HTMLElement;
  headerTemplate: SettingsTreeSectionHeaderTemplate | null;
  readonly items: Map<string, SettingsTreeItemState>;
  readonly listElement: HTMLElement;
};

type SettingsTreeItemState = {
  readonly element: HTMLElement;
  entry: SettingsTreeItemEntry;
  readonly listItemTemplate: SettingsTreeListItemTemplate;
  widget: SettingsTreeItemWidget;
};

// Small settings tree: section and item ids are stable keys. SettingsView owns
// cell DOM, control behavior, and renderer-owned structural classes.
export class SettingsTree extends Disposable {
  public readonly element: HTMLElement;
  private entries: readonly SettingsTreeEntry[] = [];
  private readonly sections = new Map<string, SettingsTreeSectionState>();

  constructor(private readonly renderer: SettingsTreeRenderer) {
    super();
    this.element = this.renderer.createRoot();
  }

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

  public updateItemSearchText(itemId: string, searchText: string): void {
    const normalizedSearchText = normalizeSettingsSearchText(searchText);
    this.entries = this.entries.map(entry => {
      if (entry.kind !== "item" || entry.id !== itemId) {
        return entry;
      }
      return {
        ...entry,
        item: updateSettingsTreeItemSearchText(entry.item, normalizedSearchText),
      };
    });

    for (const section of this.sections.values()) {
      const state = section.items.get(itemId);
      if (!state) {
        continue;
      }
      state.entry = {
        ...state.entry,
        item: updateSettingsTreeItemSearchText(state.entry.item, normalizedSearchText),
      };
      return;
    }
  }

  public filterSearchResults(queryWords: readonly string[]): number {
    let resultCount = 0;
    for (const section of this.sections.values()) {
      let visibleItemCount = 0;
      for (const item of section.items.values()) {
        const isMatch = queryWords.length === 0 ||
          settingsSearchMatches(getSettingsTreeItemSearchText(item.entry.item), queryWords);
        item.element.hidden = !isMatch;
        if (isMatch) {
          visibleItemCount++;
          resultCount++;
        }
      }
      section.element.hidden = visibleItemCount === 0;
    }
    return resultCount;
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

      this.updateSectionHeader(state, section);
      this.updateSectionItems(state, section, targetIds);
      const reference = this.element.children[index] ?? null;
      if (reference !== state.element) {
        this.element.insertBefore(state.element, reference);
      }
    }
  }

  private createSectionState(section: SettingsTreeSection): SettingsTreeSectionState {
    const template = this.renderer.createSection(section);
    updateElementId(template.element, section.id);
    const listElement = template.listElement;
    listElement.setAttribute("role", "list");
    return {
      bodyElement: template.bodyElement,
      element: template.element,
      actionBar: null,
      headerTemplate: null,
      items: new Map(),
      listElement,
    };
  }

  private updateSectionHeader(state: SettingsTreeSectionState, section: SettingsTreeSection): void {
    updateElementId(state.element, section.id);
    const titleText = section.title ?? "";
    const descriptionText = section.description ?? "";
    const actions = section.headerActions ?? [];
    if (titleText.length === 0 && descriptionText.length === 0 && actions.length === 0) {
      state.actionBar?.dispose();
      state.actionBar = null;
      state.headerTemplate?.element.remove();
      state.headerTemplate = null;
      return;
    }

    if (!state.headerTemplate) {
      state.headerTemplate = this.renderer.createSectionHeader(section);
      state.element.insertBefore(state.headerTemplate.element, state.bodyElement);
    }

    updateElementId(state.headerTemplate.element, section.headerId ?? `${section.id}-header`);
    state.headerTemplate.titleElement.hidden = titleText.length === 0;
    state.headerTemplate.descriptionElement.hidden = descriptionText.length === 0;
    state.headerTemplate.actionBarElement.hidden = actions.length === 0;
    if (state.headerTemplate.titleElement.textContent !== titleText) {
      state.headerTemplate.titleElement.textContent = titleText;
    }
    if (state.headerTemplate.descriptionElement.textContent !== descriptionText) {
      state.headerTemplate.descriptionElement.textContent = descriptionText;
    }
    this.updateSectionHeaderActions(state, actions);
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
    const template = this.renderer.createListItem(entry);
    template.element.setAttribute("role", "listitem");
    const state: SettingsTreeItemState = {
      element: template.element,
      entry,
      listItemTemplate: template,
      widget: new SettingsTreeItemWidget(entry.item, this.renderer),
    };
    this.updateItemState(state, entry, null);
    return state;
  }

  private updateItemState(
    state: SettingsTreeItemState,
    entry: SettingsTreeItemEntry,
    targetIds: ReadonlySet<string> | null,
  ): void {
    this.renderer.updateListItem(state.listItemTemplate, entry);
    if (state.widget.kind !== entry.item.kind) {
      state.widget.dispose();
      state.widget = new SettingsTreeItemWidget(entry.item, this.renderer);
    }
    else if (!targetIds || targetIds.has(entry.id)) {
      state.widget.update(entry.item);
    }
    else if (entry.item.kind === "composite" && settingsTreeCompositeItemContainsTarget(entry.item, targetIds)) {
      state.widget.updateCompositeChildren(entry.item, targetIds);
    }

    state.entry = entry;
    if (state.listItemTemplate.bodyElement.firstChild !== state.widget.element) {
      state.listItemTemplate.bodyElement.replaceChildren(state.widget.element);
    }
  }

  private disposeSectionState(section: SettingsTreeSectionState): void {
    section.actionBar?.dispose();
    section.actionBar = null;
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

  private updateSectionHeaderActions(
    state: SettingsTreeSectionState,
    actions: readonly SettingsTreeSectionHeaderAction[],
  ): void {
    if (!state.headerTemplate) {
      return;
    }
    state.actionBar?.dispose();
    state.actionBar = null;
    if (!actions.length) {
      return;
    }

    const actionBar = new ActionBar({
      ariaLabel: actions.map(action => action.label).join(", "),
      className: "settings-section-header-actionbar",
      actionViewItemProvider: (action, options) =>
        new SettingsSectionHeaderActionViewItem(action, options),
    });
    for (const item of actions) {
      const action: IAction = {
        id: item.id,
        label: item.label,
        tooltip: item.ariaLabel,
        class: undefined,
        enabled: item.disabled !== true,
        icon: item.icon,
        run: () => item.run(),
      };
      actionBar.push(action, {
        className: "settings-section-header-action",
        label: true,
      });
    }
    state.actionBar = actionBar;
    state.headerTemplate.actionBarElement.replaceChildren(actionBar.domNode);
  }
}

class SettingsSectionHeaderActionViewItem extends ActionViewItem {
  constructor(
    action: IAction,
    options: IActionViewItemOptions,
  ) {
    super(undefined, action, options);
  }

  public override render(container: HTMLElement): void {
    super.render(container);
    const button = container.querySelector<HTMLButtonElement>("button");
    if (button) {
      updateElementId(button, this.action.id);
    }
  }

  protected override updateLabel(): void {
    if (!this.label) {
      return;
    }
    if (!this.action.icon) {
      super.updateLabel();
      return;
    }

    const label = document.createElement("span");
    label.className = "settings-section-header-action-label";
    label.textContent = this.options.label === false ? "" : this.action.label;
    this.label.replaceChildren(
      createLxIcon({
        className: "settings-section-header-action-icon",
        icon: this.action.icon,
        size: 14,
      }),
      label,
    );
  }
}

export class SettingsTreeItemWidget extends Disposable {
  public element: HTMLElement;
  public readonly kind: SettingsTreeItem["kind"];
  private readonly compositeChildren = new Map<string, HTMLElement>();

  constructor(
    item: SettingsTreeItem,
    private readonly renderer: SettingsTreeRenderer,
  ) {
    super();
    this.kind = item.kind;

    if (item.kind === "composite") {
      this.element = this.renderer.createCompositeItem(item);
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

    if (item.kind === "composite") {
      this.updateCompositeItem(item);
      return;
    }

    this.updateElementItem(item);
  }

  public updateCompositeChildren(item: SettingsTreeCompositeItem, childIds: ReadonlySet<string>): void {
    if (this.kind !== "composite") {
      throw new Error(`Cannot update settings tree ${this.kind} item with composite children`);
    }

    updateElementId(this.element, item.id);
    this.renderer.updateCompositeItem(this.element, item);
    this.element.removeAttribute("role");
    this.element.removeAttribute("data-search");

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

  private updateElementItem(item: SettingsTreeElementItem): void {
    if (this.element !== item.element) {
      this.element.replaceWith(item.element);
      this.element = item.element;
    }
    updateElementId(this.element, item.id);
    this.element.removeAttribute("role");
    this.element.removeAttribute("data-search");
  }

  private updateCompositeItem(item: SettingsTreeCompositeItem): void {
    updateElementId(this.element, item.id);
    this.renderer.updateCompositeItem(this.element, item);
    this.element.removeAttribute("role");
    this.element.removeAttribute("data-search");

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
      childElement = this.renderer.createCompositeChild(child);
      updateElementId(childElement, child.id);
      this.compositeChildren.set(child.id, childElement);
    }

    this.renderer.updateCompositeChild(childElement, child);
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

function updateElementId(element: HTMLElement, id: string): void {
  if (element.id !== id) {
    element.id = id;
  }
}

function flattenSettingsTree(sections: readonly SettingsTreeSection[]): SettingsTreeEntry[] {
  const entries: SettingsTreeEntry[] = [];
  for (const section of sections) {
    entries.push({
      kind: "section",
      id: section.id,
    });

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
    bodyPadding: item.kind === "element" ? item.bodyPadding ?? "none" : "none",
    first: !previousItem || getSettingsTreeItemGroupId(section, previousItem) !== groupId,
    groupId,
    hasDivider: index > 0,
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

function updateSettingsTreeItemSearchText(item: SettingsTreeItem, searchText: string): SettingsTreeItem {
  if (item.kind === "element") {
    return {
      ...item,
      searchText,
    };
  }
  return {
    ...item,
    searchText,
  };
}

function getSettingsTreeItemSearchText(item: SettingsTreeItem): string {
  if (item.kind === "composite") {
    return normalizeSettingsSearchText(item.searchText, item.items.map(child => child.searchText));
  }
  return normalizeSettingsSearchText(item.searchText);
}
