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
import type { IView, IViewDescriptor, IViewPaneContainer, ViewContainer, ViewContainerLocation } from "src/cs/workbench/common/views";
import { Workbench, type WorkbenchOptions } from "src/cs/workbench/browser/workbench";
import {
  WorkbenchDomainBridge,
  type WorkbenchDomainBridgeOptions,
} from "src/cs/workbench/browser/workbenchDomainBridge";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  BrowserWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import type { ThumbnailPreviewChangeEvent } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
  createEmptySessionModel,
  type BaseCurveKey,
  type FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type WorkbenchService<K extends keyof WorkbenchOptions> = NonNullable<WorkbenchOptions[K]>;
const AuxiliaryBarViewContainers = [
  WorkbenchViewContainers.template,
  WorkbenchViewContainers.search,
  WorkbenchViewContainers.export,
  WorkbenchViewContainers.parameters,
  WorkbenchViewContainers.originSettings,
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

  public readonly onDidChangeViewContainerVisibility = Event.None as Event<{
    readonly id: string;
    readonly visible: boolean;
    readonly location: ViewContainerLocation;
  }>;
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

  public constructor(
    private readonly layoutService: BrowserWorkbenchLayoutService,
  ) {
    for (const id of Object.values(WorkbenchViewContainers)) {
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
    this.openCalls.push(id);
    this.visibleContainers.add(id);
    this.updatePartVisibility(id, true);
    return Promise.resolve(null);
  }

  public closeViewContainer(id: string): void {
    this.closeCalls.push(id);
    this.visibleContainers.delete(id);
    this.updatePartVisibility(id, false);
  }

  public getVisibleViewContainer(): ViewContainer | null {
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

  private updatePartVisibility(id: string, visible: boolean): void {
    switch (id) {
      case WorkbenchViewContainers.files:
      case WorkbenchViewContainers.thumbnail:
      case WorkbenchViewContainers.settingsNavigation:
        this.layoutService.setPartHidden(!visible, Parts.SIDEBAR_PART);
        break;
      case WorkbenchViewContainers.template:
      case WorkbenchViewContainers.search:
      case WorkbenchViewContainers.export:
      case WorkbenchViewContainers.parameters:
      case WorkbenchViewContainers.originSettings:
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
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.files), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.table), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.template), true);
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

      layoutService.navigateToView("settings");
      await Promise.resolve();

      assert.equal(layoutService.isVisible(Parts.AUXILIARYBAR_PART), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.settingsNavigation), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.settings), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.files), false);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.thumbnail), false);
      assert.deepEqual(
        viewsService.closeCalls.filter(id => AuxiliaryBarViewContainers.includes(id as typeof AuxiliaryBarViewContainers[number])),
        [],
      );

      viewsService.clearCalls();

      layoutService.navigateToView("table");
      await Promise.resolve();

      assert.equal(layoutService.isVisible(Parts.AUXILIARYBAR_PART), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.files), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.table), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.thumbnail), false);
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

      layoutService.navigateToView("chart");
      await Promise.resolve();

      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.files), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.chart), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.thumbnail), false);

      viewsService.clearCalls();
      explorerService.setViewLayout("thumbnail");
      await Promise.resolve();

      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.thumbnail), true);
      assert.equal(viewsService.openCalls.includes(WorkbenchViewContainers.chart), true);
      assert.equal(
        (viewsService.getActiveViewPaneContainerWithId(WorkbenchViewContainers.thumbnail) as TestViewPaneContainer | null)?.title,
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

  test("visible explorer range does not prefetch tree thumbnails", () => {
    const visibleTargetsEmitter = new Emitter<{
      readonly nearbyTargets: readonly { readonly resource: URI }[];
      readonly visibleTargets: readonly { readonly resource: URI }[];
    }>();
    const plotPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
    const thumbnailPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
    const tableModelPriorities: string[] = [];
    const bridge = new WorkbenchDomainBridge({
      tableModelQueueService: {
        enqueueRawTables: () => undefined,
        getQueueSnapshot: () => ({ rawTables: [] }),
        onDidChangeTableModelQueueState: Event.None as Event<void>,
        prioritizeRawTables: (_rawTableRefs: unknown, priority: string) => {
          tableModelPriorities.push(priority);
        },
      },
      calculationService: {
        prioritizeCalculationFile: () => undefined,
        prioritizeCalculationFiles: () => undefined,
      },
      chartService: {
        onDidChangeChartState: Event.None,
        updateViewInput: () => undefined,
      },
      explorerService: {
        files: [],
        getPaneInput: () => null,
        hasPendingSourceFiles: false,
        hoveredResource: null,
        onDidChangeFiles: Event.None,
        onDidChangeHoveredResource: Event.None,
        onDidChangePendingSourceFiles: Event.None,
        onDidChangeSelection: Event.None,
        onDidChangeVisibleTargets: visibleTargetsEmitter.event,
        selectedResource: null,
        selectedSheetId: null,
        updatePaneInput: () => undefined,
        viewLayout: "tree",
      },
      layoutService: {
        activeWorkbenchMainPart: "table",
        onDidChangeWorkbenchNavigation: Event.None,
      },
      plotService: {
        getState: () => ({ activePlotType: "iv" }),
        onDidChangePlotState: Event.None,
        prefetchCalculatedData: (fileIds: readonly string[], priority: string) => {
          plotPrefetches.push({ fileIds, priority });
        },
      },
      sessionService: {
        getSnapshot: () => createEmptySessionModel(),
        onDidChangeSession: Event.None,
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

      assert.deepEqual(tableModelPriorities, ["visible", "nearby"]);
      assert.deepEqual(plotPrefetches, []);
      assert.deepEqual(thumbnailPrefetches, []);
    } finally {
      bridge.dispose();
      visibleTargetsEmitter.dispose();
    }
  });

  test("sync prefetches the active chart file at active plot priority", () => {
    const calculationPriorities: string[] = [];
    const plotPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
    const plotDisplayPrefetches: Array<{ fileId?: string | null; plotType?: string; priority: string; sessionVersion?: number }> = [];
    const chartActiveFileIds: Array<string | null | undefined> = [];
    const bridge = new WorkbenchDomainBridge({
      tableModelQueueService: {
        enqueueRawTables: () => undefined,
        getQueueSnapshot: () => ({ rawTables: [] }),
        onDidChangeTableModelQueueState: Event.None as Event<void>,
        prioritizeRawTables: () => undefined,
      },
      calculationService: {
        prioritizeCalculationFile: (fileId: string | null | undefined) => {
          if (fileId) {
            calculationPriorities.push(fileId);
          }
        },
        prioritizeCalculationFiles: (fileIds: readonly (string | null | undefined)[]) => {
          calculationPriorities.push(
            ...fileIds
              .map(fileId => String(fileId ?? "").trim())
              .filter(Boolean),
          );
        },
      },
      chartService: {
        onDidChangeChartState: Event.None,
        updateViewInput: (input: { readonly activeFileId?: string | null }) => {
          chartActiveFileIds.push(input.activeFileId);
        },
      },
      explorerService: {
        files: [],
        getPaneInput: () => null,
        hasPendingSourceFiles: false,
        hoveredResource: null,
        onDidChangeFiles: Event.None,
        onDidChangeHoveredResource: Event.None,
        onDidChangePendingSourceFiles: Event.None,
        onDidChangeSelection: Event.None,
        onDidChangeVisibleTargets: Event.None,
        select: () => undefined,
        selectedResource: null,
        selectedSheetId: null,
        updatePaneInput: () => undefined,
        viewLayout: "tree",
      },
      layoutService: {
        activeWorkbenchMainPart: "chart",
        onDidChangeWorkbenchNavigation: Event.None,
      },
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
          input: { readonly fileId?: string | null; readonly plotType?: string; readonly snapshot?: { readonly sessionVersion?: number } },
          priority: string,
        ) => {
          plotDisplayPrefetches.push({
            fileId: input.fileId,
            plotType: input.plotType,
            priority,
            sessionVersion: input.snapshot?.sessionVersion,
          });
        },
      },
      sessionService: {
        getSnapshot: () => createProcessedSnapshot("file-a"),
        onDidChangeSession: Event.None,
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

      assert.deepEqual(chartActiveFileIds, ["file-a"]);
      assert.deepEqual(calculationPriorities, ["file-a"]);
      assert.deepEqual(plotPrefetches, []);
      assert.deepEqual(plotDisplayPrefetches, [
        {
          fileId: "file-a",
          plotType: "iv",
          priority: "active",
          sessionVersion: 1,
        },
      ]);
    } finally {
      bridge.dispose();
    }
  });

});

const createProcessedSnapshot = (fileId: string): SessionSnapshot => ({
  fileOrder: [fileId],
  filesById: {
    [fileId]: createProcessedFileRecord(fileId),
  },
  schemaVersion: 1,
  sessionVersion: 1,
});

const createProcessedFileRecord = (fileId: string): FileRecord => {
  const curveKey = `base:iv:transfer:${fileId}-series` as BaseCurveKey;
  const seriesId = `${fileId}-series`;
  return {
    curvesByKey: {
      [curveKey]: {
        curveFamily: "iv",
        curveGeneration: "base",
        fileId,
        ivMode: "transfer",
        lineage: {
          baseFamily: "iv",
          baseSeries: { fileId, seriesId },
          curveGeneration: "base",
          ivMode: "transfer",
        },
        points: [
          { x: 0, y: 0.001 },
          { x: 1, y: 0.002 },
        ],
        seriesId,
        signature: `${fileId}:curve`,
      },
    },
    id: fileId,
    kind: "unknown",
    metricsByKey: {},
    name: `${fileId}.csv`,
    raw: {
      fileId,
      fileName: `${fileId}.csv`,
      tableOrder: [],
      tablesById: {},
    },
    rawTableVersionsById: {},
    seriesById: {
      [seriesId]: {
        fileId,
        groupIndex: 0,
        id: seriesId,
        name: "A",
        y: [0.001, 0.002],
      },
    },
    seriesOrder: [seriesId],
  };
};

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
  const sessionService = {
    getSnapshot: () => createEmptySessionModel(),
    onDidChangeSession: Event.None,
  } as unknown as WorkbenchService<"sessionService">;
  const notificationService = {
    get toasts() { return []; },
    onDidChangeToast: Event.None,
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
      prioritizeCalculationFile: () => undefined,
      prioritizeCalculationFiles: () => undefined,
    },
    chartService: {
      onDidChangeChartState: Event.None,
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
      hasPendingSourceFiles: false,
      hoveredResource: null,
      onDidChangeFiles: Event.None,
      onDidChangeHoveredResource: Event.None,
      onDidChangeVisibleTargets: Event.None,
      onDidChangePendingSourceFiles: Event.None,
      onDidChangeSelection: Event.None,
      onDidChangeViewLayout: Event.None,
      selectedResource: null,
      selectedSheetId: null,
      select: () => undefined,
      setPendingSourceFiles: () => undefined,
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
    sessionService,
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
