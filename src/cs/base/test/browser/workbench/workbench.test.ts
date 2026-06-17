import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type { IAction } from "src/cs/base/common/actions";
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
import { TableViewId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewId } from "src/cs/workbench/services/chart/common/chart";
import { ExplorerViewId } from "src/cs/workbench/contrib/files/browser/files";
import { SettingsViewId } from "src/cs/workbench/services/settings/common/settings";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
  createEmptySessionModel,
  type BaseCurveKey,
  type FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import { createEmptyTemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type WorkbenchService<K extends keyof WorkbenchOptions> = NonNullable<WorkbenchOptions[K]>;

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
        this.layoutService.setPartHidden(!visible, Parts.SIDEBAR_PART);
        break;
      case WorkbenchViewContainers.auxiliarybar:
        this.layoutService.setPartHidden(!visible, Parts.AUXILIARYBAR_PART);
        break;
      default:
        break;
    }
  }
}

suite("workbench/browser/workbench layout integration", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
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
      assert.deepEqual(
        viewsService.closeCalls.filter(id => id === WorkbenchViewContainers.auxiliarybar),
        [],
      );

      viewsService.clearCalls();

      layoutService.navigateToView("table");
      await Promise.resolve();

      assert.equal(layoutService.isVisible(Parts.AUXILIARYBAR_PART), true);
      assert.deepEqual(
        viewsService.closeCalls.filter(id => id === WorkbenchViewContainers.auxiliarybar),
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

  test("visible explorer range prefetches plot data and thumbnail previews", () => {
    const visibleFileIdsEmitter = new Emitter<{
      readonly nearbyFileIds: readonly string[];
      readonly visibleFileIds: readonly string[];
    }>();
    const plotPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
    const thumbnailPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
    const assessmentPriorities: string[] = [];
    const bridge = new WorkbenchDomainBridge({
      assessmentQueueService: {
        enqueueRawTables: () => undefined,
        prioritizeRawTables: (_rawTableRefs: unknown, priority: string) => {
          assessmentPriorities.push(priority);
        },
      },
      chartService: {
        onDidChangeChartState: Event.None,
        updateViewInput: () => undefined,
      },
      explorerService: {
        hasPendingSourceFiles: false,
        onDidChangePendingSourceFiles: Event.None,
        onDidChangeSelection: Event.None,
        onDidChangeVisibleFileIds: visibleFileIdsEmitter.event,
        selectedProcessedFileId: null,
        selectedRawFileId: null,
        updatePaneInput: () => undefined,
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
      tableService: {
        open: () => undefined,
      },
      templateApplyWorkflowService: {
        getFileApplyStates: () => new Map(),
        onDidChangeFileStates: Event.None,
        onDidChangeProcessingStatus: Event.None,
        processingStatus: "idle",
        update: () => undefined,
      },
      templateService: {
        getState: () => ({
          formState: createEmptyTemplateConfig(),
          mode: "management",
          selectedTemplateId: null,
          selectionsByFileId: {},
          templateListVersion: 0,
        }),
        onDidChangeTemplateState: Event.None,
        updateViewInput: () => undefined,
      },
      thumbnailPreviewService: {
        onDidChangePreview: Event.None,
        prefetch: (fileIds: readonly string[], priority: string) => {
          thumbnailPrefetches.push({ fileIds, priority });
        },
      },
    } as unknown as WorkbenchDomainBridgeOptions);

    try {
      visibleFileIdsEmitter.fire({
        nearbyFileIds: ["file-b"],
        visibleFileIds: ["file-a"],
      });

      assert.deepEqual(assessmentPriorities, ["visible", "nearby"]);
      assert.deepEqual(plotPrefetches, [
        { fileIds: ["file-a"], priority: "visible" },
        { fileIds: ["file-b"], priority: "nearby" },
      ]);
      assert.deepEqual(thumbnailPrefetches, [
        { fileIds: ["file-a"], priority: "visible" },
        { fileIds: ["file-b"], priority: "nearby" },
      ]);
    } finally {
      bridge.dispose();
      visibleFileIdsEmitter.dispose();
    }
  });

  test("sync prefetches the active chart file at active plot priority", () => {
    const plotPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
    const plotDisplayPrefetches: Array<{ fileId?: string | null; plotType?: string; priority: string; sessionVersion?: number }> = [];
    const chartActiveFileIds: Array<string | null | undefined> = [];
    const bridge = new WorkbenchDomainBridge({
      assessmentQueueService: {
        enqueueRawTables: () => undefined,
        prioritizeRawTables: () => undefined,
      },
      chartService: {
        onDidChangeChartState: Event.None,
        updateViewInput: (input: { readonly activeFileId?: string | null }) => {
          chartActiveFileIds.push(input.activeFileId);
        },
      },
      explorerService: {
        hasPendingSourceFiles: false,
        onDidChangePendingSourceFiles: Event.None,
        onDidChangeSelection: Event.None,
        onDidChangeVisibleFileIds: Event.None,
        select: () => undefined,
        selectedProcessedFileId: null,
        selectedRawFileId: null,
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
      tableService: {
        open: () => undefined,
      },
      templateApplyWorkflowService: {
        getFileApplyStates: () => new Map(),
        onDidChangeFileStates: Event.None,
        onDidChangeProcessingStatus: Event.None,
        processingStatus: "idle",
        update: () => undefined,
      },
      templateService: {
        getState: () => ({
          formState: createEmptyTemplateConfig(),
          mode: "management",
          selectedTemplateId: null,
          selectionsByFileId: {},
          templateListVersion: 0,
        }),
        onDidChangeTemplateState: Event.None,
        updateViewInput: () => undefined,
      },
      thumbnailPreviewService: {
        onDidChangePreview: Event.None,
        prefetch: () => undefined,
      },
    } as unknown as WorkbenchDomainBridgeOptions);

    try {
      bridge.sync();

      assert.deepEqual(chartActiveFileIds, ["file-a"]);
      assert.deepEqual(plotPrefetches, [
        { fileIds: ["file-a"], priority: "active" },
      ]);
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
    assessmentsByRawTableId: {},
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
    measurementBlockOrder: [],
    measurementBlocksById: {},
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
  layoutService,
  storage,
  viewsService,
}: {
  readonly contextKeyService: ContextKeyService;
  readonly layoutService: BrowserWorkbenchLayoutService;
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
  const tableModel = {
    getState: () => ({}),
    onDidChangeState: () => () => undefined,
  };

  return {
    assessmentQueueService: {
      enqueueRawTables: () => undefined,
      prioritizeRawTables: () => undefined,
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
    explorerService: {
      hasPendingSourceFiles: false,
      onDidChangeVisibleFileIds: Event.None,
      onDidChangePendingSourceFiles: Event.None,
      onDidChangeSelection: Event.None,
      selectedProcessedFileId: null,
      selectedRawFileId: null,
      select: () => undefined,
      setPendingSourceFiles: () => undefined,
      updatePaneInput: () => undefined,
    } as unknown as WorkbenchService<"explorerService">,
    exportService: {
      onDidChangeExportState: Event.None,
      updateViewState: () => undefined,
    } as unknown as WorkbenchService<"exportService">,
    filesService: {} as WorkbenchService<"filesService">,
    layoutService,
    notificationService,
    parametersService: {
      onDidChangeParametersViewState: Event.None,
      updateViewState: () => undefined,
    } as unknown as WorkbenchService<"parametersService">,
    pathService: {} as WorkbenchService<"pathService">,
    plotService: {
      onDidChangePlotState: Event.None,
      getCachedCalculatedData: () => null,
      getCalculatedData: () => null,
      getPlotMainRenderModel: () => null,
      getState: () => ({ activePlotType: "iv" }),
      onDidChangeCalculatedDataCache: Event.None,
      prefetchCalculatedData: () => undefined,
    } as unknown as WorkbenchService<"plotService">,
    searchService: {
      setPlotModel: () => undefined,
    } as unknown as WorkbenchService<"searchService">,
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
    storageService: storage,
    tableService: {
      onDidChangeTableState: Event.None,
      open: () => undefined,
      update: () => tableModel,
      updateViewInput: () => undefined,
    } as unknown as WorkbenchService<"tableService">,
    templateApplyWorkflowService: {
      getFileApplyStates: () => new Map(),
      onDidChangeFileStates: Event.None,
      onDidChangeProcessingStatus: Event.None,
      processingStatus: "idle",
      update: () => undefined,
    } as unknown as WorkbenchService<"templateApplyWorkflowService">,
    templateService: {
      onDidChangeTemplateState: Event.None,
      getState: () => ({
        formState: createEmptyTemplateConfig(),
        mode: "management",
        selectedTemplateId: null,
        selectionsByFileId: {},
        templateListVersion: 0,
      }),
      updateViewInput: () => undefined,
    } as unknown as WorkbenchService<"templateService">,
    thumbnailPreviewService: {
      get: () => ({ kind: "idle" }),
      invalidate: () => undefined,
      onDidChangePreview: Event.None,
      prefetch: () => undefined,
      request: () => ({ kind: "idle" }),
    },
    titleService: {
      attachTitlebarPart: () => Disposable.None,
      layout: () => undefined,
      updateTitlebarState: () => undefined,
    } as unknown as WorkbenchService<"titleService">,
    viewsService,
  };
};
