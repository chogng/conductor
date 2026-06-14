import * as assert from "assert";

import { Emitter, Event, type Event as EventType } from "src/cs/base/common/event";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { AbstractStorageService, StorageScope } from "src/cs/platform/storage/common/storage";
import { IStorageService } from "src/cs/platform/storage/common/storage";
import {
  IViewDescriptorService,
  type IAddedViewDescriptorRef,
  type IView,
  type IViewContainerModel,
  type IViewDescriptor,
  type IViewDescriptorRef,
  type IViewPaneContainer,
  type ViewContainer,
  ViewContainerLocation,
  type ViewVisibilityState,
} from "src/cs/workbench/common/views";
import { IContextKeyService } from "src/cs/platform/contextkey/common/contextkey";
import { IInstantiationService } from "src/cs/platform/instantiation/common/instantiation";
import {
  BrowserWorkbenchLayoutService,
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { ViewsService } from "src/cs/workbench/services/views/browser/viewsService";

class TestStorageService extends AbstractStorageService {
  private readonly values = new Map<string, string>();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    return this.values.get(`${scope}:${key}`);
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    this.values.set(`${scope}:${key}`, value);
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    this.values.delete(`${scope}:${key}`);
  }

  protected readKeys(scope: StorageScope): string[] {
    const prefix = `${scope}:`;
    return Array.from(this.values.keys())
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
  }
}

class TestView implements IView {
  public readonly id = "test.view";
  public readonly element = fakeElement();
  private visible = false;

  public focus(): void {}

  public isVisible(): boolean {
    return this.visible;
  }

  public isBodyVisible(): boolean {
    return this.visible;
  }

  public setVisible(visible: boolean): boolean {
    if (this.visible === visible) {
      return false;
    }

    this.visible = visible;
    return true;
  }

  public getProgressIndicator(): unknown | undefined {
    return undefined;
  }

  public dispose(): void {}
}

class TestViewPaneContainer implements IViewPaneContainer {
  public readonly element = fakeElement();
  public readonly title = "Test";
  public readonly actions = [];
  public readonly contextActions = [];
  private readonly onDidAddViewsEmitter = new Emitter<readonly IView[]>();
  public readonly onDidAddViews = this.onDidAddViewsEmitter.event;
  private readonly onDidRemoveViewsEmitter = new Emitter<readonly IView[]>();
  public readonly onDidRemoveViews = this.onDidRemoveViewsEmitter.event;
  private readonly onDidChangeViewVisibilityEmitter = new Emitter<IView>();
  public readonly onDidChangeViewVisibility = this.onDidChangeViewVisibilityEmitter.event;
  private readonly panes = new Map<string, IView>();
  private visible = true;

  public get views(): readonly IView[] {
    return Array.from(this.panes.values());
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
  }

  public isVisible(): boolean { return this.visible; }
  public focus(): void {}
  public getActionsContext(): unknown { return undefined; }
  public getView(viewId: string): IView | undefined { return this.panes.get(viewId); }

  public addView(view: IView): IView {
    this.panes.set(view.id, view);
    view.setVisible(this.visible);
    this.onDidAddViewsEmitter.fire([view]);
    this.onDidChangeViewVisibilityEmitter.fire(view);
    return view;
  }

  public setViewVisible(viewId: string, visible: boolean): boolean {
    const view = this.panes.get(viewId);
    const changed = view?.setVisible(visible) ?? false;
    if (view) {
      this.onDidChangeViewVisibilityEmitter.fire(view);
    }
    return changed;
  }

  public setTitle(): void {}
  public setActions(): void {}
  public openView(viewId: string): IView | undefined { return this.panes.get(viewId); }
  public removeView(): void {}
  public toggleViewVisibility(): void {}

  public dispose(): void {
    this.onDidAddViewsEmitter.dispose();
    this.onDidRemoveViewsEmitter.dispose();
    this.onDidChangeViewVisibilityEmitter.dispose();
    this.panes.clear();
  }
}

const noneEvent = <T>(): EventType<T> => Event.None as EventType<T>;

function fakeElement(): HTMLElement {
  return {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    contains: () => false,
  } as unknown as HTMLElement;
}

class TestViewContainerModel implements IViewContainerModel {
  public readonly title = "Test";
  public readonly icon = undefined;
  public readonly keybindingId = undefined;
  public readonly onDidChangeContainerInfo: IViewContainerModel["onDidChangeContainerInfo"] = noneEvent();
  public readonly allViewDescriptors: readonly IViewDescriptor[];
  public readonly onDidChangeAllViewDescriptors: IViewContainerModel["onDidChangeAllViewDescriptors"] = noneEvent();
  public readonly activeViewDescriptors: readonly IViewDescriptor[];
  public readonly onDidChangeActiveViewDescriptors: IViewContainerModel["onDidChangeActiveViewDescriptors"] = noneEvent();
  private readonly visibleDescriptors: IViewDescriptor[] = [];
  private readonly onDidAddVisibleViewDescriptorsEmitter = new Emitter<readonly IAddedViewDescriptorRef[]>();
  public readonly onDidAddVisibleViewDescriptors = this.onDidAddVisibleViewDescriptorsEmitter.event;
  private readonly onDidRemoveVisibleViewDescriptorsEmitter = new Emitter<readonly IViewDescriptorRef[]>();
  public readonly onDidRemoveVisibleViewDescriptors = this.onDidRemoveVisibleViewDescriptorsEmitter.event;
  public readonly onDidMoveVisibleViewDescriptors: IViewContainerModel["onDidMoveVisibleViewDescriptors"] = noneEvent();

  public constructor(
    public readonly viewContainer: ViewContainer,
    private readonly viewDescriptor: IViewDescriptor,
  ) {
    this.allViewDescriptors = [viewDescriptor];
    this.activeViewDescriptors = [viewDescriptor];
  }

  public get visibleViewDescriptors(): readonly IViewDescriptor[] {
    return this.visibleDescriptors;
  }

  public addVisibleViewDescriptor(viewDescriptor: IViewDescriptor): void {
    this.visibleDescriptors.push(viewDescriptor);
    this.onDidAddVisibleViewDescriptorsEmitter.fire([{
      collapsed: false,
      index: this.visibleDescriptors.length - 1,
      viewDescriptor,
    }]);
  }

  public isVisible(viewId: string): boolean {
    return this.visibleDescriptors.some(viewDescriptor => viewDescriptor.id === viewId);
  }

  public setVisible(viewId: string, visible: boolean): void {
    const index = this.visibleDescriptors.findIndex(viewDescriptor => viewDescriptor.id === viewId);
    if (visible) {
      if (index === -1 && viewId === this.viewDescriptor.id) {
        this.addVisibleViewDescriptor(this.viewDescriptor);
      }
      return;
    }

    if (index !== -1) {
      const [viewDescriptor] = this.visibleDescriptors.splice(index, 1);
      this.onDidRemoveVisibleViewDescriptorsEmitter.fire([{
        index,
        viewDescriptor,
      }]);
    }
  }
  public isCollapsed(): boolean { return false; }
  public setCollapsed(): void {}
  public getSize(): number | undefined { return undefined; }
  public setSizes(): void {}
  public move(): void {}
  public add(): void {}
  public remove(): void {}
}

class TestViewDescriptorService implements IViewDescriptorService {
  public declare readonly _serviceBrand: undefined;
  public readonly onDidChangeViewContainers: IViewDescriptorService["onDidChangeViewContainers"] = noneEvent();
  public readonly onDidChangeContainer: IViewDescriptorService["onDidChangeContainer"] = noneEvent();
  public readonly viewContainers: readonly ViewContainer[];
  public readonly model: TestViewContainerModel;

  public constructor(
    private readonly container: ViewContainer,
    private readonly viewDescriptor: IViewDescriptor,
    private readonly location = ViewContainerLocation.Panel,
  ) {
    this.viewContainers = [container];
    this.model = new TestViewContainerModel(container, viewDescriptor);
  }

  public getViewDescriptorById(viewId: string): IViewDescriptor | null {
    return viewId === this.viewDescriptor.id ? this.viewDescriptor : null;
  }

  public getViewLocationById(viewId: string): ViewContainerLocation | null {
    return viewId === this.viewDescriptor.id ? this.location : null;
  }

  public getViewContainerByViewId(viewId: string): ViewContainer | null {
    return viewId === this.viewDescriptor.id ? this.container : null;
  }

  public getViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation | null {
    return viewContainer.id === this.container.id ? this.location : null;
  }

  public getDefaultViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation | null {
    return this.getViewContainerLocation(viewContainer);
  }

  public getDefaultContainerById(viewId: string): ViewContainer | null {
    return this.getViewContainerByViewId(viewId);
  }

  public getViewContainerModel(container: ViewContainer): IViewContainerModel {
    assert.equal(container.id, this.container.id);
    return this.model;
  }

  public getViewContainerById(id: string): ViewContainer | null {
    return id === this.container.id ? this.container : null;
  }

  public getViewContainersByLocation(location: ViewContainerLocation): readonly ViewContainer[] {
    return location === this.location ? [this.container] : [];
  }

  public getDefaultViewContainer(location: ViewContainerLocation): ViewContainer | undefined {
    return location === this.location ? this.container : undefined;
  }

  public moveViewsToContainer(
    _views: readonly IViewDescriptor[],
    _viewContainer: ViewContainer,
    _visibilityState?: ViewVisibilityState,
  ): void {}
}

suite("workbench/services/views/browser/ViewsService", () => {
  test("exposes descriptor-created views before visibility events fire", () => {
    const viewDescriptor: IViewDescriptor = {
      ctorDescriptor: new SyncDescriptor(TestView),
      id: "test.view",
      name: "Test",
    };
    const container: ViewContainer = {
      ctorDescriptor: new SyncDescriptor(TestViewPaneContainer),
      id: "test.container",
      title: "Test",
    };
    const storageService = new TestStorageService();
    const contextKeyService = new ContextKeyService();
    const layoutService = new BrowserWorkbenchLayoutService(storageService);
    const services = new ServiceCollection();
    const instantiationService = new InstantiationService(services);
    const descriptorService = new TestViewDescriptorService(container, viewDescriptor);

    services.set(IStorageService, storageService);
    services.set(IContextKeyService, contextKeyService);
    services.set(IWorkbenchLayoutService, layoutService);
    services.set(IInstantiationService, instantiationService);
    services.set(IViewDescriptorService, descriptorService);

    const viewsService = new ViewsService(
      descriptorService,
      contextKeyService,
      instantiationService,
      layoutService,
    );
    let viewIdDuringVisibilityEvent: string | null = null;
    const listener = viewsService.onDidChangeViewVisibility(({ id }) => {
      if (id === viewDescriptor.id) {
        viewIdDuringVisibilityEvent = viewsService.getViewWithId(id)?.id ?? null;
      }
    });

    descriptorService.model.addVisibleViewDescriptor(viewDescriptor);

    assert.equal(viewIdDuringVisibilityEvent, viewDescriptor.id);

    listener.dispose();
    viewsService.dispose();
    instantiationService.dispose();
    layoutService.dispose();
    contextKeyService.dispose();
    storageService.dispose();
  });

  test("setViewVisible materializes descriptor views that start hidden", () => {
    const viewDescriptor: IViewDescriptor = {
      ctorDescriptor: new SyncDescriptor(TestView),
      hideByDefault: true,
      id: "test.view",
      name: "Test",
    };
    const container: ViewContainer = {
      ctorDescriptor: new SyncDescriptor(TestViewPaneContainer),
      id: "test.container",
      title: "Test",
    };
    const storageService = new TestStorageService();
    const contextKeyService = new ContextKeyService();
    const layoutService = new BrowserWorkbenchLayoutService(storageService);
    const services = new ServiceCollection();
    const instantiationService = new InstantiationService(services);
    const descriptorService = new TestViewDescriptorService(container, viewDescriptor);

    services.set(IStorageService, storageService);
    services.set(IContextKeyService, contextKeyService);
    services.set(IWorkbenchLayoutService, layoutService);
    services.set(IInstantiationService, instantiationService);
    services.set(IViewDescriptorService, descriptorService);

    const viewsService = new ViewsService(
      descriptorService,
      contextKeyService,
      instantiationService,
      layoutService,
    );

    assert.equal(viewsService.getViewWithId(viewDescriptor.id), null);

    assert.equal(viewsService.setViewVisible(viewDescriptor.id, true), true);

    assert.equal(viewsService.getViewWithId(viewDescriptor.id)?.id, viewDescriptor.id);
    assert.equal(viewsService.isViewVisible(viewDescriptor.id), true);

    viewsService.dispose();
    instantiationService.dispose();
    layoutService.dispose();
    contextKeyService.dispose();
    storageService.dispose();
  });

  test("closeViewContainer hides the active auxiliary bar part", async () => {
    const viewDescriptor: IViewDescriptor = {
      ctorDescriptor: new SyncDescriptor(TestView),
      id: "test.auxiliary.view",
      name: "Test",
    };
    const container: ViewContainer = {
      ctorDescriptor: new SyncDescriptor(TestViewPaneContainer),
      id: "test.auxiliary.container",
      title: "Test",
    };
    const storageService = new TestStorageService();
    const contextKeyService = new ContextKeyService();
    const layoutService = new BrowserWorkbenchLayoutService(storageService);
    const services = new ServiceCollection();
    const instantiationService = new InstantiationService(services);
    const descriptorService = new TestViewDescriptorService(
      container,
      viewDescriptor,
      ViewContainerLocation.AuxiliaryBar,
    );

    services.set(IStorageService, storageService);
    services.set(IContextKeyService, contextKeyService);
    services.set(IWorkbenchLayoutService, layoutService);
    services.set(IInstantiationService, instantiationService);
    services.set(IViewDescriptorService, descriptorService);

    const viewsService = new ViewsService(
      descriptorService,
      contextKeyService,
      instantiationService,
      layoutService,
    );

    await viewsService.openViewContainer(container.id);

    assert.equal(layoutService.isVisible(Parts.AUXILIARYBAR_PART), true);
    assert.equal(viewsService.isViewContainerVisible(container.id), true);

    viewsService.closeViewContainer(container.id);

    assert.equal(layoutService.isVisible(Parts.AUXILIARYBAR_PART), false);
    assert.equal(viewsService.isViewContainerVisible(container.id), false);

    await viewsService.openViewContainer(container.id);

    assert.equal(layoutService.isVisible(Parts.AUXILIARYBAR_PART), true);
    assert.equal(viewsService.isViewContainerVisible(container.id), true);

    viewsService.dispose();
    instantiationService.dispose();
    layoutService.dispose();
    contextKeyService.dispose();
    storageService.dispose();
  });
});
