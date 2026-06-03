import { addDisposableListener } from "src/cs/base/browser/dom";
import { Emitter } from "src/cs/base/common/event";
import { Disposable, DisposableStore, toDisposable } from "src/cs/base/common/lifecycle";
import {
  IContextKeyService,
  type IContextKey,
  type IContextKeyService as IContextKeyServiceType,
} from "src/cs/platform/contextkey/common/contextkey";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IInstantiationService, type IInstantiationService as IInstantiationServiceType } from "src/cs/platform/instantiation/common/instantiation";
import { FocusedViewContext, getVisibleViewContextKey } from "src/cs/workbench/common/contextkeys";
import {
  IViewDescriptorService,
  type IView,
  type IViewDescriptor,
  type IViewPaneContainer,
  type ViewContainer,
  ViewContainerLocation,
} from "src/cs/workbench/common/views";
import {
  IWorkbenchLayoutService,
  Parts,
  type IWorkbenchLayoutService as IWorkbenchLayoutServiceType,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { IViewsService, type IViewsService as IViewsServiceType } from "src/cs/workbench/services/views/common/viewsService";

export class ViewsService extends Disposable implements IViewsServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeViewContainerVisibilityEmitter = this._register(new Emitter<{
    readonly id: string;
    readonly visible: boolean;
    readonly location: ViewContainerLocation;
  }>());
  public readonly onDidChangeViewContainerVisibility = this.onDidChangeViewContainerVisibilityEmitter.event;

  private readonly onDidChangeViewVisibilityEmitter = this._register(new Emitter<{
    readonly id: string;
    readonly visible: boolean;
  }>());
  public readonly onDidChangeViewVisibility = this.onDidChangeViewVisibilityEmitter.event;

  private readonly onDidChangeFocusedViewEmitter = this._register(new Emitter<void>());
  public readonly onDidChangeFocusedView = this.onDidChangeFocusedViewEmitter.event;

  private readonly containerDisposables = new Map<string, DisposableStore>();
  private readonly viewContainerIdsByViewId = new Map<string, string>();
  private readonly visibleViewContextKeys = new Map<string, IContextKey<boolean>>();
  private readonly focusedViewContextKey: IContextKey<string>;
  private readonly visibleViewContainers = new Map<ViewContainerLocation, string>();
  private readonly visibleAddedViews = new Map<string, boolean>();
  private readonly viewsById = new Map<string, IView>();
  private readonly viewPaneContainers = new Map<string, IViewPaneContainer>();

  constructor(
    @IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
    @IContextKeyService private readonly contextKeyService: IContextKeyServiceType,
    @IInstantiationService private readonly instantiationService: IInstantiationServiceType,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutServiceType,
  ) {
    super();
    this.focusedViewContextKey = FocusedViewContext.bindTo(this.contextKeyService);

    for (const viewContainer of this.viewDescriptorService.viewContainers) {
      this.registerViewContainerModel(viewContainer);
    }
    this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => {
      for (const { container } of removed) {
        this.deregisterViewContainer(container.id);
      }
      for (const { container } of added) {
        this.registerViewContainerModel(container);
      }
    }));
    this._register(toDisposable(() => {
      for (const disposables of this.containerDisposables.values()) {
        disposables.dispose();
      }
      this.containerDisposables.clear();
      this.viewContainerIdsByViewId.clear();
      this.visibleViewContextKeys.clear();
      this.visibleAddedViews.clear();
      this.viewsById.clear();
      this.viewPaneContainers.clear();
    }));
  }

  public isViewContainerVisible(id: string): boolean {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    const location = viewContainer ? this.viewDescriptorService.getViewContainerLocation(viewContainer) : null;
    return location !== null && this.visibleViewContainers.get(location) === id;
  }

  public isViewContainerActive(id: string): boolean {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (!viewContainer) {
      return false;
    }

    if (!viewContainer.hideIfEmpty) {
      return true;
    }

    return this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length > 0;
  }

  public async openViewContainer(id: string, _focus?: boolean): Promise<ViewContainer | null> {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    const location = viewContainer ? this.viewDescriptorService.getViewContainerLocation(viewContainer) : null;
    if (!viewContainer || location === null) {
      return null;
    }

    const previousId = this.visibleViewContainers.get(location);
    if (previousId && previousId !== id) {
      this.viewPaneContainers.get(previousId)?.setVisible(false);
      this.onDidChangeViewContainerVisibilityEmitter.fire({ id: previousId, visible: false, location });
    }

    this.visibleViewContainers.set(location, id);
    this.viewPaneContainers.get(id)?.setVisible(true);
    this.applyAddedViewVisibility(id);
    if (previousId !== id) {
      this.onDidChangeViewContainerVisibilityEmitter.fire({ id, visible: true, location });
    }
    this.updatePartVisibility(location);
    return viewContainer;
  }

  public closeViewContainer(id: string): void {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    const location = viewContainer ? this.viewDescriptorService.getViewContainerLocation(viewContainer) : null;
    if (location === null) {
      return;
    }

    if (this.visibleViewContainers.get(location) === id) {
      this.visibleViewContainers.delete(location);
      this.onDidChangeViewContainerVisibilityEmitter.fire({ id, visible: false, location });
    }
    this.viewPaneContainers.get(id)?.setVisible(false);
    this.updatePartVisibility(location);
  }

  public getVisibleViewContainer(location: ViewContainerLocation): ViewContainer | null {
    const id = this.visibleViewContainers.get(location);
    return id ? this.viewDescriptorService.getViewContainerById(id) : null;
  }

  public getViewContainerElement(id: string): HTMLElement | null {
    return this.viewPaneContainers.get(id)?.element ?? null;
  }

  public getActiveViewPaneContainerWithId(viewContainerId: string): IViewPaneContainer | null {
    if (!this.isViewContainerVisible(viewContainerId)) {
      return null;
    }

    return this.viewPaneContainers.get(viewContainerId) ?? null;
  }

  public getFocusedView(): IViewDescriptor | null {
    const id = this.contextKeyService.getValue<string>(FocusedViewContext.key);
    return id ? this.viewDescriptorService.getViewDescriptorById(id) : null;
  }

  public getFocusedViewName(): string {
    const focusedViewId = this.focusedViewContextKey.get();
    return this.getFocusedView()?.name ?? focusedViewId ?? "";
  }

  public addViewToContainer(containerId: string, view: IView): IView | null {
    const viewPaneContainer = this.viewPaneContainers.get(containerId);
    if (!viewPaneContainer) {
      return null;
    }
    const currentContainerId = this.viewContainerIdsByViewId.get(view.id);
    if (currentContainerId && currentContainerId !== containerId) {
      return null;
    }

    const addedView = viewPaneContainer.addView(view, { dispose: false });
    this.viewsById.set(addedView.id, addedView);
    this.viewContainerIdsByViewId.set(addedView.id, containerId);
    this.applyAddedViewVisibility(containerId);
    return addedView;
  }

  public setViewVisible(id: string, visible: boolean): boolean {
    const view = this.viewsById.get(id);
    if (!view) {
      return false;
    }

    this.visibleAddedViews.set(id, visible);
    const changed = view.setVisible(visible);
    if (changed) {
      this.onViewVisibilityChanged(view, view.isBodyVisible());
    }
    return changed;
  }

  public isViewVisible(id: string): boolean {
    const view = this.viewsById.get(id);
    if (view) {
      return view.isBodyVisible();
    }

    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    return viewContainer ? this.viewDescriptorService.getViewContainerModel(viewContainer).isVisible(id) : false;
  }

  public async openView<T extends IView>(id: string, focus?: boolean): Promise<T | null> {
    const addedViewContainerId = this.viewContainerIdsByViewId.get(id);
    if (addedViewContainerId) {
      await this.openViewContainer(addedViewContainerId, focus);
      const viewPaneContainer = this.viewPaneContainers.get(addedViewContainerId);
      this.visibleAddedViews.set(id, true);
      const view = viewPaneContainer?.openView(id, focus) as T | undefined ?? this.getViewWithId<T>(id);
      if (view) {
        this.onViewVisibilityChanged(view, view.isBodyVisible());
      }
      return view ?? null;
    }

    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (!viewContainer) {
      return null;
    }

    const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
    if (!model.activeViewDescriptors.some(viewDescriptor => viewDescriptor.id === id)) {
      return null;
    }

    model.setVisible(id, true);
    await this.openViewContainer(viewContainer.id, focus);
    const view = this.viewPaneContainers.get(viewContainer.id)?.openView(id, focus) as T | undefined ?? this.getViewWithId<T>(id);
    return view ?? null;
  }

  public closeView(id: string): void {
    const addedView = this.viewsById.get(id);
    if (addedView) {
      this.setViewVisible(id, false);
      return;
    }

    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (!viewContainer) {
      return;
    }

    this.viewDescriptorService.getViewContainerModel(viewContainer).setVisible(id, false);
  }

  private applyAddedViewVisibility(containerId: string): void {
    for (const [viewId, addedContainerId] of this.viewContainerIdsByViewId) {
      if (addedContainerId !== containerId) {
        continue;
      }

      const visible = this.visibleAddedViews.get(viewId);
      if (visible === undefined) {
        continue;
      }

      const view = this.viewsById.get(viewId);
      if (!view) {
        continue;
      }

      const changed = view.setVisible(visible);
      if (changed) {
        this.onViewVisibilityChanged(view, view.isBodyVisible());
      }
    }
  }

  public getActiveViewWithId<T extends IView>(id: string): T | null {
    const addedViewContainerId = this.viewContainerIdsByViewId.get(id);
    if (addedViewContainerId) {
      return this.isViewContainerVisible(addedViewContainerId)
        ? this.viewsById.get(id) as T | undefined ?? null
        : null;
    }

    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (!viewContainer || !this.isViewContainerVisible(viewContainer.id)) {
      return null;
    }

    return this.viewsById.get(id) as T | undefined ?? null;
  }

  public getViewWithId<T extends IView>(id: string): T | null {
    return this.viewsById.get(id) as T | undefined ?? null;
  }

  public getViewProgressIndicator(_id: string): unknown | undefined {
    return undefined;
  }

  private registerViewContainerModel(viewContainer: ViewContainer): void {
    if (this.containerDisposables.has(viewContainer.id)) {
      return;
    }

    const disposables = this._register(new DisposableStore());
    this.containerDisposables.set(viewContainer.id, disposables);
    const viewPaneContainer = disposables.add(
      this.instantiationService.createInstance(viewContainer.ctorDescriptor),
    );
    this.viewPaneContainers.set(viewContainer.id, viewPaneContainer);
    disposables.add(toDisposable(() => {
      this.viewPaneContainers.delete(viewContainer.id);
      this.containerDisposables.delete(viewContainer.id);
    }));
    disposables.add(viewPaneContainer.onDidAddViews(views => this.onViewsAdded(views)));
    disposables.add(viewPaneContainer.onDidRemoveViews(views => this.onViewsRemoved(views)));
    disposables.add(viewPaneContainer.onDidChangeViewVisibility(view => this.onViewVisibilityChanged(view, view.isBodyVisible())));
    disposables.add(addDisposableListener(viewPaneContainer.element, "focusin", event => {
      this.setFocusedView(this.findViewFromEventTarget(viewPaneContainer, event.target));
    }));
    disposables.add(addDisposableListener(viewPaneContainer.element, "focusout", event => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !viewPaneContainer.element.contains(nextTarget)) {
        this.setFocusedView(null);
      }
    }));

    const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
    for (const viewDescriptor of model.visibleViewDescriptors) {
      this.addView(viewPaneContainer, viewDescriptor);
    }
    disposables.add(model.onDidAddVisibleViewDescriptors(views => {
      for (const { viewDescriptor } of views) {
        this.addView(viewPaneContainer, viewDescriptor);
      }
    }));
    disposables.add(model.onDidRemoveVisibleViewDescriptors(views => {
      for (const { viewDescriptor } of views) {
        this.removeView(viewPaneContainer, viewDescriptor.id);
      }
    }));
  }

  private deregisterViewContainer(viewContainerId: string): void {
    this.containerDisposables.get(viewContainerId)?.dispose();
    this.containerDisposables.delete(viewContainerId);
    this.viewPaneContainers.delete(viewContainerId);
    for (const [viewId, id] of this.viewContainerIdsByViewId) {
      if (id === viewContainerId) {
        this.viewContainerIdsByViewId.delete(viewId);
        this.viewsById.delete(viewId);
        this.visibleViewContextKeys.get(viewId)?.reset();
        this.visibleViewContextKeys.delete(viewId);
      }
    }
    for (const [location, id] of this.visibleViewContainers) {
      if (id === viewContainerId) {
        this.visibleViewContainers.delete(location);
        this.updatePartVisibility(location);
      }
    }
  }

  private addView(viewPaneContainer: IViewPaneContainer, viewDescriptor: IViewDescriptor): void {
    if (viewPaneContainer.getView(viewDescriptor.id)) {
      return;
    }

    const view = this.instantiationService.createInstance(viewDescriptor.ctorDescriptor);
    viewPaneContainer.addView(view);
    this.viewsById.set(view.id, view);
    this.viewContainerIdsByViewId.set(view.id, this.getViewContainerId(viewPaneContainer));
  }

  private removeView(viewPaneContainer: IViewPaneContainer, viewId: string): void {
    viewPaneContainer.removeView(viewId);
    this.viewsById.delete(viewId);
    this.viewContainerIdsByViewId.delete(viewId);
  }

  private onViewsAdded(views: readonly IView[]): void {
    for (const view of views) {
      this.onViewVisibilityChanged(view, view.isBodyVisible());
    }
  }

  private onViewsRemoved(views: readonly IView[]): void {
    for (const view of views) {
      this.onViewVisibilityChanged(view, false);
      this.visibleViewContextKeys.get(view.id)?.reset();
    }
  }

  private onViewVisibilityChanged(view: IView, visible: boolean): void {
    this.getOrCreateVisibleViewContextKey(view.id).set(visible);
    this.onDidChangeViewVisibilityEmitter.fire({ id: view.id, visible });
  }

  private getOrCreateVisibleViewContextKey(viewId: string): IContextKey<boolean> {
    let contextKey = this.visibleViewContextKeys.get(viewId);
    if (!contextKey) {
      contextKey = this.contextKeyService.createKey(getVisibleViewContextKey(viewId), false);
      this.visibleViewContextKeys.set(viewId, contextKey);
    }
    return contextKey;
  }

  private findViewFromEventTarget(viewPaneContainer: IViewPaneContainer, target: EventTarget | null): IView | null {
    if (!(target instanceof Node)) {
      return null;
    }

    return viewPaneContainer.views.find(view => view.element.contains(target)) ?? null;
  }

  private setFocusedView(view: IView | null): void {
    const id = view?.id ?? "";
    if (this.focusedViewContextKey.get() === id) {
      return;
    }

    this.focusedViewContextKey.set(id);
    this.onDidChangeFocusedViewEmitter.fire();
  }

  private getViewContainerId(viewPaneContainer: IViewPaneContainer): string {
    for (const [id, container] of this.viewPaneContainers) {
      if (container === viewPaneContainer) {
        return id;
      }
    }

    throw new Error("Unknown view pane container.");
  }

  private updatePartVisibility(location: ViewContainerLocation): void {
    const part = viewContainerLocationToPart(location);
    if (part) {
      this.layoutService.setPartHidden(!this.visibleViewContainers.has(location), part);
    }
  }
}

function viewContainerLocationToPart(location: ViewContainerLocation): Parts | null {
  switch (location) {
    case ViewContainerLocation.Sidebar:
      return Parts.SIDEBAR_PART;
    case ViewContainerLocation.Panel:
      return Parts.PANEL_PART;
    case ViewContainerLocation.AuxiliaryBar:
      return Parts.AUXILIARYBAR_PART;
  }
}

registerSingleton(IViewsService, ViewsService, InstantiationType.Delayed);
