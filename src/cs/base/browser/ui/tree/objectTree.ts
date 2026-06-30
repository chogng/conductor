import { ListView, type IListViewOptions, type ListRenderRange } from "src/cs/base/browser/ui/list/listView";
import type {
  IListRenderer,
  IListVirtualDelegate,
} from "src/cs/base/browser/ui/list/list";
import type { ListHandle } from "src/cs/base/browser/ui/list/listWidget";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import {
  ObjectTreeModel,
  type FlattenedObjectTreeNode,
} from "src/cs/base/browser/ui/tree/objectTreeModel";
import type {
  IObjectTreeOptions,
  IObjectTreeOptionsUpdate,
  ITreeElementRenderDetails,
  ITreeNode,
  ITreeRenderRangeEvent,
  ITreeRenderer,
  ITreeSelectionEvent,
} from "src/cs/base/browser/ui/tree/tree";

import "src/cs/base/browser/ui/tree/media/tree.css";

const classNames = (...names: Array<string | undefined>): string =>
  names.filter(Boolean).join(" ");

const renderChevron = (collapsed: boolean): HTMLSpanElement => {
  const icon = document.createElement("span");
  icon.className = "ui-tree__disclosure-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.dataset.collapsed = collapsed ? "true" : "false";
  icon.innerHTML = normalizeLxIconSvgMarkup(LxIcon.chevronRight);
  return icon;
};

type TreeRowTemplate<T, TTemplateData> = {
  collapsed: boolean;
  disclosure: HTMLButtonElement;
  disclosureIcon: HTMLSpanElement;
  entry: FlattenedObjectTreeNode<T> | null;
  item: HTMLDivElement;
  label: HTMLDivElement;
  renderer: ITreeRenderer<T, TTemplateData> | null;
  templateData: TTemplateData | null;
};

const isInteractiveEventTarget = (event: MouseEvent): boolean => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest("button, input, textarea, select, a, [role='button'], [role='menuitem']"),
  );
};

export class ObjectTree<T, TTemplateData = HTMLElement> implements ListHandle {
  private readonly root: HTMLDivElement;
  private readonly listHost: HTMLDivElement;
  private readonly list: ListView<FlattenedObjectTreeNode<T>>;
  private readonly rowTemplates = new WeakMap<HTMLElement, TreeRowTemplate<T, TTemplateData>>();
  private readonly rowTemplateSet = new Set<TreeRowTemplate<T, TTemplateData>>();
  private focusedKey: string | null = null;
  private flattenedItems: FlattenedObjectTreeNode<T>[] = [];
  private flattenedItemSignatures = new Map<string, string>();
  private flattenedItemsSource: T[] | null = null;
  private flattenedCollapsedKey = "";
  private flattenedGetChildren: IObjectTreeOptions<T, TTemplateData>["getChildren"] | null = null;
  private flattenedGetKey: IObjectTreeOptions<T, TTemplateData>["getKey"] | null = null;
  private readonly model: ObjectTreeModel<T>;
  private options: IObjectTreeOptions<T, TTemplateData>;
  private readonly listGetKey = (entry: FlattenedObjectTreeNode<T>) => entry.key;
  private readonly listRenderer: IListRenderer<FlattenedObjectTreeNode<T>, HTMLElement> = {
    templateId: "tree",
    renderTemplate: (container) => this.renderListTemplate(container),
    renderElement: (entry, index, container) => this.renderTreeItem(entry, index, container),
    disposeElement: (entry, index, container) => this.disposeTreeItem(entry, index, container),
    disposeTemplate: (container) => this.disposeListTemplate(container),
  };
  private readonly listRenderers = [this.listRenderer];

  constructor(host: HTMLElement, options: IObjectTreeOptions<T, TTemplateData>) {
    this.options = options;
    this.model = new ObjectTreeModel(options);

    this.root = document.createElement("div");
    this.root.className = classNames("ui-tree", options.className);

    this.listHost = document.createElement("div");
    this.listHost.className = "ui-tree__list";
    this.root.appendChild(this.listHost);
    host.appendChild(this.root);

    this.list = new ListView(this.listHost, this.createListOptions());
  }

  setChildren(items: T[]): void {
    this.options = { ...this.options, items };
    this.model.update(this.options);
    this.list.setProps(this.createListOptions());
  }

  rerenderByKey(key: string): void {
    const index = this.getFlattenedItems().findIndex(entry => entry.key === key);
    if (index < 0) {
      return;
    }

    this.list.rerender(index);
  }

  rerenderByKeys(keys: readonly string[]): void {
    if (!keys.length) {
      return;
    }

    const keySet = new Set(keys);
    const items = this.getFlattenedItems();
    const indexes: number[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const entry = items[index];
      if (entry && keySet.has(entry.key)) {
        indexes.push(index);
      }
    }
    this.list.rerenderIndexes(indexes);
  }

  update(options: IObjectTreeOptions<T, TTemplateData>): void {
    this.options = options;
    this.model.update(options);
    this.root.className = classNames("ui-tree", options.className);
    this.list.setProps(this.createListOptions());
  }

  updateOptions(options: IObjectTreeOptionsUpdate<T, TTemplateData>): void {
    this.options = { ...this.options, ...options };
    this.model.update(this.options);
    this.root.className = classNames("ui-tree", this.options.className);
    this.list.setProps(this.createListOptions());
  }

  dispose(): void {
    this.list.dispose();
    this.rowTemplateSet.clear();
    this.root.remove();
  }

  focus(): void {
    this.list.focus();
  }

  getViewport(): HTMLDivElement | null {
    return this.list.getViewport();
  }

  layout(height?: number, width?: number): void {
    this.list.layout(height, width);
  }

  scrollToEnd(behavior?: ScrollBehavior): void {
    this.list.scrollToEnd(behavior);
  }

  scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    this.list.scrollToIndex(index, behavior);
  }

  scrollToStart(behavior?: ScrollBehavior): void {
    this.list.scrollToStart(behavior);
  }

  private createListOptions(): IListViewOptions<FlattenedObjectTreeNode<T>> {
    const flattenedItems = this.getFlattenedItems();
    const options = this.options;

    return {
      className: "ui-tree__list",
      delegate: this.createListDelegate(),
      empty: options.empty,
      disposeEmpty: options.disposeEmpty,
      getKey: this.listGetKey,
      gap: options.gap,
      items: flattenedItems,
      minVirtualCount: options.minVirtualCount,
      onDidFocus: (event) => {
        const entry = event.elements[0];
        this.focusedKey = entry?.key ?? null;
      },
      onDidRenderRange: (range: ListRenderRange) => options.onDidRenderRange?.(
        this.createTreeRenderRangeEvent(flattenedItems, range),
      ),
      onKeyDown: (event: KeyboardEvent) => this.handleKeyDown(event),
      onScroll: options.onScroll,
      onSelect: (
        entry: FlattenedObjectTreeNode<T>,
        index: number,
        event?: KeyboardEvent | MouseEvent,
      ) => this.handleSelect(entry, index, event),
      overscanRows: options.overscanRows,
      renderers: this.listRenderers,
      role: "tree",
      rowRole: "treeitem",
      selectedKey: options.selectedKey,
      viewportClassName: options.viewportClassName,
    };
  }

  private createListDelegate(): IListVirtualDelegate<FlattenedObjectTreeNode<T>> {
    return {
      getTemplateId: () => "tree",
      getHeight: (entry) => {
        const resolvedHeight = Number(this.options.delegate.getHeight(entry.item));
        return Number.isFinite(resolvedHeight) && resolvedHeight > 0
          ? resolvedHeight
          : 32;
      },
    };
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const focusedEntry = this.getFlattenedItems().find(
      (entry) => entry.key === this.focusedKey,
    );

    if (!focusedEntry) {
      this.options.onKeyDown?.(event);
      return;
    }

    if (event.key === "ArrowRight") {
      if (focusedEntry.expandable && this.model.isCollapsed(focusedEntry.key)) {
        event.preventDefault();
        this.setCollapsed(focusedEntry.key, false);
        return;
      }
    } else if (event.key === "ArrowLeft") {
      if (focusedEntry.expandable && !this.model.isCollapsed(focusedEntry.key)) {
        event.preventDefault();
        this.setCollapsed(focusedEntry.key, true);
        return;
      }
    } else {
      this.options.onKeyDown?.(event);
    }
  }

  private handleSelect(
    entry: FlattenedObjectTreeNode<T>,
    index: number,
    event?: KeyboardEvent | MouseEvent,
  ): void {
    if (this.shouldToggleCollapsedOnSelect(entry, event)) {
      this.toggleCollapsed(entry.key);
    }

    this.options.onSelect?.({
      depth: entry.depth,
      element: entry.item,
      index,
    });
  }

  private shouldToggleCollapsedOnSelect(
    entry: FlattenedObjectTreeNode<T>,
    event?: KeyboardEvent | MouseEvent,
  ): boolean {
    if (
      !entry.expandable ||
      !(event instanceof MouseEvent) ||
      isInteractiveEventTarget(event)
    ) {
      return false;
    }

    const { expandOnlyOnTwistieClick } = this.options;
    if (typeof expandOnlyOnTwistieClick === "function") {
      return !expandOnlyOnTwistieClick(entry.item);
    }

    return expandOnlyOnTwistieClick === false;
  }

  private setCollapsed(key: string, collapsed: boolean): void {
    const wasCollapsed = this.model.isCollapsed(key);
    if (wasCollapsed === collapsed) {
      return;
    }

    const previousItems = this.getFlattenedItems();
    const index = previousItems.findIndex(entry => entry.key === key);
    const collapsedKeys = this.model.setCollapsed(key, collapsed);
    if (index < 0) {
      this.invalidateFlattenedItems();
      this.list.setProps(this.createListOptions());
      this.options.onDidChangeCollapseState?.(collapsedKeys);
      return;
    }

    const entry = previousItems[index];
    if (!entry) {
      this.options.onDidChangeCollapseState?.(collapsedKeys);
      return;
    }

    if (collapsed) {
      const deleteCount = this.countVisibleDescendants(previousItems, index);
      if (deleteCount > 0) {
        this.flattenedItems = [
          ...previousItems.slice(0, index + 1),
          ...previousItems.slice(index + 1 + deleteCount),
        ];
        this.list.splice(index + 1, deleteCount, []);
      }
    } else {
      const inserted = this.model.getVisibleDescendants(entry.item, entry.depth);
      if (inserted.length > 0) {
        this.flattenedItems = [
          ...previousItems.slice(0, index + 1),
          ...inserted,
          ...previousItems.slice(index + 1),
        ];
        this.list.splice(index + 1, 0, inserted);
      }
    }

    this.markFlattenedItemsFresh();
    this.list.rerender(index);
    this.options.onDidChangeCollapseState?.(collapsedKeys);
  }

  private toggleCollapsed(key: string): void {
    this.setCollapsed(key, !this.model.isCollapsed(key));
  }

  private renderTreeItem(
    entry: FlattenedObjectTreeNode<T>,
    index: number,
    container: HTMLElement,
  ): void {
    const collapsed = entry.expandable && this.model.isCollapsed(entry.key);
    const row = container.parentElement;
    if (row) {
      row.setAttribute("aria-level", String(entry.depth + 1));
      if (entry.expandable) {
        row.setAttribute("aria-expanded", String(!collapsed));
      } else {
        row.removeAttribute("aria-expanded");
      }
    }
    const template = this.getRowTemplate(container);
    template.entry = entry;
    template.collapsed = collapsed;
    template.item.dataset.expandable = entry.expandable ? "true" : "false";
    template.item.style.paddingLeft = `${entry.depth * 16}px`;
    template.label.className = "ui-tree__label";
    template.disclosure.disabled = !entry.expandable;
    if (entry.expandable) {
      template.disclosure.setAttribute(
        "aria-label",
        collapsed
          ? localize("tree.expand", "Expand")
          : localize("tree.collapse", "Collapse"),
      );
      template.disclosure.setAttribute("aria-expanded", String(!collapsed));
      template.disclosureIcon.dataset.collapsed = collapsed ? "true" : "false";
      if (template.disclosureIcon.parentElement !== template.disclosure) {
        template.disclosure.replaceChildren(template.disclosureIcon);
      }
    } else {
      template.disclosure.removeAttribute("aria-label");
      template.disclosure.removeAttribute("aria-expanded");
      template.disclosure.replaceChildren();
    }

    const templateData = this.getRendererTemplateData(template);
    this.options.renderer.renderElement(this.toTreeNode(entry), index, templateData, {
      collapsed,
      depth: entry.depth,
      expandable: entry.expandable,
    });
  }

  private disposeTreeItem(
    entry: FlattenedObjectTreeNode<T>,
    index: number,
    container: HTMLElement,
  ): void {
    const template = this.rowTemplates.get(container);
    if (template?.templateData) {
      this.options.renderer.disposeElement?.(
        this.toTreeNode(entry),
        index,
        template.templateData,
      );
      if (!this.options.renderer.renderTemplate) {
        template.label.replaceChildren();
      }
      template.entry = null;
      template.label.className = "ui-tree__label";
    }
  }

  private renderListTemplate(container: HTMLElement): HTMLElement {
    const mount = document.createElement("div");
    mount.className = "ui-list__row-content";
    container.appendChild(mount);
    return mount;
  }

  private disposeListTemplate(container: HTMLElement): void {
    const template = this.rowTemplates.get(container);
    if (template) {
      this.disposeRendererTemplate(template);
      this.rowTemplateSet.delete(template);
      this.rowTemplates.delete(container);
    }
    container.replaceChildren();
  }

  private getRowTemplate(container: HTMLElement): TreeRowTemplate<T, TTemplateData> {
    const existing = this.rowTemplates.get(container);
    if (existing) {
      if (existing.item.parentElement !== container) {
        container.appendChild(existing.item);
      }
      return existing;
    }

    const item = document.createElement("div");
    item.className = "ui-tree__item";

    const disclosure = document.createElement("button");
    disclosure.type = "button";
    disclosure.className = "ui-tree__disclosure";

    const label = document.createElement("div");
    label.className = "ui-tree__label";

    const template: TreeRowTemplate<T, TTemplateData> = {
      collapsed: false,
      disclosure,
      disclosureIcon: renderChevron(true),
      entry: null,
      item,
      label,
      renderer: null,
      templateData: null,
    };
    disclosure.addEventListener("click", (event) => {
      event.stopPropagation();
      const entry = template.entry;
      if (!entry?.expandable) return;
      this.setCollapsed(entry.key, !template.collapsed);
    });

    item.append(disclosure, label);
    container.appendChild(item);
    this.rowTemplates.set(container, template);
    this.rowTemplateSet.add(template);
    return template;
  }

  private getRendererTemplateData(
    template: TreeRowTemplate<T, TTemplateData>,
  ): TTemplateData {
    const renderer = this.options.renderer;
    if (template.templateData && template.renderer === renderer) {
      return template.templateData;
    }

    this.disposeRendererTemplate(template);
    template.renderer = renderer;
    template.templateData = renderer.renderTemplate
      ? renderer.renderTemplate(template.label)
      : template.label as TTemplateData;
    return template.templateData;
  }

  private disposeRendererTemplate(
    template: TreeRowTemplate<T, TTemplateData>,
  ): void {
    if (!template.templateData || !template.renderer) {
      return;
    }

    template.renderer.disposeTemplate?.(template.templateData);
    if (template.renderer.renderTemplate) {
      template.label.replaceChildren();
    }
    template.renderer = null;
    template.templateData = null;
  }

  private getFlattenedItems(): FlattenedObjectTreeNode<T>[] {
    const collapsedKey = this.model.getCollapsedKeys().join("\n");
    if (
      this.flattenedItemsSource !== this.options.items ||
      this.flattenedCollapsedKey !== collapsedKey ||
      this.flattenedGetChildren !== this.options.getChildren ||
      this.flattenedGetKey !== this.options.getKey
    ) {
      const previousItems = this.flattenedItems;
      const previousSignatures = this.flattenedItemSignatures;
      const canReusePreviousItems =
        this.flattenedCollapsedKey === collapsedKey &&
        this.flattenedGetChildren === this.options.getChildren &&
        this.flattenedGetKey === this.options.getKey;
      const nextItems = this.model.flatten();
      const nextSignatures = this.createFlattenedItemSignatures(nextItems);
      this.flattenedItems = canReusePreviousItems
        ? this.reuseFlattenedItems(
          previousItems,
          previousSignatures,
          nextItems,
          nextSignatures,
        )
        : nextItems;
      this.flattenedItemSignatures = nextSignatures;
      this.flattenedItemsSource = this.options.items;
      this.flattenedCollapsedKey = collapsedKey;
      this.flattenedGetChildren = this.options.getChildren;
      this.flattenedGetKey = this.options.getKey;
    }

    return this.flattenedItems;
  }

  private countVisibleDescendants(
    items: readonly FlattenedObjectTreeNode<T>[],
    index: number,
  ): number {
    const entry = items[index];
    if (!entry) {
      return 0;
    }

    let count = 0;
    for (let nextIndex = index + 1; nextIndex < items.length; nextIndex += 1) {
      const nextEntry = items[nextIndex];
      if (!nextEntry || nextEntry.depth <= entry.depth) {
        break;
      }
      count += 1;
    }

    return count;
  }

  private invalidateFlattenedItems(): void {
    this.flattenedItemsSource = null;
    this.flattenedItemSignatures.clear();
    this.flattenedCollapsedKey = "";
    this.flattenedGetChildren = null;
    this.flattenedGetKey = null;
  }

  private markFlattenedItemsFresh(): void {
    this.flattenedItemsSource = this.options.items;
    this.flattenedItemSignatures = this.createFlattenedItemSignatures(this.flattenedItems);
    this.flattenedCollapsedKey = this.model.getCollapsedKeys().join("\n");
    this.flattenedGetChildren = this.options.getChildren;
    this.flattenedGetKey = this.options.getKey;
  }

  private reuseFlattenedItems(
    previousItems: readonly FlattenedObjectTreeNode<T>[],
    previousSignatures: ReadonlyMap<string, string>,
    nextItems: readonly FlattenedObjectTreeNode<T>[],
    nextSignatures: ReadonlyMap<string, string>,
  ): FlattenedObjectTreeNode<T>[] {
    const previousItemsByKey = new Map<string, FlattenedObjectTreeNode<T>>();
    for (const entry of previousItems) {
      previousItemsByKey.set(entry.key, entry);
    }

    return nextItems.map(entry => {
      const previous = previousItemsByKey.get(entry.key);
      if (
        previous &&
        previous.item === entry.item &&
        previousSignatures.get(entry.key) === nextSignatures.get(entry.key)
      ) {
        return previous;
      }

      return entry;
    });
  }

  private createFlattenedItemSignatures(
    items: readonly FlattenedObjectTreeNode<T>[],
  ): Map<string, string> {
    const signatures = new Map<string, string>();
    for (const entry of items) {
      signatures.set(entry.key, this.createFlattenedItemSignature(entry));
    }
    return signatures;
  }

  private createFlattenedItemSignature(entry: FlattenedObjectTreeNode<T>): string {
    const collapsed = entry.expandable && this.model.isCollapsed(entry.key);
    const childKeys = this.model.getChildren(entry.item).map((child, index) =>
      this.options.getKey(child, index, entry.depth + 1),
    );
    return [
      entry.depth,
      entry.expandable ? 1 : 0,
      collapsed ? 1 : 0,
      ...childKeys,
    ].join("\u0000");
  }

  private toTreeNode(entry: FlattenedObjectTreeNode<T>): ITreeNode<T> {
    return {
      children: this.model.getChildren(entry.item),
      collapsible: entry.expandable,
      collapsed: entry.expandable && this.model.isCollapsed(entry.key),
      depth: entry.depth,
      element: entry.item,
    };
  }

  private createTreeRenderRangeEvent(
    items: readonly FlattenedObjectTreeNode<T>[],
    range: {
      readonly renderedEnd: number;
      readonly renderedStart: number;
      readonly visibleEnd: number;
      readonly visibleStart: number;
    },
  ): ITreeRenderRangeEvent<T> {
    return {
      rendered: items
        .slice(range.renderedStart, range.renderedEnd)
        .map(entry => this.toTreeNode(entry)),
      renderedEnd: range.renderedEnd,
      renderedStart: range.renderedStart,
      visible: items
        .slice(range.visibleStart, range.visibleEnd)
        .map(entry => this.toTreeNode(entry)),
      visibleEnd: range.visibleEnd,
      visibleStart: range.visibleStart,
    };
  }
}

export type {
  IObjectTreeOptions,
  IObjectTreeOptionsUpdate,
  ITreeElementRenderDetails,
  ITreeNode,
  ITreeRenderRangeEvent,
  ITreeRenderer,
  ITreeSelectionEvent,
};

export default ObjectTree;
