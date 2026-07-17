import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { IContextKeyService, type IContextKeyService as IContextKeyServiceType } from "src/cs/platform/contextkey/common/contextkey";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { Registry } from "src/cs/platform/registry/common/platform";
import {
  Extensions as ViewExtensions,
  IViewDescriptorService,
  type IViewContainerModel,
  type IViewContainersRegistry,
  type IViewDescriptor,
  type IViewsRegistry,
  type ViewContainer,
  ViewContainerLocation,
  ViewVisibilityState,
} from "src/cs/workbench/common/views";
import { ViewContainerModel } from "src/cs/workbench/services/views/common/viewContainerModel";

export class ViewDescriptorService extends Disposable implements IViewDescriptorService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeViewContainersEmitter = this._register(new Emitter<{
    readonly added: readonly { readonly container: ViewContainer; readonly location: ViewContainerLocation }[];
    readonly removed: readonly { readonly container: ViewContainer; readonly location: ViewContainerLocation }[];
  }>());
  public readonly onDidChangeViewContainers = this.onDidChangeViewContainersEmitter.event;

  private readonly onDidChangeContainerEmitter = this._register(new Emitter<{
    readonly views: readonly IViewDescriptor[];
    readonly from: ViewContainer;
    readonly to: ViewContainer;
  }>());
  public readonly onDidChangeContainer = this.onDidChangeContainerEmitter.event;

  private readonly models = new Map<ViewContainer, ViewContainerModel>();
  private readonly viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
  private readonly viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);

  public get viewContainers(): readonly ViewContainer[] {
    return this.viewContainersRegistry.all;
  }

  constructor(
    @IContextKeyService private readonly contextKeyService: IContextKeyServiceType,
  ) {
    super();

    for (const viewContainer of this.viewContainersRegistry.all) {
      this.onDidRegisterViewContainer(viewContainer);
    }

    this._register(this.viewContainersRegistry.onDidRegister(({ viewContainer, viewContainerLocation }) => {
      this.onDidRegisterViewContainer(viewContainer);
      this.onDidChangeViewContainersEmitter.fire({
        added: [{ container: viewContainer, location: viewContainerLocation }],
        removed: [],
      });
    }));
    this._register(this.viewContainersRegistry.onDidDeregister(({ viewContainer, viewContainerLocation }) => {
      this.models.get(viewContainer)?.dispose();
      this.models.delete(viewContainer);
      this.onDidChangeViewContainersEmitter.fire({
        added: [],
        removed: [{ container: viewContainer, location: viewContainerLocation }],
      });
    }));
    this._register(this.viewsRegistry.onViewsRegistered(entries => {
      for (const { views, viewContainer } of entries) {
        this.getViewContainerModel(viewContainer).add(views.map(view => ({ viewDescriptor: view })));
      }
    }));
    this._register(this.viewsRegistry.onViewsDeregistered(({ views, viewContainer }) => {
      this.getViewContainerModel(viewContainer).remove(views);
    }));
    this._register(this.viewsRegistry.onDidChangeContainer(({ views, from, to }) => {
      this.getViewContainerModel(from).remove(views);
      this.getViewContainerModel(to).add(views.map(view => ({ viewDescriptor: view })));
      this.onDidChangeContainerEmitter.fire({ views, from, to });
    }));
  }

  public getViewDescriptorById(viewId: string): IViewDescriptor | null {
    return this.viewsRegistry.getView(viewId);
  }

  public getViewLocationById(viewId: string): ViewContainerLocation | null {
    const viewContainer = this.getViewContainerByViewId(viewId);
    return viewContainer ? this.getViewContainerLocation(viewContainer) : null;
  }

  public getViewContainerByViewId(viewId: string): ViewContainer | null {
    return this.viewsRegistry.getViewContainer(viewId);
  }

  public getViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation | null {
    return this.viewContainersRegistry.getViewContainerLocation(viewContainer) ?? null;
  }

  public getDefaultViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation | null {
    return this.getViewContainerLocation(viewContainer);
  }

  public getDefaultContainerById(viewId: string): ViewContainer | null {
    return this.viewsRegistry.getViewContainer(viewId);
  }

  public getViewContainerModel(container: ViewContainer): IViewContainerModel {
    let model = this.models.get(container);
    if (!model) {
      model = new ViewContainerModel(container, this.contextKeyService);
      this.models.set(container, model);
      const views = this.viewsRegistry.getViews(container);
      if (views.length) {
        model.add(views.map(view => ({ viewDescriptor: view })));
      }
    }

    return model;
  }

  public getViewContainerById(id: string): ViewContainer | null {
    return this.viewContainersRegistry.get(id) ?? null;
  }

  public getViewContainersByLocation(location: ViewContainerLocation): readonly ViewContainer[] {
    return this.viewContainersRegistry.getViewContainers(location);
  }

  public getDefaultViewContainers(location: ViewContainerLocation): readonly ViewContainer[] {
    return this.viewContainersRegistry.getDefaultViewContainers(location);
  }

  public moveViewsToContainer(
    views: readonly IViewDescriptor[],
    viewContainer: ViewContainer,
    visibilityState: ViewVisibilityState = ViewVisibilityState.Default,
  ): void {
    this.viewsRegistry.moveViews(views, viewContainer);
    if (visibilityState !== ViewVisibilityState.Default) {
      const model = this.getViewContainerModel(viewContainer);
      for (const view of views) {
        model.setVisible(view.id, true);
      }
    }
  }

  private onDidRegisterViewContainer(viewContainer: ViewContainer): void {
    this.getViewContainerModel(viewContainer);
  }
}

registerSingleton(IViewDescriptorService, ViewDescriptorService, InstantiationType.Delayed);
