import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type { IAction } from "src/cs/base/common/actions";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import type { IView, IViewDescriptor, IViewPaneContainer, ViewContainer, ViewContainerLocation } from "src/cs/workbench/common/views";
import { Workbench, type WorkbenchOptions } from "src/cs/workbench/browser/workbench";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  BrowserWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { TableViewId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewId } from "src/cs/workbench/services/chart/common/chart";
import { ExplorerViewId } from "src/cs/workbench/contrib/files/browser/files";
import { SettingsViewId } from "src/cs/workbench/services/settings/common/settings";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { createEmptyTemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { NotificationService } from "src/cs/workbench/services/notification/common/notificationService";
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
});

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
  const sessionService = new SessionService();
  const notificationService = new NotificationService();
  const tableModel = {
    getState: () => ({}),
    onDidChangeState: () => () => undefined,
  };

  return {
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
      getCalculatedData: () => null,
      getPlotMainRenderModel: () => null,
      getState: () => ({ activePlotType: "iv" }),
    } as unknown as WorkbenchService<"plotService">,
    searchService: {
      setPlotModel: () => undefined,
    } as unknown as WorkbenchService<"searchService">,
    sessionService,
    settingsService: {
      onDidChangeConductorSettings: Event.None,
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
      update: () => tableModel,
      updateViewInput: () => undefined,
    } as unknown as WorkbenchService<"tableService">,
    templateApplyWorkflowService: {
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
    titleService: {
      attachTitlebarPart: () => Disposable.None,
      layout: () => undefined,
      updateTitlebarState: () => undefined,
    } as unknown as WorkbenchService<"titleService">,
    viewsService,
  };
};
