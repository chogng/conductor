import * as assert from "assert";

import { Emitter, Event, type Event as EventType } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { IStorageService, StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
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

let testViewInstanceCount = 0;
let testViewPaneContainerInstanceCount = 0;

class TestView implements IView {
  public readonly id = "test.view";
  public readonly element = fakeElement();
  private visible = false;

  public constructor() {
    testViewInstanceCount++;
  }

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

  public constructor() {
    testViewPaneContainerInstanceCount++;
  }

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

type TestViewDescriptorServiceEntry = {
  readonly container: ViewContainer;
  readonly location?: ViewContainerLocation;
  readonly viewDescriptor: IViewDescriptor;
};

class TestViewDescriptorService implements IViewDescriptorService {
  public declare readonly _serviceBrand: undefined;
  public readonly onDidChangeViewContainers: IViewDescriptorService["onDidChangeViewContainers"] = noneEvent();
  public readonly onDidChangeContainer: IViewDescriptorService["onDidChangeContainer"] = noneEvent();
  public readonly viewContainers: readonly ViewContainer[];
  public readonly model: TestViewContainerModel;
  private readonly entries: readonly Required<TestViewDescriptorServiceEntry>[];
  private readonly models = new Map<string, TestViewContainerModel>();

  public constructor(
    containerOrEntries: ViewContainer | readonly TestViewDescriptorServiceEntry[],
    viewDescriptor?: IViewDescriptor,
    location = ViewContainerLocation.Panel,
  ) {
    const entries = Array.isArray(containerOrEntries)
      ? containerOrEntries
      : [{
        container: containerOrEntries,
        location,
        viewDescriptor: viewDescriptor!,
      }];
    this.entries = entries.map(entry => ({
      container: entry.container,
      location: entry.location ?? ViewContainerLocation.Panel,
      viewDescriptor: entry.viewDescriptor,
    }));
    this.viewContainers = this.entries.map(entry => entry.container);
    for (const entry of this.entries) {
      this.models.set(entry.container.id, new TestViewContainerModel(
        entry.container,
        entry.viewDescriptor,
      ));
    }
    this.model = this.models.get(this.entries[0]!.container.id)!;
  }

  public getViewDescriptorById(viewId: string): IViewDescriptor | null {
    return this.getEntryByViewId(viewId)?.viewDescriptor ?? null;
  }

  public getViewLocationById(viewId: string): ViewContainerLocation | null {
    return this.getEntryByViewId(viewId)?.location ?? null;
  }

  public getViewContainerByViewId(viewId: string): ViewContainer | null {
    return this.getEntryByViewId(viewId)?.container ?? null;
  }

  public getViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation | null {
    return this.getEntryByContainerId(viewContainer.id)?.location ?? null;
  }

  public getDefaultViewContainerLocation(viewContainer: ViewContainer): ViewContainerLocation | null {
    return this.getViewContainerLocation(viewContainer);
  }

  public getDefaultContainerById(viewId: string): ViewContainer | null {
    return this.getViewContainerByViewId(viewId);
  }

  public getViewContainerModel(container: ViewContainer): IViewContainerModel {
    const model = this.models.get(container.id);
    assert.ok(model);
    return model;
  }

  public getViewContainerById(id: string): ViewContainer | null {
    return this.getEntryByContainerId(id)?.container ?? null;
  }

  public getViewContainersByLocation(location: ViewContainerLocation): readonly ViewContainer[] {
    return this.entries
      .filter(entry => entry.location === location)
      .map(entry => entry.container);
  }

  public getDefaultViewContainer(location: ViewContainerLocation): ViewContainer | undefined {
    return this.entries.find(entry => entry.location === location)?.container;
  }

  public moveViewsToContainer(
    _views: readonly IViewDescriptor[],
    _viewContainer: ViewContainer,
    _visibilityState?: ViewVisibilityState,
  ): void {}

  private getEntryByViewId(viewId: string): Required<TestViewDescriptorServiceEntry> | null {
    return this.entries.find(entry => entry.viewDescriptor.id === viewId) ?? null;
  }

  private getEntryByContainerId(containerId: string): Required<TestViewDescriptorServiceEntry> | null {
    return this.entries.find(entry => entry.container.id === containerId) ?? null;
  }
}

suite("workbench/services/views/browser/ViewsService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  setup(() => {
    testViewInstanceCount = 0;
    testViewPaneContainerInstanceCount = 0;
  });

  test("exposes lazily-created descriptor views before visibility events fire", async () => {
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
    const storageService = store.add(new TestStorageService());
    const contextKeyService = store.add(new ContextKeyService());
    const layoutService = store.add(new BrowserWorkbenchLayoutService(storageService));
    const services = new ServiceCollection();
    const instantiationService = store.add(new InstantiationService(services));
    const descriptorService = new TestViewDescriptorService(container, viewDescriptor);

    services.set(IStorageService, storageService);
    services.set(IContextKeyService, contextKeyService);
    services.set(IWorkbenchLayoutService, layoutService);
    services.set(IInstantiationService, instantiationService);
    services.set(IViewDescriptorService, descriptorService);

    const viewsService = store.add(new ViewsService(
      descriptorService,
      contextKeyService,
      instantiationService,
      layoutService,
    ));
    const viewIdsDuringVisibilityEvents: string[] = [];
    const listener = store.add(viewsService.onDidChangeViewVisibility(({ id }) => {
      if (id === viewDescriptor.id) {
        viewIdsDuringVisibilityEvents.push(viewsService.getViewWithId(id)?.id ?? "");
      }
    }));

    descriptorService.model.addVisibleViewDescriptor(viewDescriptor);

    assert.equal(viewsService.getViewWithId(viewDescriptor.id), null);
    assert.equal(testViewPaneContainerInstanceCount, 0);
    assert.equal(testViewInstanceCount, 0);

    await viewsService.openViewContainer(container.id);

    assert.ok(viewIdsDuringVisibilityEvents.length > 0);
    assert.ok(viewIdsDuringVisibilityEvents.every(id => id === viewDescriptor.id));
    assert.equal(viewsService.getViewWithId(viewDescriptor.id)?.id, viewDescriptor.id);
    assert.equal(testViewPaneContainerInstanceCount, 1);
    assert.equal(testViewInstanceCount, 1);

    listener.dispose();
    viewsService.dispose();
    instantiationService.dispose();
    layoutService.dispose();
    contextKeyService.dispose();
    storageService.dispose();
  });

  test("setViewVisible updates hidden descriptors without materializing views", async () => {
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
    const storageService = store.add(new TestStorageService());
    const contextKeyService = store.add(new ContextKeyService());
    const layoutService = store.add(new BrowserWorkbenchLayoutService(storageService));
    const services = new ServiceCollection();
    const instantiationService = store.add(new InstantiationService(services));
    const descriptorService = new TestViewDescriptorService(container, viewDescriptor);

    services.set(IStorageService, storageService);
    services.set(IContextKeyService, contextKeyService);
    services.set(IWorkbenchLayoutService, layoutService);
    services.set(IInstantiationService, instantiationService);
    services.set(IViewDescriptorService, descriptorService);

    const viewsService = store.add(new ViewsService(
      descriptorService,
      contextKeyService,
      instantiationService,
      layoutService,
    ));

    assert.equal(viewsService.getViewWithId(viewDescriptor.id), null);
    assert.equal(testViewPaneContainerInstanceCount, 0);
    assert.equal(testViewInstanceCount, 0);

    assert.equal(viewsService.setViewVisible(viewDescriptor.id, true), true);

    assert.equal(viewsService.getViewWithId(viewDescriptor.id), null);
    assert.equal(viewsService.isViewVisible(viewDescriptor.id), true);
    assert.equal(testViewPaneContainerInstanceCount, 0);
    assert.equal(testViewInstanceCount, 0);

    await viewsService.openViewContainer(container.id);

    assert.equal(viewsService.getViewWithId(viewDescriptor.id)?.id, viewDescriptor.id);
    assert.equal(testViewPaneContainerInstanceCount, 1);
    assert.equal(testViewInstanceCount, 1);

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
    const storageService = store.add(new TestStorageService());
    const contextKeyService = store.add(new ContextKeyService());
    const layoutService = store.add(new BrowserWorkbenchLayoutService(storageService));
    const services = new ServiceCollection();
    const instantiationService = store.add(new InstantiationService(services));
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

    const viewsService = store.add(new ViewsService(
      descriptorService,
      contextKeyService,
      instantiationService,
      layoutService,
    ));

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

  test("tracks view container navigation per location", async () => {
    const tableViewDescriptor: IViewDescriptor = {
      ctorDescriptor: new SyncDescriptor(TestView),
      id: "test.table.view",
      name: "Table",
    };
    const chartViewDescriptor: IViewDescriptor = {
      ctorDescriptor: new SyncDescriptor(TestView),
      id: "test.chart.view",
      name: "Chart",
    };
    const tableContainer: ViewContainer = {
      ctorDescriptor: new SyncDescriptor(TestViewPaneContainer),
      id: "test.table.container",
      title: "Table",
    };
    const chartContainer: ViewContainer = {
      ctorDescriptor: new SyncDescriptor(TestViewPaneContainer),
      id: "test.chart.container",
      title: "Chart",
    };
    const storageService = store.add(new TestStorageService());
    const contextKeyService = store.add(new ContextKeyService());
    const layoutService = store.add(new BrowserWorkbenchLayoutService(storageService));
    const services = new ServiceCollection();
    const instantiationService = store.add(new InstantiationService(services));
    const descriptorService = new TestViewDescriptorService([{
      container: tableContainer,
      viewDescriptor: tableViewDescriptor,
    }, {
      container: chartContainer,
      viewDescriptor: chartViewDescriptor,
    }]);

    services.set(IStorageService, storageService);
    services.set(IContextKeyService, contextKeyService);
    services.set(IWorkbenchLayoutService, layoutService);
    services.set(IInstantiationService, instantiationService);
    services.set(IViewDescriptorService, descriptorService);

    const viewsService = store.add(new ViewsService(
      descriptorService,
      contextKeyService,
      instantiationService,
      layoutService,
    ));

    assert.deepStrictEqual(viewsService.getViewContainerNavigationState(ViewContainerLocation.Panel), {
      activeViewContainerId: null,
      historyIndex: -1,
      historyLength: 0,
      location: ViewContainerLocation.Panel,
    });

    await viewsService.openViewContainer(tableContainer.id);
    await viewsService.openViewContainer(chartContainer.id);

    assert.deepStrictEqual(viewsService.getViewContainerNavigationState(ViewContainerLocation.Panel), {
      activeViewContainerId: chartContainer.id,
      historyIndex: 1,
      historyLength: 2,
      location: ViewContainerLocation.Panel,
    });

    assert.equal(viewsService.navigateViewContainerBack(ViewContainerLocation.Panel)?.id, tableContainer.id);
    assert.deepStrictEqual(viewsService.getViewContainerNavigationState(ViewContainerLocation.Panel), {
      activeViewContainerId: tableContainer.id,
      historyIndex: 0,
      historyLength: 2,
      location: ViewContainerLocation.Panel,
    });

    assert.equal(viewsService.navigateViewContainerForward(ViewContainerLocation.Panel)?.id, chartContainer.id);
    assert.deepStrictEqual(viewsService.getViewContainerNavigationState(ViewContainerLocation.Panel), {
      activeViewContainerId: chartContainer.id,
      historyIndex: 1,
      historyLength: 2,
      location: ViewContainerLocation.Panel,
    });

    assert.equal(viewsService.resetViewContainerNavigation(
      ViewContainerLocation.Panel,
      tableContainer.id,
    )?.id, tableContainer.id);
    assert.deepStrictEqual(viewsService.getViewContainerNavigationState(ViewContainerLocation.Panel), {
      activeViewContainerId: tableContainer.id,
      historyIndex: 0,
      historyLength: 1,
      location: ViewContainerLocation.Panel,
    });

    viewsService.dispose();
    instantiationService.dispose();
    layoutService.dispose();
    contextKeyService.dispose();
    storageService.dispose();
  });
});
