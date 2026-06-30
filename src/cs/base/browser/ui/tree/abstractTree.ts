/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  IListRenderer,
  IListVirtualDelegate,
} from "src/cs/base/browser/ui/list/list";
import type { ListHandle } from "src/cs/base/browser/ui/list/listWidget";
import { ListView, type IListViewOptions, type ListRenderRange } from "src/cs/base/browser/ui/list/listView";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { FlattenedTreeNode, IndexTreeModelChange } from "src/cs/base/browser/ui/tree/indexTreeModel";
import type {
  ITreeElementRenderDetails,
  ITreeNode,
  ITreeRenderRangeEvent,
  ITreeRenderer,
  ITreeSelectionEvent,
  ITreeVirtualDelegate,
} from "src/cs/base/browser/ui/tree/tree";

import "src/cs/base/browser/ui/tree/media/tree.css";

export type IAbstractTreeOptions<T, TTemplateData = HTMLElement> = {
  readonly className?: string;
  readonly delegate: ITreeVirtualDelegate<T>;
  readonly empty?: (container: HTMLElement) => void;
  readonly expandOnlyOnTwistieClick?: boolean | ((element: T) => boolean);
  readonly disposeEmpty?: (container: HTMLElement) => void;
  readonly gap?: number;
  readonly minVirtualCount?: number;
  readonly onDidChangeCollapseState?: (collapsedKeys: string[]) => void;
  readonly onDidRenderRange?: (event: ITreeRenderRangeEvent<T>) => void;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly onScroll?: (event: Event) => void;
  readonly onSelect?: (event: ITreeSelectionEvent<T>) => void;
  readonly overscanRows?: number;
  readonly renderer: ITreeRenderer<T, TTemplateData>;
  readonly selectedKey?: string | null;
  readonly viewportClassName?: string;
};

export type IAbstractTreeModel<T> = {
  flatten(): FlattenedTreeNode<T>[];
  getTreeNode(entry: FlattenedTreeNode<T>): ITreeNode<T>;
  getCollapsedKeys(): string[];
  isCollapsed(key: string): boolean;
  setCollapsed(key: string, collapsed: boolean): IndexTreeModelChange<T>;
};

type TreeRowTemplate<T, TTemplateData> = {
  collapsed: boolean;
  disclosure: HTMLButtonElement;
  disclosureIcon: HTMLSpanElement;
  entry: FlattenedTreeNode<T> | null;
  item: HTMLDivElement;
  label: HTMLDivElement;
  renderer: ITreeRenderer<T, TTemplateData> | null;
  templateData: TTemplateData | null;
};

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

const isInteractiveEventTarget = (event: MouseEvent): boolean => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest("button, input, textarea, select, a, [role='button'], [role='menuitem']"),
  );
};

export abstract class AbstractTree<
  T,
  TTemplateData = HTMLElement,
  TOptions extends IAbstractTreeOptions<T, TTemplateData> = IAbstractTreeOptions<T, TTemplateData>,
  TModel extends IAbstractTreeModel<T> = IAbstractTreeModel<T>,
> implements ListHandle {
  private readonly root: HTMLDivElement;
  private readonly listHost: HTMLDivElement;
  private readonly list: ListView<FlattenedTreeNode<T>>;
  private readonly rowTemplates = new WeakMap<HTMLElement, TreeRowTemplate<T, TTemplateData>>();
  private readonly rowTemplateSet = new Set<TreeRowTemplate<T, TTemplateData>>();
  private focusedKey: string | null = null;
  private readonly listGetKey = (entry: FlattenedTreeNode<T>) => entry.key;
  private readonly listRenderer: IListRenderer<FlattenedTreeNode<T>, HTMLElement> = {
    templateId: "tree",
    renderTemplate: container => this.renderListTemplate(container),
    renderElement: (entry, index, container) => this.renderTreeItem(entry, index, container),
    disposeElement: (entry, index, container) => this.disposeTreeItem(entry, index, container),
    disposeTemplate: container => this.disposeListTemplate(container),
  };
  private readonly listRenderers = [this.listRenderer];

  protected constructor(
    host: HTMLElement,
    protected readonly model: TModel,
    protected options: TOptions,
  ) {
    this.root = document.createElement("div");
    this.root.className = classNames("ui-tree", options.className);

    this.listHost = document.createElement("div");
    this.listHost.className = "ui-tree__list";
    this.root.appendChild(this.listHost);
    host.appendChild(this.root);

    this.list = new ListView(this.listHost, this.createListOptions());
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

  protected updateTreeOptions(options: TOptions): void {
    this.options = options;
    this.root.className = classNames("ui-tree", options.className);
    this.list.setProps(this.createListOptions());
  }

  protected applyModelChange(change: IndexTreeModelChange<T>): void {
    for (let index = change.splices.length - 1; index >= 0; index -= 1) {
      const splice = change.splices[index];
      this.list.splice(splice.start, splice.deleteCount, splice.elements);
    }

    this.rerenderByKeys(change.rerenderKeys);
  }

  protected getFlattenedItems(): FlattenedTreeNode<T>[] {
    return this.model.flatten();
  }

  private createListOptions(): IListViewOptions<FlattenedTreeNode<T>> {
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
      onDidFocus: event => {
        const entry = event.elements[0];
        this.focusedKey = entry?.key ?? null;
      },
      onDidRenderRange: (range: ListRenderRange) => options.onDidRenderRange?.(
        this.createTreeRenderRangeEvent(this.getFlattenedItems(), range),
      ),
      onKeyDown: (event: KeyboardEvent) => this.handleKeyDown(event),
      onScroll: options.onScroll,
      onSelect: (
        entry: FlattenedTreeNode<T>,
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

  private createListDelegate(): IListVirtualDelegate<FlattenedTreeNode<T>> {
    return {
      getTemplateId: () => "tree",
      getHeight: entry => {
        const resolvedHeight = Number(this.options.delegate.getHeight(entry.item));
        return Number.isFinite(resolvedHeight) && resolvedHeight > 0
          ? resolvedHeight
          : 32;
      },
    };
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const focusedEntry = this.getFlattenedItems().find(
      entry => entry.key === this.focusedKey,
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
    entry: FlattenedTreeNode<T>,
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
    entry: FlattenedTreeNode<T>,
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

    this.applyModelChange(this.model.setCollapsed(key, collapsed));
    this.options.onDidChangeCollapseState?.(this.model.getCollapsedKeys());
  }

  private toggleCollapsed(key: string): void {
    this.setCollapsed(key, !this.model.isCollapsed(key));
  }

  private renderTreeItem(
    entry: FlattenedTreeNode<T>,
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
    entry: FlattenedTreeNode<T>,
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
    disclosure.addEventListener("click", event => {
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

  private toTreeNode(entry: FlattenedTreeNode<T>): ITreeNode<T> {
    return this.model.getTreeNode(entry);
  }

  private createTreeRenderRangeEvent(
    items: readonly FlattenedTreeNode<T>[],
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
