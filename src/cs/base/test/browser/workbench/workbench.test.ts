import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import type { IAction } from "src/cs/base/common/actions";
import type {
  IMenuService,
} from "src/cs/platform/actions/common/actions";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import {
  ViewContainerLocation,
  type IView,
  type IViewDescriptor,
  type IViewPaneContainer,
  type ViewContainer,
} from "src/cs/workbench/common/views";
import { Workbench, type WorkbenchOptions } from "src/cs/workbench/browser/workbench";
import {
  WorkbenchDomainBridge,
  type WorkbenchDomainBridgeOptions,
} from "src/cs/workbench/browser/workbenchDomainBridge";
import {
  BrowserWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import { ExplorerViewContainerId } from "src/cs/workbench/contrib/files/browser/files";
import {
  SettingsNavigationViewContainerId,
  SettingsViewContainerId,
} from "src/cs/workbench/contrib/settings/common/settings";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { TemplateViewContainerId } from "src/cs/workbench/contrib/template/common/template";
import { ThumbnailViewContainerId } from "src/cs/workbench/contrib/thumbnail/common/thumbnail";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import { ExportViewContainerId } from "src/cs/workbench/services/export/common/export";
import { OriginExportSettingsViewContainerId } from "src/cs/workbench/services/origin/common/origin";
import { ParametersViewContainerId } from "src/cs/workbench/services/parameters/common/parameters";
import { SearchViewContainerId } from "src/cs/workbench/services/search/common/search";
import type { ThumbnailPreviewChangeEvent } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import type {
  IViewContainerNavigationState,
  IViewsService,
} from "src/cs/workbench/services/views/common/viewsService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type WorkbenchService<K extends keyof WorkbenchOptions> = NonNullable<WorkbenchOptions[K]>;
const WorkbenchTestViewContainerIds = [
  ExplorerViewContainerId,
  ThumbnailViewContainerId,
  SettingsNavigationViewContainerId,
  TableViewContainerId,
  ChartViewContainerId,
  SettingsViewContainerId,
  TemplateViewContainerId,
  SearchViewContainerId,
  ExportViewContainerId,
  ParametersViewContainerId,
  OriginExportSettingsViewContainerId,
] as const;
const AuxiliaryBarViewContainers = [
  TemplateViewContainerId,
  SearchViewContainerId,
  ExportViewContainerId,
  ParametersViewContainerId,
  OriginExportSettingsViewContainerId,
] as const;

class TestStorageService extends AbstractStorageService {
  private readonly values = new Map<string, string>();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    return this.values.get(this.storageKey(key, scope));
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    this.values.set(this.storageKey(key, scope), value);
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    this.values.delete(this.storageKey(key, scope));
  }

  protected readKeys(scope: StorageScope): string[] {
    const prefix = `${scope}:`;
    const keys: string[] = [];
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key.slice(prefix.length));
      }
    }
    return keys;
  }

  private storageKey(key: string, scope: StorageScope): string {
    return `${scope}:${key}`;
  }
}

class TestViewPaneContainer implements IViewPaneContainer {
  public readonly element = document.createElement("section");
  public title = "";
  public actions: readonly IAction[] = [];
  public contextActions: readonly IAction[] = [];
  public readonly onDidAddViews = Event.None as Event<readonly IView[]>;
  public readonly onDidRemoveViews = Event.None as Event<readonly IView[]>;
  public readonly onDidChangeViewVisibility = Event.None as Event<IView>;

  public setVisible(): void {}
  public isVisible(): boolean { return true; }
  public focus(): void {}
  public getActionsContext(): unknown { return undefined; }
  public getView(): IView | undefined { return undefined; }
  public addView(view: IView): IView { return view; }
  public openView(): IView | undefined { return undefined; }
  public removeView(): void {}
  public setViewVisible(): boolean { return false; }
  public toggleViewVisibility(): void {}
  public layout(): void {}

  public setTitle(title: string): void {
    this.title = title;
  }

  public setActions(actions: readonly IAction[], contextActions: readonly IAction[] = []): void {
    this.actions = actions;
    this.contextActions = contextActions;
  }

  public get views(): readonly IView[] {
    return [];
  }

  public dispose(): void {}
}

class RecordingViewsService implements IViewsService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeViewContainerNavigationEmitter =
    new Emitter<IViewContainerNavigationState>();

  public readonly onDidChangeViewContainerVisibility = Event.None as Event<{
    readonly id: string;
    readonly visible: boolean;
    readonly location: ViewContainerLocation;
  }>;
  public readonly onDidChangeViewContainerNavigation =
    this.onDidChangeViewContainerNavigationEmitter.event;
  public readonly onDidChangeViewVisibility = Event.None as Event<{
    readonly id: string;
    readonly visible: boolean;
  }>;
  public readonly onDidChangeFocusedView = Event.None as Event<void>;
  public readonly openCalls: string[] = [];
  public readonly closeCalls: string[] = [];
  public readonly setVisibleCalls: Array<{ id: string; visible: boolean }> = [];

  private readonly visibleContainers = new Set<string>();
  private readonly elements = new Map<string, HTMLElement>();
  private readonly containers = new Map<string, TestViewPaneContainer>();
  private readonly activeContainerByLocation = new Map<ViewContainerLocation, string>();
  private readonly navigationByLocation = new Map<ViewContainerLocation, {
    readonly history: readonly string[];
    readonly historyIndex: number;
  }>();

  public constructor(
    private readonly layoutService: BrowserWorkbenchLayoutService,
  ) {
    for (const id of WorkbenchTestViewContainerIds) {
      const container = new TestViewPaneContainer();
      container.element.dataset.containerId = id;
      this.elements.set(id, container.element);
      this.containers.set(id, container);
    }
  }

  public clearCalls(): void {
    this.openCalls.length = 0;
    this.closeCalls.length = 0;
    this.setVisibleCalls.length = 0;
  }

  public isViewContainerVisible(id: string): boolean {
    return this.visibleContainers.has(id);
  }

  public isViewContainerActive(id: string): boolean {
    return this.isViewContainerVisible(id);
  }

  public openViewContainer(id: string): Promise<ViewContainer | null> {
    this.openViewContainerInternal(id, "record");
    return Promise.resolve(null);
  }

  public closeViewContainer(id: string): void {
    this.closeCalls.push(id);
    const location = this.getViewContainerLocation(id);
    const previous = location
      ? this.getViewContainerNavigationState(location)
      : null;
    this.visibleContainers.delete(id);
    if (location && this.activeContainerByLocation.get(location) === id) {
      this.activeContainerByLocation.delete(location);
    }
    this.updatePartVisibility(id, false);
    if (location && previous) {
      this.fireViewContainerNavigationChangeIfNeeded(location, previous);
    }
  }

  public getVisibleViewContainer(_location: ViewContainerLocation): ViewContainer | null {
    return null;
  }

  public getViewContainerNavigationState(location: ViewContainerLocation): IViewContainerNavigationState {
    const navigation = this.navigationByLocation.get(location);
    return {
      activeViewContainerId: this.activeContainerByLocation.get(location) ?? null,
      historyIndex: navigation?.historyIndex ?? -1,
      historyLength: navigation?.history.length ?? 0,
      location,
    };
  }

  public navigateViewContainerBack(location: ViewContainerLocation): ViewContainer | null {
    const navigation = this.navigationByLocation.get(location);
    if (!navigation || navigation.historyIndex <= 0) {
      return null;
    }

    const nextNavigation = {
      history: navigation.history,
      historyIndex: navigation.historyIndex - 1,
    };
    this.openViewContainerInternal(nextNavigation.history[nextNavigation.historyIndex]!, {
      navigation: nextNavigation,
    });
    return null;
  }

  public navigateViewContainerForward(location: ViewContainerLocation): ViewContainer | null {
    const navigation = this.navigationByLocation.get(location);
    if (!navigation || navigation.historyIndex >= navigation.history.length - 1) {
      return null;
    }

    const nextNavigation = {
      history: navigation.history,
      historyIndex: navigation.historyIndex + 1,
    };
    this.openViewContainerInternal(nextNavigation.history[nextNavigation.historyIndex]!, {
      navigation: nextNavigation,
    });
    return null;
  }

  public resetViewContainerNavigation(
    location: ViewContainerLocation,
    id: string,
  ): ViewContainer | null {
    if (this.getViewContainerLocation(id) !== location) {
      return null;
    }

    this.openViewContainerInternal(id, {
      navigation: { history: [id], historyIndex: 0 },
    });
    return null;
  }

  public getViewContainerElement(id: string): unknown | null {
    return this.elements.get(id) ?? null;
  }

  public getActiveViewPaneContainerWithId(id: string): IViewPaneContainer | null {
    return this.isViewContainerVisible(id)
      ? this.containers.get(id) ?? null
      : null;
  }

  public getFocusedView(): IViewDescriptor | null {
    return null;
  }

  public getFocusedViewName(): string {
    return "";
  }

  public addViewToContainer(): IView | null {
    return null;
  }

  public setViewVisible(id: string, visible: boolean): boolean {
    this.setVisibleCalls.push({ id, visible });
    return true;
  }

  public isViewVisible(id: string): boolean {
    return this.setVisibleCalls.some(call => call.id === id && call.visible);
  }

  public openView<T extends IView>(): Promise<T | null> {
    return Promise.resolve(null);
  }

  public closeView(): void {}
  public getActiveViewWithId<T extends IView>(): T | null { return null; }
  public getViewWithId<T extends IView>(): T | null { return null; }
  public getViewProgressIndicator(): unknown | undefined { return undefined; }

  private openViewContainerInternal(
    id: string,
    navigationUpdate: "record" | {
      readonly navigation: {
        readonly history: readonly string[];
        readonly historyIndex: number;
      };
    },
  ): void {
    this.openCalls.push(id);
    const location = this.getViewContainerLocation(id);
    const previous = location
      ? this.getViewContainerNavigationState(location)
      : null;
    if (location) {
      const previousId = this.activeContainerByLocation.get(location);
      if (previousId && previousId !== id) {
        this.visibleContainers.delete(previousId);
      }
      this.activeContainerByLocation.set(location, id);
      this.updateNavigation(location, id, navigationUpdate);
    }
    this.visibleContainers.add(id);
    this.updatePartVisibility(id, true);
    if (location && previous) {
      this.fireViewContainerNavigationChangeIfNeeded(location, previous);
    }
  }

  private updateNavigation(
    location: ViewContainerLocation,
    id: string,
    update: "record" | {
      readonly navigation: {
        readonly history: readonly string[];
        readonly historyIndex: number;
      };
    },
  ): void {
    if (update === "record") {
      const previous = this.navigationByLocation.get(location);
      if (previous?.history[previous.historyIndex] === id) {
        return;
      }

      const history = previous
        ? previous.history.slice(0, previous.historyIndex + 1)
        : [];
      this.navigationByLocation.set(location, {
        history: [...history, id],
        historyIndex: history.length,
      });
      return;
    }

    this.navigationByLocation.set(location, update.navigation);
  }

  private fireViewContainerNavigationChangeIfNeeded(
    location: ViewContainerLocation,
    previous: IViewContainerNavigationState,
  ): void {
    const next = this.getViewContainerNavigationState(location);
    if (
      previous.activeViewContainerId === next.activeViewContainerId &&
      previous.historyIndex === next.historyIndex &&
      previous.historyLength === next.historyLength
    ) {
      return;
    }

    this.onDidChangeViewContainerNavigationEmitter.fire(next);
  }

  private getViewContainerLocation(id: string): ViewContainerLocation | null {
    switch (id) {
      case ExplorerViewContainerId:
      case ThumbnailViewContainerId:
      case SettingsNavigationViewContainerId:
        return ViewContainerLocation.Sidebar;
      case TableViewContainerId:
      case ChartViewContainerId:
      case SettingsViewContainerId:
        return ViewContainerLocation.Panel;
      case TemplateViewContainerId:
      case SearchViewContainerId:
      case ExportViewContainerId:
      case ParametersViewContainerId:
      case OriginExportSettingsViewContainerId:
        return ViewContainerLocation.AuxiliaryBar;
      default:
        return null;
    }
  }

  private updatePartVisibility(id: string, visible: boolean): void {
    switch (id) {
      case ExplorerViewContainerId:
      case ThumbnailViewContainerId:
      case SettingsNavigationViewContainerId:
        this.layoutService.setPartHidden(!visible, Parts.SIDEBAR_PART);
        break;
      case TableViewContainerId:
      case ChartViewContainerId:
      case SettingsViewContainerId:
        this.layoutService.setPartHidden(!visible, Parts.PANEL_PART);
        break;
      case TemplateViewContainerId:
      case SearchViewContainerId:
      case ExportViewContainerId:
      case ParametersViewContainerId:
      case OriginExportSettingsViewContainerId:
        this.layoutService.setPartHidden(!visible, Parts.AUXILIARYBAR_PART);
        break;
      default:
        break;
    }
  }
}

suite("workbench/browser/workbench layout integration", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("reports initial render after the complete workbench split is mounted", () => {
    const parent = document.createElement("div");
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const viewsService = new RecordingViewsService(layoutService);
    const contextKeyService = new ContextKeyService();
    const readySnapshots: Array<{
      readonly hasAuxiliaryBar: boolean;
      readonly hasMain: boolean;
      readonly hasSidebar: boolean;
      readonly hasSplit: boolean;
    }> = [];
    document.body.append(parent);

    const workbench = new Workbench(parent, createWorkbenchOptions({
      contextKeyService,
      layoutService,
      onDidRenderInitialWorkbench: () => {
        readySnapshots.push({
          hasAuxiliaryBar: Boolean(parent.querySelector(".workbench_layout_split .workbench_layout_auxiliarybar")),
          hasMain: Boolean(parent.querySelector(".workbench_layout_split #workbench-viewpane-main")),
          hasSidebar: Boolean(parent.querySelector(".workbench_layout_split .workbench_layout_sidebar")),
          hasSplit: Boolean(parent.querySelector(".workbench_layout_split")),
        });
      },
      storage,
      viewsService,
    }));

    try {
      assert.deepEqual(readySnapshots, [{
        hasAuxiliaryBar: true,
        hasMain: true,
        hasSidebar: true,
        hasSplit: true,
      }]);
      assert.equal(viewsService.openCalls.includes(ExplorerViewContainerId), true);
      assert.equal(viewsService.openCalls.includes(TableViewContainerId), true);
      assert.equal(viewsService.openCalls.includes(TemplateViewContainerId), true);
    } finally {
      workbench.dispose();
      contextKeyService.dispose();
      layoutService.dispose();
      storage.dispose();
      parent.remove();
    }
  });

  test("settings navigation does not hide or reopen the auxiliary bar part", async () => {
    const parent = document.createElement("div");
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const viewsService = new RecordingViewsService(layoutService);
    const contextKeyService = new ContextKeyService();
    document.body.append(parent);

    const workbench = new Workbench(parent, createWorkbenchOptions({
      contextKeyService,
      layoutService,
      storage,
      viewsService,
    }));

    try {
      viewsService.clearCalls();

      await viewsService.openViewContainer(SettingsViewContainerId);
      await Promise.resolve();

      assert.equal(layoutService.isVisible(Parts.AUXILIARYBAR_PART), true);
      assert.equal(viewsService.openCalls.includes(SettingsNavigationViewContainerId), true);
      assert.equal(viewsService.openCalls.includes(SettingsViewContainerId), true);
      assert.equal(viewsService.openCalls.includes(ExplorerViewContainerId), false);
      assert.equal(viewsService.openCalls.includes(ThumbnailViewContainerId), false);
      assert.deepEqual(
        viewsService.closeCalls.filter(id => AuxiliaryBarViewContainers.includes(id as typeof AuxiliaryBarViewContainers[number])),
        [],
      );

      viewsService.clearCalls();

      await viewsService.openViewContainer(TableViewContainerId);
      await Promise.resolve();

      assert.equal(layoutService.isVisible(Parts.AUXILIARYBAR_PART), true);
      assert.equal(viewsService.openCalls.includes(ExplorerViewContainerId), true);
      assert.equal(viewsService.openCalls.includes(TableViewContainerId), true);
      assert.equal(viewsService.openCalls.includes(ThumbnailViewContainerId), false);
      assert.deepEqual(
        viewsService.closeCalls.filter(id => AuxiliaryBarViewContainers.includes(id as typeof AuxiliaryBarViewContainers[number])),
        [],
      );
      assert.equal(
        workbench.contentElement.querySelector(".workbench_layout_split--animate-auxiliarybar"),
        null,
      );
    } finally {
      workbench.dispose();
      contextKeyService.dispose();
      layoutService.dispose();
      storage.dispose();
      parent.remove();
    }
  });

  test("chart thumbnail layout uses the thumbnail sidebar surface", async () => {
    const parent = document.createElement("div");
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const viewsService = new RecordingViewsService(layoutService);
    const contextKeyService = new ContextKeyService();
    const explorerService = new ExplorerService();
    document.body.append(parent);

    const workbench = new Workbench(parent, createWorkbenchOptions({
      contextKeyService,
      explorerService,
      layoutService,
      storage,
      viewsService,
    }));

    try {
      viewsService.clearCalls();

      await viewsService.openViewContainer(ChartViewContainerId);
      await Promise.resolve();

      assert.equal(viewsService.openCalls.includes(ExplorerViewContainerId), true);
      assert.equal(viewsService.openCalls.includes(ChartViewContainerId), true);
      assert.equal(viewsService.openCalls.includes(ThumbnailViewContainerId), false);

      viewsService.clearCalls();
      explorerService.setViewLayout("thumbnail");
      await Promise.resolve();

      assert.equal(viewsService.openCalls.includes(ThumbnailViewContainerId), true);
      assert.equal(viewsService.openCalls.includes(ChartViewContainerId), true);
      assert.equal(
        (viewsService.getActiveViewPaneContainerWithId(ThumbnailViewContainerId) as TestViewPaneContainer | null)?.title,
        "Thumbnail",
      );
    } finally {
      workbench.dispose();
      explorerService.dispose();
      contextKeyService.dispose();
      layoutService.dispose();
      storage.dispose();
      parent.remove();
    }
  });

  test("visible explorer range does not prefetch outside chart thumbnail layout", () => {
    const visibleTargetsEmitter = new Emitter<{
      readonly nearbyTargets: readonly { readonly resource: URI }[];
      readonly visibleTargets: readonly { readonly resource: URI }[];
    }>();
    const plotPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
    const thumbnailPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
    const bridge = new WorkbenchDomainBridge({
      calculationService: {
        getResourceResult: () => null,
        onDidChangeResourceCalculationResult: Event.None,
        prioritizeResource: () => undefined,
      },
      chartService: {
        onDidChangeChartState: Event.None,
        onDidChangeChartViewInput: Event.None,
        updateViewInput: () => undefined,
      },
      explorerService: {
        files: [],
        getPaneInput: () => null,
        isImportingSources: false,
        hoveredResource: null,
        onDidChangeFiles: Event.None,
        onDidChangeHoveredResource: Event.None,
        onDidChangeSelection: Event.None,
        onDidChangeVisibleTargets: visibleTargetsEmitter.event,
        selectedResource: null,
        selectedSheetId: null,
        updatePaneInput: () => undefined,
        viewLayout: "tree",
      },
      getActivePanelViewContainerId: () => TableViewContainerId,
      onDidChangeActivePanelViewContainer: Event.None,
      plotService: {
        getState: () => ({ activePlotType: "iv" }),
        onDidChangePlotState: Event.None,
        prefetchCalculatedData: (fileIds: readonly string[], priority: string) => {
          plotPrefetches.push({ fileIds, priority });
        },
      },
      settingsService: {
        getConductorSettings: () => null,
        onDidChangeConductorSettings: Event.None,
        onDidChangeNumericDisplayMode: Event.None,
      },
      sliceService: createSliceService(),
      tableService: {
        open: () => undefined,
      },
      thumbnailPreviewService: {
        onDidChangePreview: Event.None,
        prefetch: (fileIds: readonly string[], priority: string) => {
          thumbnailPrefetches.push({ fileIds, priority });
        },
      },
    } as unknown as WorkbenchDomainBridgeOptions);

    try {
      visibleTargetsEmitter.fire({
        nearbyTargets: [{ resource: URI.file("/data/B.csv") }],
        visibleTargets: [{ resource: URI.file("/data/A.csv") }],
      });

      assert.deepEqual(plotPrefetches, []);
      assert.deepEqual(thumbnailPrefetches, []);
    } finally {
      bridge.dispose();
      visibleTargetsEmitter.dispose();
    }
  });

  test("sync does not synthesize active chart data without Explorer resources", () => {
    const calculationPriorities: string[] = [];
    const plotPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
    const plotDisplayPrefetches: Array<{ fileId?: string | null; plotType?: string; priority: string }> = [];
    const chartActiveFileIds: Array<string | null | undefined> = [];
    const bridge = new WorkbenchDomainBridge({
      calculationService: {
        getResourceResult: () => null,
        onDidChangeResourceCalculationResult: Event.None,
        prioritizeResource: (resource: URI) => {
          calculationPriorities.push(resource.toString());
        },
      },
      chartService: {
        onDidChangeChartState: Event.None,
        onDidChangeChartViewInput: Event.None,
        updateViewInput: (input: { readonly activeFileId?: string | null }) => {
          chartActiveFileIds.push(input.activeFileId);
        },
      },
      explorerService: {
        files: [],
        getPaneInput: () => null,
        isImportingSources: false,
        hoveredResource: null,
        onDidChangeFiles: Event.None,
        onDidChangeHoveredResource: Event.None,
        onDidChangeSelection: Event.None,
        onDidChangeVisibleTargets: Event.None,
        select: () => undefined,
        selectedResource: null,
        selectedSheetId: null,
        updatePaneInput: () => undefined,
        viewLayout: "tree",
      },
      getActivePanelViewContainerId: () => ChartViewContainerId,
      onDidChangeActivePanelViewContainer: Event.None,
      plotService: {
        getCachedCalculatedData: () => null,
        getCalculatedData: () => null,
        getState: () => ({ activePlotType: "iv" }),
        onDidChangeCalculatedDataCache: Event.None,
        onDidChangePlotState: Event.None,
        prefetchCalculatedData: (fileIds: readonly string[], priority: string) => {
          plotPrefetches.push({ fileIds, priority });
        },
        prefetchPlotDisplayModel: (
          input: { readonly fileId?: string | null; readonly plotType?: string },
          priority: string,
        ) => {
          plotDisplayPrefetches.push({
            fileId: input.fileId,
            plotType: input.plotType,
            priority,
          });
        },
      },
      settingsService: {
        getConductorSettings: () => null,
        onDidChangeConductorSettings: Event.None,
        onDidChangeNumericDisplayMode: Event.None,
      },
      sliceService: createSliceService(),
      tableService: {
        open: () => undefined,
      },
      thumbnailPreviewService: {
        onDidChangePreview: Event.None,
        prefetch: () => undefined,
      },
    } as unknown as WorkbenchDomainBridgeOptions);

    try {
      bridge.sync();

      assert.deepEqual(chartActiveFileIds, [null]);
      assert.deepEqual(calculationPriorities, []);
      assert.deepEqual(plotPrefetches, []);
      assert.deepEqual(plotDisplayPrefetches, []);
    } finally {
      bridge.dispose();
    }
  });

});

const createWorkbenchOptions = ({
  contextKeyService,
  explorerService,
  layoutService,
  onDidRenderInitialWorkbench,
  storage,
  viewsService,
}: {
  readonly contextKeyService: ContextKeyService;
  readonly explorerService?: WorkbenchService<"explorerService">;
  readonly layoutService: BrowserWorkbenchLayoutService;
  readonly onDidRenderInitialWorkbench?: () => void;
  readonly storage: TestStorageService;
  readonly viewsService: RecordingViewsService;
}): WorkbenchOptions => {
  const notificationService = {
    get toasts() { return []; },
    onDidChangeToast: Event.None,
    get statusMessage() { return undefined; },
    onDidChangeStatusMessage: Event.None,
  } as unknown as WorkbenchService<"notificationService">;
  const tableViewModel = {
    getState: () => ({}),
    onDidChangeState: () => () => undefined,
  };
  const menuService: IMenuService = {
    _serviceBrand: undefined,
    createMenu: () => {
      throw new Error("Test menu service does not create menus.");
    },
    getMenuActions: () => [],
    getMenuContexts: () => new Set(),
    resetHiddenStates: () => undefined,
  };

  return {
    calculationService: {
      _serviceBrand: undefined,
      getResourceResult: () => null,
      onDidChangeResourceCalculationResult:
        Event.None as WorkbenchService<"calculationService">["onDidChangeResourceCalculationResult"],
      prioritizeResource: () => undefined,
    },
    chartService: {
      onDidChangeChartState: Event.None,
      onDidChangeChartViewInput: Event.None,
      updateViewInput: () => undefined,
    } as unknown as WorkbenchService<"chartService">,
    commandService: {
      _serviceBrand: undefined,
      onDidExecuteCommand: Event.None,
      onWillExecuteCommand: Event.None,
      executeCommand: async () => undefined,
    } as unknown as ICommandService,
    contextKeyService,
    dialogsService: {} as WorkbenchService<"dialogsService">,
    explorerService: explorerService ?? {
      files: [],
      getPaneInput: () => null,
      isImportingSources: false,
      hoveredResource: null,
      onDidChangeFiles: Event.None,
      onDidChangeHoveredResource: Event.None,
      onDidChangeVisibleTargets: Event.None,
      onDidChangeSelection: Event.None,
      onDidChangeViewLayout: Event.None,
      selectedResource: null,
      selectedSheetId: null,
      select: () => undefined,
      setImportingSources: () => undefined,
      updatePaneInput: () => undefined,
      viewLayout: "tree",
    } as unknown as WorkbenchService<"explorerService">,
    exportService: {
      getState: () => ({
        canvasScope: "current",
        curveMode: "all",
        filteredKind: "transfer",
        originMode: "merged",
        selectedContentKeys: [],
        selectedCurveKeys: [],
      }),
      onDidChangeExportState: Event.None,
      updateViewState: () => undefined,
    } as unknown as WorkbenchService<"exportService">,
    filesService: {} as WorkbenchService<"filesService">,
    layoutService,
    menuService,
    notificationService,
    onDidRenderInitialWorkbench,
    parametersService: {
      onDidChangeParametersViewState: Event.None,
      updateViewState: () => undefined,
    } as unknown as WorkbenchService<"parametersService">,
    pathService: {} as WorkbenchService<"pathService">,
    plotService: {
      onDidChangePlotState: Event.None,
      onDidChangePlotDisplayModelCache: Event.None,
      getCachedCalculatedData: () => null,
      getCachedPlotDisplayModel: () => null,
      getCachedPlotLegendModel: () => null,
      getCalculatedData: () => null,
      getLegendLabels: () => ({}),
      getPlotMainRenderModel: () => null,
      getState: () => ({ activePlotType: "iv" }),
      onDidChangeCalculatedDataCache: Event.None,
      prefetchCalculatedData: () => undefined,
    } as unknown as WorkbenchService<"plotService">,
    settingsService: {
      onDidChangeConductorSettings: Event.None,
      onDidChangeNumericDisplayMode: Event.None,
      onDidChangeOriginSettingsViewInput: Event.None,
      onDidChangeSettingsViewInput: Event.None,
      canCheckOriginHealth: () => false,
      canManageOrigin: () => false,
      canRunOriginCleanup: () => false,
      checkOriginHealth: async () => ({ ok: false }),
      chooseOriginExePath: async () => "",
      errorMessage: (error: unknown) => String(error),
      formatOriginError: (error: unknown) => String(error),
      getConductorSettings: () => null,
      getOriginExePath: async () => "",
      getOriginSettingsViewInput: () => ({}),
      getSettingsViewInput: () => null,
      mergeConductorSettings: () => undefined,
      runOriginCleanup: async () => ({ ok: true }),
      update: () => undefined,
      updateOriginPlotOptions: async () => null,
      updatePlotAxisSettings: async () => null,
      updateSettings: async () => null,
    } as unknown as WorkbenchService<"settingsService">,
    sliceService: createSliceService(),
    storageService: storage,
    tableService: {
      onDidChangeTableState: Event.None,
      open: () => undefined,
      update: () => tableViewModel,
      updateViewInput: () => undefined,
    } as unknown as WorkbenchService<"tableService">,
    templateViewStateService: {
      onDidChangeTemplateState: Event.None,
      getState: () => ({
        formState: {},
        mode: "management",
        selectedTemplateId: null,
      }),
    } as unknown as WorkbenchService<"templateViewStateService">,
	    thumbnailPreviewService: {
	      _serviceBrand: undefined,
	      get: () => ({ kind: "idle" }),
      invalidate: () => undefined,
      onDidChangePreview: Event.None as Event<ThumbnailPreviewChangeEvent>,
      prefetch: () => undefined,
      request: () => ({ kind: "idle" }),
    },
    titleService: {
      attachTitlebarPart: () => Disposable.None,
      layout: () => undefined,
      patchTitlebarState: () => undefined,
      updateTitlebarState: () => undefined,
    } as unknown as WorkbenchService<"titleService">,
    viewsService,
  };
};

const createSliceService = (): WorkbenchService<"sliceService"> => ({
  _serviceBrand: undefined,
  cancelResource: () => undefined,
  getResourceResult: () => null,
  getResourceState: () => undefined,
  getState: () => ({
    queueLength: 0,
    templateSelections: [],
  }),
  getTemplateSelection: () => ({ kind: "auto" }),
  onDidChangeResourceSliceResult: Event.None,
  onDidChangeSliceState: Event.None,
  onDidChangeTemplateSelection: Event.None,
  prioritizeResource: () => undefined,
  setTemplateSelection: () => undefined,
  submitResource: () => undefined,
} as unknown as WorkbenchService<"sliceService">);
