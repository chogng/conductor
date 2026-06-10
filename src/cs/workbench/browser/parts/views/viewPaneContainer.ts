import { Emitter, type Event } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { DisposableResizeObserver, getClientArea, getWindow } from "src/cs/base/browser/dom";
import { ActionBar, type IActionViewItemProvider } from "src/cs/base/browser/ui/actionbar/actionbar";
import type { IAction } from "src/cs/base/common/actions";
import type { IView, IViewPaneContainer } from "src/cs/workbench/common/views";
import { localize } from "src/cs/nls";

import "src/cs/workbench/browser/parts/views/media/paneviewlet.css";

let viewPaneContainerIdPool = 0;

export type ViewPaneContainerOptions = {
  readonly actionViewItemProvider?: IActionViewItemProvider;
  readonly actions?: readonly IAction[];
  readonly className?: string;
  readonly contextActions?: readonly IAction[];
  readonly id?: string;
  readonly renderHeader?: boolean;
  readonly title?: string;
};

export class ViewPaneContainer implements IViewPaneContainer {
  public readonly element: HTMLElement;
  public readonly onDidAddViews: Event<readonly IView[]>;
  public readonly onDidRemoveViews: Event<readonly IView[]>;
  public readonly onDidChangeViewVisibility: Event<IView>;
  private readonly actionBar: ActionBar;
  private readonly body: HTMLElement;
  private readonly header: HTMLElement;
  private readonly id: string;
  private readonly renderHeader: boolean;
  private readonly titleElement: HTMLElement;
  private readonly disposables = new DisposableStore();
  private readonly onDidAddViewsEmitter = new Emitter<readonly IView[]>();
  private readonly onDidRemoveViewsEmitter = new Emitter<readonly IView[]>();
  private readonly onDidChangeViewVisibilityEmitter = new Emitter<IView>();
  private readonly panes = new Map<string, IView>();
  private readonly visiblePaneIds = new Map<string, boolean>();
  private readonly ownedPaneIds = new Set<string>();
  private activeViewId: string | undefined;
  private containerTitle: string;
  private primaryActions: readonly IAction[];
  private secondaryActions: readonly IAction[];
  private visible = true;

  constructor(options: ViewPaneContainerOptions = {}) {
    this.id = options.id ?? `workbench_view_pane_container_${viewPaneContainerIdPool++}`;
    this.containerTitle = options.title ?? "";
    this.primaryActions = options.actions ?? [];
    this.secondaryActions = options.contextActions ?? [];
    this.renderHeader = options.renderHeader === true;
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
      ariaLabel: this.containerTitle
        ? localize("viewPaneContainer.titleActionsAriaLabel", "{title} actions", { title: this.containerTitle })
        : localize("viewPaneContainer.viewActionsAriaLabel", "View actions"),
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

  public addView(view: IView, options: { readonly dispose?: boolean } = {}): IView {
    const existing = this.panes.get(view.id);
    if (existing) {
      return existing;
    }

    this.panes.set(view.id, view);
    const visible = this.visiblePaneIds.get(view.id) ?? true;
    this.visiblePaneIds.set(view.id, visible);
    if (options.dispose !== false) {
      this.ownedPaneIds.add(view.id);
    }
    if (!this.activeViewId && visible) {
      this.activeViewId = view.id;
    }
    view.setVisible(this.visible && visible && this.activeViewId === view.id);
    this.renderViews();
    if (options.dispose !== false) {
      this.disposables.add(view);
    }
    this.onDidAddViewsEmitter.fire([view]);
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
    const shouldDispose = this.ownedPaneIds.delete(id);
    if (this.activeViewId === id) {
      this.activeViewId = this.getFirstVisiblePaneId();
    }
    this.onDidRemoveViewsEmitter.fire([pane]);
    if (shouldDispose) {
      this.disposables.delete(pane);
      pane.dispose();
    }
    this.renderViews();
    this.layout();
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
    this.setActiveView(viewId);
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
      if (pane.setVisible(visible && this.isActiveVisiblePane(id))) {
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
    if (visible) {
      return this.setActiveView(viewId);
    }

    const wasActive = this.activeViewId === viewId;
    if (wasActive) {
      this.activeViewId = this.getFirstVisiblePaneId(viewId);
    }

    const changed = pane.setVisible(false);
    const nextActive = this.activeViewId ? this.panes.get(this.activeViewId) : undefined;
    const nextChanged = Boolean(nextActive?.setVisible(this.visible));
    if (!changed && !nextChanged) {
      return false;
    }

    this.renderViews();
    if (changed) {
      this.onDidChangeViewVisibilityEmitter.fire(pane);
    }
    if (nextChanged && nextActive) {
      this.onDidChangeViewVisibilityEmitter.fire(nextActive);
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

  public dispose(): void {
    this.disposables.dispose();
    this.panes.clear();
    this.ownedPaneIds.clear();
    this.activeViewId = undefined;
    this.element.replaceChildren();
    this.element.remove();
  }

  private renderTitleArea(): void {
    this.titleElement.textContent = this.containerTitle;
    this.actionBar.clear();
    this.actionBar.push([...this.primaryActions, ...this.secondaryActions]);
    this.header.hidden = !this.renderHeader || (!this.containerTitle && this.primaryActions.length === 0 && this.secondaryActions.length === 0);
  }

  private isPaneVisible(viewId: string): boolean {
    return this.visiblePaneIds.get(viewId) !== false;
  }

  private isActiveVisiblePane(viewId: string): boolean {
    return this.activeViewId === viewId && this.isPaneVisible(viewId);
  }

  private setActiveView(viewId: string): boolean {
    const nextActiveView = this.panes.get(viewId);
    if (!nextActiveView) {
      return false;
    }

    const previousActiveView = this.activeViewId ? this.panes.get(this.activeViewId) : undefined;
    if (this.activeViewId === viewId && nextActiveView.isVisible() === this.visible) {
      return false;
    }

    this.activeViewId = viewId;
    let changed = false;
    if (previousActiveView && previousActiveView !== nextActiveView) {
      changed = previousActiveView.setVisible(false) || changed;
      this.onDidChangeViewVisibilityEmitter.fire(previousActiveView);
    }
    changed = nextActiveView.setVisible(this.visible && this.isPaneVisible(viewId)) || changed;
    this.renderViews();
    this.onDidChangeViewVisibilityEmitter.fire(nextActiveView);
    this.layout();
    return changed;
  }

  private getFirstVisiblePaneId(excludeViewId?: string): string | undefined {
    for (const id of this.panes.keys()) {
      if (id !== excludeViewId && this.isPaneVisible(id)) {
        return id;
      }
    }

    return undefined;
  }

  private renderViews(): void {
    const visibleViews: HTMLElement[] = [];
    for (const [id, pane] of this.panes) {
      if (this.visible && this.isActiveVisiblePane(id)) {
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
