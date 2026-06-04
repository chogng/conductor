import { Emitter, type Event } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { DisposableResizeObserver, getClientArea, getWindow } from "src/cs/base/browser/dom";
import { ActionBar, type IActionViewItemProvider } from "src/cs/base/browser/ui/actionbar/actionbar";
import type { IAction } from "src/cs/base/common/actions";
import { ViewPane, type ViewPaneOptions } from "src/cs/workbench/browser/parts/views/viewPane";
import type { IView, IViewPaneContainer } from "src/cs/workbench/common/views";

import "src/cs/workbench/browser/parts/views/media/paneviewlet.css";

let viewPaneContainerIdPool = 0;

export type ViewPaneContainerOptions = {
  readonly actionViewItemProvider?: IActionViewItemProvider;
  readonly actions?: readonly IAction[];
  readonly className?: string;
  readonly collapsedPaneIds?: readonly string[];
  readonly contextActions?: readonly IAction[];
  readonly id?: string;
  readonly renderHeader?: boolean;
  readonly title?: string;
};

export type ViewPaneContainerAddOptions = Omit<ViewPaneOptions, "collapsed"> & {
  readonly collapsed?: boolean;
  readonly id: string;
};

export class ViewPaneContainer implements IViewPaneContainer {
  public readonly element: HTMLElement;
  public readonly onDidChangeCollapsedPaneIds: Event<readonly string[]>;
  public readonly onDidAddViews: Event<readonly IView[]>;
  public readonly onDidRemoveViews: Event<readonly IView[]>;
  public readonly onDidChangeViewVisibility: Event<IView>;
  private readonly actionBar: ActionBar;
  private readonly body: HTMLElement;
  private readonly collapsedPaneIds: Set<string>;
  private readonly header: HTMLElement;
  private readonly id: string;
  private readonly renderHeader: boolean;
  private readonly titleElement: HTMLElement;
  private readonly disposables = new DisposableStore();
  private readonly onDidChangeCollapsedPaneIdsEmitter = new Emitter<readonly string[]>();
  private readonly onDidAddViewsEmitter = new Emitter<readonly IView[]>();
  private readonly onDidRemoveViewsEmitter = new Emitter<readonly IView[]>();
  private readonly onDidChangeViewVisibilityEmitter = new Emitter<IView>();
  private readonly panes = new Map<string, IView>();
  private readonly visiblePaneIds = new Map<string, boolean>();
  private containerTitle: string;
  private primaryActions: readonly IAction[];
  private secondaryActions: readonly IAction[];
  private visible = true;
  private updatingCollapsedPaneIds = false;

  constructor(options: ViewPaneContainerOptions = {}) {
    this.id = options.id ?? `workbench_view_pane_container_${viewPaneContainerIdPool++}`;
    this.containerTitle = options.title ?? "";
    this.primaryActions = options.actions ?? [];
    this.secondaryActions = options.contextActions ?? [];
    this.renderHeader = options.renderHeader === true;
    this.collapsedPaneIds = new Set(options.collapsedPaneIds ?? []);
    this.onDidChangeCollapsedPaneIds = this.onDidChangeCollapsedPaneIdsEmitter.event;
    this.onDidAddViews = this.onDidAddViewsEmitter.event;
    this.onDidRemoveViews = this.onDidRemoveViewsEmitter.event;
    this.onDidChangeViewVisibility = this.onDidChangeViewVisibilityEmitter.event;

    this.element = document.createElement("div");
    this.element.className = this.getElementClassName(options.className);
    this.element.setAttribute("aria-label", this.containerTitle || this.id);
    this.header = document.createElement("div");
    this.header.className = "workbench-view-pane-container__header";
    this.titleElement = document.createElement("div");
    this.titleElement.className = "workbench-view-pane-container__title";
    this.actionBar = this.disposables.add(new ActionBar({
      actionViewItemProvider: options.actionViewItemProvider,
      ariaLabel: this.containerTitle ? `${this.containerTitle} actions` : "View actions",
      className: "workbench-view-pane-container__actions",
    }));
    this.body = document.createElement("div");
    this.body.className = "workbench-view-pane-container__body";
    this.header.append(this.titleElement, this.actionBar.domNode);
    if (this.renderHeader) {
      this.element.append(this.header);
    }
    this.element.append(this.body);
    this.renderTitleArea();
    const resizeObserver = this.disposables.add(
      new DisposableResizeObserver(getWindow(this.element), () => {
        this.layout();
      }),
    );
    this.disposables.add(resizeObserver.observe(this.element));
    this.disposables.add(this.onDidChangeCollapsedPaneIdsEmitter);
    this.disposables.add(this.onDidAddViewsEmitter);
    this.disposables.add(this.onDidRemoveViewsEmitter);
    this.disposables.add(this.onDidChangeViewVisibilityEmitter);
  }

  public get views(): readonly IView[] {
    return Array.from(this.panes.values());
  }

  public get title(): string {
    return this.containerTitle;
  }

  public get actions(): readonly IAction[] {
    return this.primaryActions;
  }

  public get contextActions(): readonly IAction[] {
    return this.secondaryActions;
  }

  public getId(): string {
    return this.id;
  }

  public addPane(options: ViewPaneContainerAddOptions): ViewPane {
    const existing = this.panes.get(options.id);
    if (existing instanceof ViewPane) {
      return existing;
    }
    if (existing) {
      throw new Error(`View '${options.id}' is not a collapsible view pane.`);
    }

    const collapsed = options.collapsed ?? this.collapsedPaneIds.has(options.id);
    const pane = new ViewPane({
      ...options,
      collapsed,
      id: `${this.id}_${options.id}`,
    });

    if (collapsed) {
      this.collapsedPaneIds.add(options.id);
    } else {
      this.collapsedPaneIds.delete(options.id);
    }

    this.disposables.add(pane.onDidChangeCollapsed((nextCollapsed) => {
      this.setPaneCollapsed(options.id, nextCollapsed);
    }));
    this.disposables.add(pane);
    this.panes.set(options.id, pane);
    this.visiblePaneIds.set(options.id, true);
    pane.setVisible(this.visible);
    this.renderViews();
    this.fireCollapsedPaneIds();
    this.onDidAddViewsEmitter.fire([pane]);
    this.layout();
    return pane;
  }

  public addView(view: IView, options: { readonly dispose?: boolean } = {}): IView {
    const existing = this.panes.get(view.id);
    if (existing) {
      return existing;
    }

    this.panes.set(view.id, view);
    const visible = this.visiblePaneIds.get(view.id) ?? true;
    this.visiblePaneIds.set(view.id, visible);
    view.setVisible(this.visible && visible);
    this.renderViews();
    if (view instanceof ViewPane) {
      this.disposables.add(view.onDidChangeCollapsed(() => {
        this.onDidChangeViewVisibilityEmitter.fire(view);
      }));
    }
    if (options.dispose !== false) {
      this.disposables.add(view);
    }
    this.onDidAddViewsEmitter.fire([view]);
    this.fireCollapsedPaneIds();
    this.layout();
    return view;
  }

  public removeView(id: string): void {
    const pane = this.panes.get(id);
    if (!pane) {
      return;
    }

    this.panes.delete(id);
    this.visiblePaneIds.delete(id);
    this.collapsedPaneIds.delete(id);
    this.onDidRemoveViewsEmitter.fire([pane]);
    pane.dispose();
    this.renderViews();
    this.fireCollapsedPaneIds();
    this.layout();
  }

  public removePane(id: string): void {
    this.removeView(id);
  }

  public getPane(id: string): ViewPane | undefined {
    const pane = this.panes.get(id);
    return pane instanceof ViewPane ? pane : undefined;
  }

  public getView(viewId: string): IView | undefined {
    return this.panes.get(viewId);
  }

  public openView(viewId: string, focus?: boolean): IView | undefined {
    const view = this.getView(viewId);
    if (!view) {
      return undefined;
    }

    this.setViewVisible(viewId, true);
    view.setExpanded(true);
    if (focus) {
      view.focus();
    }
    this.layout();
    return view;
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return;
    }

    this.visible = visible;
    this.element.hidden = !visible;
    for (const [id, pane] of this.panes) {
      if (pane.setVisible(visible && this.isPaneVisible(id))) {
        this.onDidChangeViewVisibilityEmitter.fire(pane);
      }
    }
    this.renderViews();
    this.layout();
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public focus(): void {
    this.panes.values().next().value?.focus();
  }

  public getActionsContext(): unknown {
    return undefined;
  }

  public setViewVisible(viewId: string, visible: boolean): boolean {
    const pane = this.panes.get(viewId);
    if (!pane) {
      return false;
    }

    this.visiblePaneIds.set(viewId, visible);
    const changed = pane.setVisible(this.visible && visible);
    this.renderViews();
    if (changed) {
      this.onDidChangeViewVisibilityEmitter.fire(pane);
    }
    this.layout();
    return changed;
  }

  public layout(height?: number, width?: number): void {
    const measured = getClientArea(this.element);
    const nextHeight = typeof height === "number" && Number.isFinite(height)
      ? Math.max(0, height)
      : measured.height;
    const nextWidth = typeof width === "number" && Number.isFinite(width)
      ? Math.max(0, width)
      : measured.width;

    if (typeof height === "number" && Number.isFinite(height)) {
      this.element.style.height = `${nextHeight}px`;
    }
    if (typeof width === "number" && Number.isFinite(width)) {
      this.element.style.width = `${nextWidth}px`;
    }

    const headerHeight = this.header.hidden
      ? 0
      : this.header.getBoundingClientRect().height;
    const bodyHeight = Math.max(0, nextHeight - headerHeight);
    this.body.style.height = `${bodyHeight}px`;
    this.body.style.width = `${nextWidth}px`;

    for (const view of this.panes.values()) {
      if (view.isVisible()) {
        view.layout?.(bodyHeight, nextWidth);
      }
    }
  }

  public setTitle(title: string): void {
    if (this.containerTitle === title) {
      return;
    }

    this.containerTitle = title;
    this.element.setAttribute("aria-label", title || this.id);
    this.renderTitleArea();
    this.layout();
  }

  public setActions(actions: readonly IAction[], contextActions: readonly IAction[] = []): void {
    this.primaryActions = actions;
    this.secondaryActions = contextActions;
    this.renderTitleArea();
    this.layout();
  }

  public toggleViewVisibility(viewId: string): void {
    const pane = this.panes.get(viewId);
    if (!pane) {
      return;
    }

    this.setViewVisible(viewId, !this.isPaneVisible(viewId));
  }

  public getCollapsedPaneIds(): readonly string[] {
    return Array.from(this.collapsedPaneIds);
  }

  public setCollapsedPaneIds(collapsedPaneIds: readonly string[]): void {
    const nextCollapsedPaneIds = new Set(collapsedPaneIds);
    let changed = false;

    this.updatingCollapsedPaneIds = true;
    for (const [id, pane] of this.panes) {
      const collapsed = nextCollapsedPaneIds.has(id);
      if (pane instanceof ViewPane) {
        changed = pane.setCollapsed(collapsed) || changed;
      }
    }
    this.updatingCollapsedPaneIds = false;

    for (const id of Array.from(this.collapsedPaneIds)) {
      if (!nextCollapsedPaneIds.has(id)) {
        this.collapsedPaneIds.delete(id);
        changed = true;
      }
    }

    for (const id of nextCollapsedPaneIds) {
      if (!this.collapsedPaneIds.has(id)) {
        this.collapsedPaneIds.add(id);
        changed = true;
      }
    }

    if (changed) {
      this.fireCollapsedPaneIds();
    }
  }

  public dispose(): void {
    this.disposables.dispose();
    this.panes.clear();
    this.collapsedPaneIds.clear();
    this.element.replaceChildren();
    this.element.remove();
  }

  private renderTitleArea(): void {
    this.titleElement.textContent = this.containerTitle;
    this.actionBar.clear();
    this.actionBar.push([...this.primaryActions, ...this.secondaryActions]);
    this.header.hidden = !this.renderHeader || (!this.containerTitle && this.primaryActions.length === 0 && this.secondaryActions.length === 0);
  }

  private setPaneCollapsed(id: string, collapsed: boolean): void {
    const hadId = this.collapsedPaneIds.has(id);
    if (collapsed) {
      this.collapsedPaneIds.add(id);
    } else {
      this.collapsedPaneIds.delete(id);
    }

    if (hadId !== collapsed && !this.updatingCollapsedPaneIds) {
      this.fireCollapsedPaneIds();
    }
    this.layout();
  }

  private fireCollapsedPaneIds(): void {
    this.onDidChangeCollapsedPaneIdsEmitter.fire(this.getCollapsedPaneIds());
  }

  private isPaneVisible(viewId: string): boolean {
    return this.visiblePaneIds.get(viewId) !== false;
  }

  private renderViews(): void {
    const visibleViews: HTMLElement[] = [];
    for (const [id, pane] of this.panes) {
      if (this.visible && this.isPaneVisible(id)) {
        visibleViews.push(pane.element);
      }
    }
    this.body.replaceChildren(...visibleViews);
  }

  private getElementClassName(className = ""): string {
    const classNames = ["workbench-view-pane-container"];
    if (className) {
      classNames.push(className);
    }
    return classNames.join(" ");
  }
}
