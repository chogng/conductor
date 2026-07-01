/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//#region imports

import {
  runWhenWindowIdle,
  scheduleAtNextAnimationFrame,
} from "src/cs/base/browser/dom";
import { Lazy } from "src/cs/base/common/lazy";
import {
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import {
  isLanguagePreference,
  type LanguagePreference,
} from "src/cs/base/common/platform";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { INativeHostService } from "src/cs/platform/native/common/native";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { IMenuService } from "src/cs/platform/actions/common/actions";
import { IStorageService } from "src/cs/platform/storage/common/storage";
import {
  IContextKeyService,
  type IContextKey,
} from "src/cs/platform/contextkey/common/contextkey";
import type {
  IInstantiationService,
  ServicesAccessor,
} from "src/cs/platform/instantiation/common/instantiation";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import {
  ChartViewId,
  IChartService,
} from "src/cs/workbench/services/chart/common/chart";
import { ICalculationService } from "src/cs/workbench/services/calculation/common/calculation";
import {
  ExplorerViewId,
  IExplorerService,
  type ExplorerViewLayout,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  IParametersService,
} from "src/cs/workbench/services/parameters/common/parameters";
import { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import { IThumbnailPreviewService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  ISettingsService,
  SettingsNavigationViewId,
  SettingsViewId,
  type SettingsServiceOptions,
} from "src/cs/workbench/services/settings/common/settings";
import { ThumbnailViewId } from "src/cs/workbench/contrib/thumbnail/common/thumbnail";
import {
  IWorkbenchLayoutService,
  Parts,
  type WorkbenchMainPart,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { localize } from "src/cs/nls";
import { isThemeMode } from "src/cs/workbench/common/theme";
import { startPerf } from "src/cs/workbench/common/perf";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  ActiveAuxiliaryBarViewContext,
  ActiveWorkbenchMainPartContext,
  ActiveWorkbenchViewContext,
  WorkbenchContextKeysHandler,
} from "src/cs/workbench/browser/contextkeys";
import { Layout } from "src/cs/workbench/browser/layout";
import {
  ITitleService,
  type WorkbenchTitlebarState,
} from "src/cs/workbench/services/title/browser/titleService";
import { getWorkbenchWindowState } from "src/cs/workbench/browser/parts/titlebar/windowTitle";
import {
  AuxiliaryBarViews,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions";
import type { WorkbenchStyle } from "src/cs/workbench/browser/style";
import {
  WorkbenchWindow,
} from "src/cs/workbench/browser/window";
import {
  WorkbenchDomainBridge,
  resolveExplorerDomainSelection,
} from "src/cs/workbench/browser/workbenchDomainBridge";
import { ITableService } from "src/cs/workbench/services/table/common/table";
import { TableViewId } from "src/cs/workbench/contrib/table/common/table";
import {
  ISessionService,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type {
  SessionChangeEvent,
} from "src/cs/workbench/services/session/common/sessionEvents";
import {
  ITemplateViewStateService,
  type ITemplateViewStateService as ITemplateViewStateServiceType,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import {
  ISliceService,
  type ISliceService as ISliceServiceType,
} from "src/cs/workbench/services/slice/common/slice";
import {
  IExportService,
  type ExportState,
} from "src/cs/workbench/services/export/common/export";
import {
  INotificationService,
  NotificationService,
} from "src/cs/workbench/services/notification/common/notificationService";
import { NotificationToasts } from "src/cs/workbench/browser/parts/notifications/notificationsToasts";
import { registerNotificationCommands } from "src/cs/workbench/browser/parts/notifications/notificationsCommands";

//#endregion

//#region types and startup helpers

type WorkbenchFullRefreshReason =
  | "explorerViewLayout"
  | "initial"
  | "resetLayout"
  | "sameViewMode"
  | "navigation"
  | "activeAuxiliaryBarView";

type WorkbenchAuxiliaryRefreshReason =
  | "chartState"
  | "explorerSelection"
  | "settings"
  | "plotState"
  | "plotDisplayModelCache"
  | "exportState"
  | "templateState"
  | `session:${string}`;

export type WorkbenchSidebarSurface =
  | "explorer"
  | "thumbnail"
  | "settingsNavigation";

export const resolveWorkbenchSidebarSurface = ({
  activeMainPart,
  explorerViewLayout,
}: {
  readonly activeMainPart: WorkbenchMainPart;
  readonly explorerViewLayout: ExplorerViewLayout;
}): WorkbenchSidebarSurface => {
  if (activeMainPart === "settings") {
    return "settingsNavigation";
  }
  if (activeMainPart === "chart" && explorerViewLayout === "thumbnail") {
    return "thumbnail";
  }
  return "explorer";
};

export type WorkbenchOptions = {
  readonly className?: string;
  readonly calculationService?: ICalculationService;
  readonly chartService?: IChartService;
  readonly commandService?: ICommandService;
  readonly contextKeyService?: IContextKeyService;
  readonly dialogsService?: IFileDialogService;
  readonly explorerService?: IExplorerService;
  readonly exportService?: IExportService;
  readonly filesService?: IFileService;
  readonly pathService?: IPathService;
  readonly sessionService?: ISessionServiceType;
  readonly storageService?: IStorageService;
  readonly layoutService?: IWorkbenchLayoutService;
  readonly menuService?: IMenuService;
  readonly nativeHostService?: INativeHostService;
  readonly notificationService?: NotificationService;
  readonly onDidRenderInitialWorkbench?: () => void;
  readonly parametersService?: IParametersService;
  readonly plotService?: IPlotService;
  readonly settingsService?: ISettingsService;
  readonly sliceService?: ISliceService;
  readonly viewsService?: IViewsService;
  readonly id?: string;
  readonly instantiationService?: IInstantiationService;
  readonly showDesktopCommandBar?: boolean;
  readonly style?: WorkbenchStyle;
  readonly templateViewStateService?: ITemplateViewStateService;
  readonly thumbnailPreviewService?: IThumbnailPreviewService;
  readonly tableService?: ITableService;
  readonly titleService?: ITitleService;
  readonly titlebarState?: WorkbenchTitlebarState;
};

type WorkbenchShellServices = {
  readonly layoutService?: IWorkbenchLayoutService;
  readonly storageService?: IStorageService;
  readonly titleService?: ITitleService;
};

type WorkbenchServices = {
  readonly calculationService: ICalculationService;
  readonly chartService: IChartService;
  readonly commandService: ICommandService;
  readonly contextKeyService: IContextKeyService;
  readonly explorerService: IExplorerService;
  readonly exportService: IExportService;
  readonly layoutService: IWorkbenchLayoutService;
  readonly menuService: IMenuService;
  readonly notificationService: NotificationService;
  readonly parametersService: IParametersService;
  readonly plotService: IPlotService;
  readonly sessionService: ISessionServiceType;
  readonly settingsService: ISettingsService;
  readonly sliceService: ISliceServiceType;
  readonly tableService: ITableService;
  readonly templateViewStateService: ITemplateViewStateServiceType;
  readonly thumbnailPreviewService: IThumbnailPreviewService;
  readonly titleService: ITitleService;
  readonly viewsService: IViewsService;
};

const hasExplicitWorkbenchServices = (options: WorkbenchOptions): boolean =>
  Boolean(
    options.calculationService &&
    options.chartService &&
    options.commandService &&
    options.contextKeyService &&
    options.explorerService &&
    options.exportService &&
    options.layoutService &&
    options.menuService &&
    options.notificationService &&
    options.parametersService &&
    options.plotService &&
    options.sessionService &&
    options.settingsService &&
    options.sliceService &&
    options.tableService &&
    options.templateViewStateService &&
    options.thumbnailPreviewService &&
    options.titleService &&
    options.viewsService,
  );

const shouldDeferWorkbenchServices = (options: WorkbenchOptions): boolean =>
  Boolean(options.instantiationService && !hasExplicitWorkbenchServices(options));

const requireWorkbenchService = <T>(serviceName: string, service: T | undefined): T => {
  if (!service) {
    throw new Error(`Workbench requires ${serviceName}.`);
  }

  return service;
};

const getBootNowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const logWorkbenchBoot = (stage: string, extra = ""): void => {
  if (!isWorkbenchBootLoggingEnabled()) {
    return;
  }

  window.__CONDUCTOR_BOOT_LOG__?.(stage, extra);
};

const isWorkbenchBootLoggingEnabled = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.__CONDUCTOR_BOOT_LOG__ === "function";

const getBootErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const measureWorkbenchBoot = <T>(stage: string, run: () => T): T => {
  if (!isWorkbenchBootLoggingEnabled()) {
    return run();
  }

  const startedAt = getBootNowMs();
  logWorkbenchBoot(`${stage}:start`);
  try {
    const result = run();
    logWorkbenchBoot(
      `${stage}:done`,
      `(duration=${Math.round(getBootNowMs() - startedAt)}ms)`,
    );
    return result;
  } catch (error) {
    logWorkbenchBoot(
      `${stage}:failed`,
      `(duration=${Math.round(getBootNowMs() - startedAt)}ms message=${getBootErrorMessage(error)})`,
    );
    throw error;
  }
};

const resolveWorkbenchDependency = <T>(
  serviceName: string,
  service: T | undefined,
  resolve: () => T,
): T => {
  if (!isWorkbenchBootLoggingEnabled()) {
    return service ?? resolve();
  }

  if (service) {
    logWorkbenchBoot(`workbench:service:get:${serviceName}`, "(source=options duration=0ms)");
    return service;
  }

  const startedAt = getBootNowMs();
  try {
    const resolved = resolve();
    logWorkbenchBoot(
      `workbench:service:get:${serviceName}`,
      `(duration=${Math.round(getBootNowMs() - startedAt)}ms)`,
    );
    return resolved;
  } catch (error) {
    logWorkbenchBoot(
      `workbench:service:get:${serviceName}:failed`,
      `(duration=${Math.round(getBootNowMs() - startedAt)}ms message=${getBootErrorMessage(error)})`,
    );
    throw error;
  }
};

const resolveWorkbenchShellServices = (options: WorkbenchOptions): WorkbenchShellServices => {
  if (
    !options.instantiationService ||
    (options.layoutService && options.storageService && options.titleService)
  ) {
    return {
      layoutService: options.layoutService,
      storageService: options.storageService,
      titleService: options.titleService,
    };
  }

  return options.instantiationService.invokeFunction(accessor => ({
    layoutService: options.layoutService ?? accessor.get(IWorkbenchLayoutService),
    storageService: options.storageService ?? accessor.get(IStorageService),
    titleService: options.titleService ?? accessor.get(ITitleService),
  }));
};

const resolveWorkbenchServices = (
  options: WorkbenchOptions,
  shellServices: WorkbenchShellServices,
): WorkbenchServices => {
  if (options.instantiationService) {
    return options.instantiationService.invokeFunction(accessor =>
      createWorkbenchServicesFromAccessor(options, shellServices, accessor),
    );
  }

  return {
    calculationService: requireWorkbenchService("ICalculationService", options.calculationService),
    chartService: requireWorkbenchService("IChartService", options.chartService),
    commandService: requireWorkbenchService("ICommandService", options.commandService),
    contextKeyService: requireWorkbenchService("IContextKeyService", options.contextKeyService),
    explorerService: requireWorkbenchService("IExplorerService", options.explorerService),
    exportService: requireWorkbenchService("IExportService", options.exportService),
    layoutService: requireWorkbenchService("IWorkbenchLayoutService", options.layoutService ?? shellServices.layoutService),
    menuService: requireWorkbenchService("IMenuService", options.menuService),
    notificationService: requireWorkbenchService("INotificationService", options.notificationService),
    parametersService: requireWorkbenchService("IParametersService", options.parametersService),
    plotService: requireWorkbenchService("IPlotService", options.plotService),
    sessionService: requireWorkbenchService("ISessionService", options.sessionService),
    settingsService: requireWorkbenchService("ISettingsService", options.settingsService),
    sliceService: requireWorkbenchService("ISliceService", options.sliceService),
    tableService: requireWorkbenchService("ITableService", options.tableService),
    templateViewStateService: requireWorkbenchService(
      "ITemplateViewStateService",
      options.templateViewStateService,
    ),
    thumbnailPreviewService: requireWorkbenchService("IThumbnailPreviewService", options.thumbnailPreviewService),
    titleService: requireWorkbenchService("ITitleService", options.titleService ?? shellServices.titleService),
    viewsService: requireWorkbenchService("IViewsService", options.viewsService),
  };
};

const createWorkbenchServicesFromAccessor = (
  options: WorkbenchOptions,
  shellServices: WorkbenchShellServices,
  accessor: ServicesAccessor,
): WorkbenchServices => ({
  calculationService: resolveWorkbenchDependency(
    "ICalculationService",
    options.calculationService,
    () => accessor.get(ICalculationService),
  ),
  chartService: resolveWorkbenchDependency(
    "IChartService",
    options.chartService,
    () => accessor.get(IChartService),
  ),
  commandService: resolveWorkbenchDependency(
    "ICommandService",
    options.commandService,
    () => accessor.get(ICommandService),
  ),
  contextKeyService: resolveWorkbenchDependency(
    "IContextKeyService",
    options.contextKeyService,
    () => accessor.get(IContextKeyService),
  ),
  explorerService: resolveWorkbenchDependency(
    "IExplorerService",
    options.explorerService,
    () => accessor.get(IExplorerService),
  ),
  exportService: resolveWorkbenchDependency(
    "IExportService",
    options.exportService,
    () => accessor.get(IExportService),
  ),
  layoutService: resolveWorkbenchDependency(
    "IWorkbenchLayoutService",
    options.layoutService ?? shellServices.layoutService,
    () => accessor.get(IWorkbenchLayoutService),
  ),
  menuService: resolveWorkbenchDependency(
    "IMenuService",
    options.menuService,
    () => accessor.get(IMenuService),
  ),
  notificationService: resolveWorkbenchDependency(
    "INotificationService",
    options.notificationService,
    () => accessor.get(INotificationService) as NotificationService,
  ),
  parametersService: resolveWorkbenchDependency(
    "IParametersService",
    options.parametersService,
    () => accessor.get(IParametersService),
  ),
  plotService: resolveWorkbenchDependency(
    "IPlotService",
    options.plotService,
    () => accessor.get(IPlotService),
  ),
  sessionService: resolveWorkbenchDependency(
    "ISessionService",
    options.sessionService,
    () => accessor.get(ISessionService),
  ),
  settingsService: resolveWorkbenchDependency(
    "ISettingsService",
    options.settingsService,
    () => accessor.get(ISettingsService),
  ),
  sliceService: resolveWorkbenchDependency(
    "ISliceService",
    options.sliceService,
    () => accessor.get(ISliceService),
  ),
  tableService: resolveWorkbenchDependency(
    "ITableService",
    options.tableService,
    () => accessor.get(ITableService),
  ),
  templateViewStateService: resolveWorkbenchDependency(
    "ITemplateViewStateService",
    options.templateViewStateService,
    () => accessor.get(ITemplateViewStateService),
  ),
  thumbnailPreviewService: resolveWorkbenchDependency(
    "IThumbnailPreviewService",
    options.thumbnailPreviewService,
    () => accessor.get(IThumbnailPreviewService),
  ),
  titleService: resolveWorkbenchDependency(
    "ITitleService",
    options.titleService ?? shellServices.titleService,
    () => accessor.get(ITitleService),
  ),
  viewsService: resolveWorkbenchDependency(
    "IViewsService",
    options.viewsService,
    () => accessor.get(IViewsService),
  ),
});

const getInitialLanguagePreference = (): LanguagePreference => {
  const settings = window.__CONDUCTOR_INITIAL_SETTINGS__;
  return settings &&
    typeof settings === "object" &&
    isLanguagePreference(settings.language)
    ? settings.language
    : "system";
};

export const resolveInitialWorkbenchViewMode = (): WorkbenchMainPart => "table";

//#endregion

export class Workbench extends Layout {
  //#region state and dependencies

  private readonly window: WorkbenchWindow;
  private readonly notifications: NotificationToasts;
  private readonly services: Lazy<WorkbenchServices>;
  private readonly shellServices: WorkbenchShellServices;
  private languagePreference: LanguagePreference = getInitialLanguagePreference();
  private serviceStartupState: "pending" | "starting" | "started" | "failed" = "pending";
  private disposed = false;
  private session!: ISessionServiceType;
  private commandService!: ICommandService;
  private contextKeyService!: IContextKeyService;
  private activeWorkbenchViewContext: IContextKey<string> | null = null;
  private activeWorkbenchMainPartContext: IContextKey<WorkbenchMainPart | ""> | null = null;
  private activeAuxiliaryBarViewContext: IContextKey<string> | null = null;
  private calculationService!: ICalculationService;
  private chartService!: IChartService;
  private explorerService!: IExplorerService;
  private layoutService!: IWorkbenchLayoutService;
  private menuService!: IMenuService;
  private notificationService!: NotificationService;
  private parametersService!: IParametersService;
  private plotService!: IPlotService;
  private settingsService!: ISettingsService;
  private sliceService!: ISliceServiceType;
  private viewsService!: IViewsService;
  private tableService!: ITableService;
  private templateViewStateService!: ITemplateViewStateServiceType;
  private thumbnailPreviewService!: IThumbnailPreviewService;
  private titleService!: ITitleService;
  private exportService!: IExportService;
  private domainBridge: WorkbenchDomainBridge | null = null;
  private cancelScheduledAuxiliarySurfacesRefresh: (() => void) | null = null;
  private readonly scheduledAuxiliarySurfacesRefreshReasons = new Set<WorkbenchAuxiliaryRefreshReason>();
  private scheduledAuxiliarySurfacesRefreshNeedsChrome = false;
  private lastObservedExportState: ExportState | null = null;
  private titlebarState: WorkbenchTitlebarState | undefined;
  private readonly onDidRenderInitialWorkbench: (() => void) | undefined;
  private didRenderInitialWorkbench = false;
  private suppressNavigationRefresh = false;
  //#endregion

  //#region lifecycle and rendering

  public get contentElement(): HTMLElement {
    return this.window.contentElement;
  }

  constructor(parent: HTMLElement, options: WorkbenchOptions = {}) {
    const shellServices = resolveWorkbenchShellServices(options);
    super(undefined, shellServices.layoutService, shellServices.storageService);

    const deferServiceStartup = shouldDeferWorkbenchServices(options);
    this.shellServices = shellServices;
    this.services = new Lazy(() => resolveWorkbenchServices(options, shellServices));
    this.titlebarState = options.titlebarState;
    this.onDidRenderInitialWorkbench = options.onDidRenderInitialWorkbench;
    this.window = this._register(new WorkbenchWindow(parent, {
      ...options,
      titleService: shellServices.titleService ?? options.titleService,
    }));
    this.notifications = this._register(new NotificationToasts());
    this.mount(this.window.contentElement);
    if ("titlebarState" in options) {
      shellServices.titleService?.updateTitlebarState(options.titlebarState);
    }

    if (deferServiceStartup) {
      this.scheduleServiceLayerStartup();
    } else {
      this.startServiceLayer();
    }
  }

  private scheduleServiceLayerStartup(): void {
    logWorkbenchBoot("workbench:service-layer:scheduled");
    this._register(scheduleAtNextAnimationFrame(window, () => {
      if (this.disposed) {
        return;
      }

      this._register(runWhenWindowIdle(window, () => {
        this.startServiceLayer();
      }, 500));
    }));
  }

  private startServiceLayer(): void {
    if (
      this.disposed ||
      this.serviceStartupState === "starting" ||
      this.serviceStartupState === "started"
    ) {
      return;
    }

    this.serviceStartupState = "starting";
    const startedAt = getBootNowMs();
    logWorkbenchBoot("workbench:service-layer:start");
    try {
      const services = this.resolveServiceLayerServices();
      this.installServiceLayer(services);
      this.serviceStartupState = "started";
      logWorkbenchBoot(
        "workbench:service-layer:ready",
        `(duration=${Math.round(getBootNowMs() - startedAt)}ms)`,
      );
    } catch (error) {
      this.serviceStartupState = "failed";
      logWorkbenchBoot(
        "workbench:service-layer:failed",
        `(duration=${Math.round(getBootNowMs() - startedAt)}ms message=${
          getBootErrorMessage(error)
        })`,
      );
      throw error;
    }
  }

  private resolveServiceLayerServices(): WorkbenchServices {
    return measureWorkbenchBoot(
      "workbench:service-layer:resolve",
      () => this.services.value,
    );
  }

  private installServiceLayer(services: WorkbenchServices): void {
    measureWorkbenchBoot("workbench:service-layer:install", () => {
      measureWorkbenchBoot("workbench:service-layer:install:assign", () => {
        this.calculationService = services.calculationService;
        this.chartService = services.chartService;
        this.commandService = services.commandService;
        this.contextKeyService = services.contextKeyService;
        this.explorerService = services.explorerService;
        this.exportService = services.exportService;
        this.layoutService = services.layoutService;
        this.menuService = services.menuService;
        this.notificationService = services.notificationService;
        this.parametersService = services.parametersService;
        this.plotService = services.plotService;
        this.settingsService = services.settingsService;
        this.sliceService = services.sliceService;
        this.session = services.sessionService;
        this.viewsService = services.viewsService;
        this.tableService = services.tableService;
        this.templateViewStateService = services.templateViewStateService;
        this.thumbnailPreviewService = services.thumbnailPreviewService;
        this.titleService = services.titleService;
      });

      measureWorkbenchBoot("workbench:service-layer:install:contextkeys", () => {
        this._register(new WorkbenchContextKeysHandler(this.contextKeyService, this.layoutService));
        this.activeWorkbenchViewContext = ActiveWorkbenchViewContext.bindTo(this.contextKeyService);
        this.activeWorkbenchMainPartContext = ActiveWorkbenchMainPartContext.bindTo(this.contextKeyService);
        this.activeAuxiliaryBarViewContext = ActiveAuxiliaryBarViewContext.bindTo(this.contextKeyService);
      });

      const initialViewMode = measureWorkbenchBoot("workbench:service-layer:install:initial-state", () => {
        this.lastObservedExportState = this.exportService.getState();
        this.titleService.updateTitlebarState(this.titlebarState);
        const viewMode = resolveInitialWorkbenchViewMode();
        this._register(this.createNotificationsHandlers());
        this.settingsService.update(this.getSettingsServiceOptions());
        return viewMode;
      });

      const domainBridge = measureWorkbenchBoot("workbench:service-layer:install:bridge-create", () =>
        this._register(new WorkbenchDomainBridge({
          calculationService: this.calculationService,
          chartService: this.chartService,
          explorerService: this.explorerService,
          layoutService: this.layoutService,
          plotService: this.plotService,
          settingsService: this.settingsService,
          sliceService: this.sliceService,
          tableService: this.tableService,
          thumbnailPreviewService: this.thumbnailPreviewService,
        })),
      );
      this.domainBridge = domainBridge;

      measureWorkbenchBoot("workbench:service-layer:install:listeners", () => {
        this._register(this.settingsService.onDidChangeConductorSettings(() => {
          this.scheduleWorkbenchAuxiliarySurfacesRefresh("settings", true);
        }));
        this._register(this.explorerService.onDidChangeSelection(() => {
          if (!this.shouldRefreshActiveAuxiliaryViewFromWorkbenchState()) {
            return;
          }
          this.scheduleWorkbenchAuxiliarySurfacesRefresh("explorerSelection", false);
        }));
        this._register(this.explorerService.onDidChangeViewLayout(() => {
          this.refreshWorkbench("explorerViewLayout");
        }));
        this._register(this.chartService.onDidChangeChartState(() => {
          if (!this.shouldRefreshActiveAuxiliaryViewFromWorkbenchState()) {
            return;
          }
          this.scheduleWorkbenchAuxiliarySurfacesRefresh("chartState", false);
        }));
        this._register({
          dispose: () => {
            this.cancelScheduledAuxiliarySurfacesRefresh?.();
            this.cancelScheduledAuxiliarySurfacesRefresh = null;
            this.scheduledAuxiliarySurfacesRefreshReasons.clear();
          },
        });
        this._register(this.plotService.onDidChangePlotState(() => {
          if (!this.shouldRefreshActiveAuxiliaryViewFromWorkbenchState()) {
            return;
          }
          this.scheduleWorkbenchAuxiliarySurfacesRefresh("plotState", true);
        }));
        this._register(this.plotService.onDidChangePlotDisplayModelCache(() => {
          if (!this.shouldRefreshActiveAuxiliaryViewFromWorkbenchState()) {
            return;
          }
          this.scheduleWorkbenchAuxiliarySurfacesRefresh("plotDisplayModelCache", false);
        }));
        this._register(this.exportService.onDidChangeExportState(state => {
          if (this.shouldRefreshAuxiliarySurfacesForExportState(state)) {
            this.scheduleWorkbenchAuxiliarySurfacesRefresh("exportState", true);
          }
          this.lastObservedExportState = state;
        }));
        this._register(this.templateViewStateService.onDidChangeTemplateState(() => {
          this.scheduleWorkbenchAuxiliarySurfacesRefresh("templateState", true);
        }));
        this._register(this.layoutService.onDidChangeWorkbenchNavigation(() => {
          if (!this.suppressNavigationRefresh) {
            this.refreshWorkbench("navigation");
          }
        }));
        this._register(this.layoutService.onDidChangeActiveAuxiliaryBarView(() => {
          this.refreshWorkbench("activeAuxiliaryBarView");
        }));
        this._register(this.session.onDidChangeSession(event => {
          if (this.shouldRefreshAuxiliarySurfacesForSessionChange(event)) {
            this.scheduleWorkbenchAuxiliarySurfacesRefresh(`session:${event.reason}`, true);
          }
        }));
      });

      measureWorkbenchBoot("workbench:service-layer:install:reset-view", () => {
        this.suppressNavigationRefresh = true;
        try {
          this.resetToView(initialViewMode);
        } finally {
          this.suppressNavigationRefresh = false;
        }
      });
      measureWorkbenchBoot("workbench:service-layer:install:domain-sync", () => {
        domainBridge.sync({ deferSecondaryWork: initialViewMode === "table" });
      });
      measureWorkbenchBoot("workbench:service-layer:install:refresh-initial", () => {
        this.refreshWorkbench("initial");
      });
    });
  }

  private getActiveTitleService(): ITitleService | undefined {
    return this.serviceStartupState === "started"
      ? this.titleService
      : this.shellServices.titleService;
  }

  update(options: WorkbenchOptions = {}): void {
    if ("titlebarState" in options) {
      this.titlebarState = options.titlebarState;
      this.getActiveTitleService()?.updateTitlebarState(options.titlebarState);
    }
    this.window.update({
      ...options,
      titleService: options.titleService ?? this.getActiveTitleService(),
    });
  }

  public override resetLayoutState(): void {
    super.resetLayoutState();
    if (this.serviceStartupState !== "started") {
      return;
    }

    this.refreshWorkbench("resetLayout");
  }

  private refreshWorkbench(reason: WorkbenchFullRefreshReason): void {
    this.cancelScheduledAuxiliarySurfacesRefresh?.();
    this.cancelScheduledAuxiliarySurfacesRefresh = null;
    this.scheduledAuxiliarySurfacesRefreshReasons.clear();
    this.scheduledAuxiliarySurfacesRefreshNeedsChrome = false;
    const endPerf = startPerf("workbench.refreshWorkbench", {
      activeAuxiliaryBarView: this.getActiveAuxiliaryBarView(this.activeWorkbenchMainPart),
      activeView: this.activeView,
      mode: this.activeWorkbenchMainPart,
      reason,
    }, { silent: true });
    measureWorkbenchBoot(`workbench:refresh:${reason}:mode-context`, () => {
      this.updateWorkbenchModeContextKeys();
    });
    measureWorkbenchBoot(`workbench:refresh:${reason}:view-containers`, () => {
      this.updateViewContainers();
    });
    measureWorkbenchBoot(`workbench:refresh:${reason}:context`, () => {
      this.updateContextKeys();
    });
    const shouldRefreshActiveAuxiliaryView = this.shouldRefreshActiveAuxiliaryViewFromWorkbenchState();
    if (shouldRefreshActiveAuxiliaryView) {
      measureWorkbenchBoot(`workbench:refresh:${reason}:auxiliary-view`, () => {
        this.renderAuxiliaryBarView();
      });
    }
    measureWorkbenchBoot(`workbench:refresh:${reason}:render`, () => {
      this.renderWorkbench();
    });
    endPerf({
      ...(shouldRefreshActiveAuxiliaryView ? {
        explorerFileCount: this.explorerService.files.length,
      } : {}),
    });
  }

  private scheduleWorkbenchAuxiliarySurfacesRefresh(
    reason: WorkbenchAuxiliaryRefreshReason,
    needsChrome: boolean,
  ): void {
    this.scheduledAuxiliarySurfacesRefreshReasons.add(reason);
    this.scheduledAuxiliarySurfacesRefreshNeedsChrome ||= needsChrome;

    if (this.cancelScheduledAuxiliarySurfacesRefresh) {
      return;
    }

    const run = (): void => {
      const reasons = [...this.scheduledAuxiliarySurfacesRefreshReasons];
      const needsChromeRefresh = this.scheduledAuxiliarySurfacesRefreshNeedsChrome;
      this.cancelScheduledAuxiliarySurfacesRefresh = null;
      this.scheduledAuxiliarySurfacesRefreshReasons.clear();
      this.scheduledAuxiliarySurfacesRefreshNeedsChrome = false;
      this.refreshWorkbenchAuxiliarySurfaces(reasons, needsChromeRefresh);
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      const handle = globalThis.requestAnimationFrame(run);
      this.cancelScheduledAuxiliarySurfacesRefresh = () => {
        globalThis.cancelAnimationFrame(handle);
      };
      return;
    }

    const handle = globalThis.setTimeout(run, 0);
    this.cancelScheduledAuxiliarySurfacesRefresh = () => {
      globalThis.clearTimeout(handle);
    };
  }

  private refreshWorkbenchAuxiliarySurfaces(
    reasons: readonly WorkbenchAuxiliaryRefreshReason[],
    needsChromeRefresh: boolean,
  ): void {
    const isSelectionOnlyRefresh = !needsChromeRefresh &&
      reasons.length === 1 &&
      reasons[0] === "explorerSelection";
    const stage = isSelectionOnlyRefresh
      ? "workbench.refreshSelectionSurfaces"
      : "workbench.refreshAuxiliarySurfaces";
    const endPerf = startPerf(stage, {
      activeAuxiliaryBarView: this.getActiveAuxiliaryBarView(this.activeWorkbenchMainPart),
      activeView: this.activeView,
      mode: this.activeWorkbenchMainPart,
      reason: reasons[0] ?? "unknown",
      reasons: reasons.join(","),
    }, { silent: true });
    if (needsChromeRefresh) {
      const isAuxiliaryBarVisible = this.isAuxiliaryBarVisibleForActiveMode();
      this.updateWorkbenchModeContextKeys();
      this.updateAuxiliaryBar(isAuxiliaryBarVisible);
      this.updateContextKeys();
    }
    if (!this.shouldRefreshActiveAuxiliaryViewFromWorkbenchState()) {
      endPerf({
        needsChromeRefresh,
      });
      return;
    }

    this.renderAuxiliaryBarView();
    endPerf({
      explorerFileCount: this.explorerService.files.length,
      needsChromeRefresh,
    });
  }

  private shouldRefreshAuxiliarySurfacesForExportState(state: ExportState): boolean {
    const previous = this.lastObservedExportState;
    if (!previous) {
      return true;
    }

    return previous.canvasScope !== state.canvasScope ||
      previous.filteredKind !== state.filteredKind;
  }

  private shouldRefreshActiveAuxiliaryViewFromWorkbenchState(): boolean {
    switch (this.getActiveAuxiliaryBarView(this.activeWorkbenchMainPart)) {
      case "search":
      case "template":
      case "settings":
        return false;
      case "parameters":
      case "export":
      default:
        return true;
    }
  }

  private shouldRefreshAuxiliarySurfacesForSessionChange(event: SessionChangeEvent): boolean {
    const activeAuxiliaryView = this.getActiveAuxiliaryBarView(this.activeWorkbenchMainPart);
    switch (activeAuxiliaryView) {
      case "export":
        return this.shouldRefreshExportSurfacesForSessionChange(event);
      case "search":
      case "template":
      case "settings":
        return false;
      case "parameters":
      default:
        return true;
    }
  }

  private shouldRefreshExportSurfacesForSessionChange(event: SessionChangeEvent): boolean {
    switch (event.reason) {
      case "calculatedRecordsChanged":
      case "metricsChanged":
      case "metricInputsChanged":
        return this.exportService.getState().selectedContentKeys.some(key => key !== "iv");
      default:
        return true;
    }
  }

  private renderWorkbench(): void {
    measureWorkbenchBoot("workbench:render:set-parts", () => {
      this.setParts({
        sidebar: this.getViewContainerElement(WorkbenchViewContainers.files, null),
        workbench: this.getViewContainerElement(
          this.activeWorkbenchMainPart === "settings"
            ? WorkbenchViewContainers.settings
            : WorkbenchViewContainers.main,
          this.getActiveMainPartElement(),
        ),
        auxiliaryBar: this.getViewContainerElement(
          WorkbenchViewContainers.auxiliarybar,
          this.getActiveAuxiliaryBarElement(),
        ),
        overlay: this.notifications.element,
      });
    });

    measureWorkbenchBoot("workbench:render:layout-containers", () => {
      this.layoutVisibleViewContainers();
    });

    measureWorkbenchBoot("workbench:render:window-update", () => {
      this.window.update({
        id: "workbench-page",
        className: "workbench_root",
        showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
        titleService: this.titleService,
      });
    });
    this.markInitialWorkbenchRenderComplete();
  }

  protected override onDidRenderLayout(): void {
    if (this.serviceStartupState !== "started") {
      return;
    }

    this.layoutVisibleViewContainers();
    this.window.update({
      id: "workbench-page",
      className: "workbench_root",
      showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      titleService: this.titleService,
    });
  }

  private markInitialWorkbenchRenderComplete(): void {
    if (this.didRenderInitialWorkbench) {
      return;
    }

    this.didRenderInitialWorkbench = true;
    this.onDidRenderInitialWorkbench?.();
  }

  public override dispose(): void {
    this.disposed = true;
    super.dispose();
  }

  private createNotificationsHandlers(): IDisposable {
    const disposables = new DisposableStore();

    disposables.add(registerNotificationCommands(this.notifications, this.commandService));

    const registerToastSource = (source: NotificationService): void => {
      for (const toast of source.toasts) {
        this.notifications.show(toast);
      }

      disposables.add(source.onDidChangeToast(event => {
        switch (event.kind) {
          case "show":
            this.notifications.show(event.options);
            break;
          case "hide":
            this.notifications.hideToast(event.id);
            break;
          case "dispose":
            this.notifications.disposeToast(event.id);
            break;
          case "disposeAll":
            this.notifications.disposeToasts();
            break;
        }
      }));
    };

    registerToastSource(this.notificationService);

    return disposables;
  }

  //#endregion

  //#region view containers and visible parts

  private updateViewContainers(): void {
    const isSettingsActive = this.activeWorkbenchMainPart === "settings";
    const isChartActive = this.activeWorkbenchMainPart === "chart";
    const sidebarSurface = this.getActiveSidebarSurface();
    const isSidebarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
    const isAuxiliaryBarVisible = this.isAuxiliaryBarVisibleForActiveMode();

    if (isSidebarVisible) {
      measureWorkbenchBoot("workbench:view-containers:open:files", () => {
        void this.viewsService.openViewContainer(WorkbenchViewContainers.files);
      });
    }
    if (isAuxiliaryBarVisible) {
      measureWorkbenchBoot("workbench:view-containers:open:auxiliarybar", () => {
        void this.viewsService.openViewContainer(WorkbenchViewContainers.auxiliarybar);
      });
    }

    if (isSettingsActive) {
      measureWorkbenchBoot("workbench:view-containers:open:settings", () => {
        void this.viewsService.openViewContainer(WorkbenchViewContainers.settings);
      });
    } else {
      measureWorkbenchBoot("workbench:view-containers:open:main", () => {
        void this.viewsService.openViewContainer(WorkbenchViewContainers.main);
      });
      measureWorkbenchBoot("workbench:view-containers:close:settings", () => {
        this.viewsService.closeViewContainer(WorkbenchViewContainers.settings);
      });
    }

    measureWorkbenchBoot("workbench:view-containers:set-visible", () => {
      this.viewsService.setViewVisible(
        ExplorerViewId,
        sidebarSurface === "explorer" && isSidebarVisible,
      );
      this.viewsService.setViewVisible(
        ThumbnailViewId,
        sidebarSurface === "thumbnail" && isSidebarVisible,
      );
      this.viewsService.setViewVisible(
        SettingsNavigationViewId,
        sidebarSurface === "settingsNavigation" && isSidebarVisible,
      );
      this.viewsService.setViewVisible(TableViewId, !isSettingsActive && !isChartActive);
      this.viewsService.setViewVisible(ChartViewId, !isSettingsActive && isChartActive);
      this.viewsService.setViewVisible(SettingsViewId, isSettingsActive);
    });
    measureWorkbenchBoot("workbench:view-containers:update-sidebar", () => {
      this.updateSidebar(isSidebarVisible);
    });
    measureWorkbenchBoot("workbench:view-containers:update-auxiliarybar", () => {
      this.updateAuxiliaryBar(isAuxiliaryBarVisible);
    });
  }

  private updateContextKeys(): void {
    this.updateWorkbenchModeContextKeys();
    this.activeAuxiliaryBarViewContext?.set(
      this.getActiveAuxiliaryBarView(this.activeWorkbenchMainPart),
    );
  }

  private updateWorkbenchModeContextKeys(): void {
    this.activeWorkbenchViewContext?.set(this.activeView);
    this.activeWorkbenchMainPartContext?.set(this.activeWorkbenchMainPart);
  }

  private closeAuxiliaryBarViews(): void {
    for (const view of AuxiliaryBarViews) {
      this.viewsService.closeView(view.viewId);
    }
  }

  private updateSidebar(visible: boolean): void {
    const container = this.viewsService.getActiveViewPaneContainerWithId(WorkbenchViewContainers.files);
    if (!container) {
      return;
    }

    this.updateSidebarPaneContainer({
      actions: [],
      container,
      title: visible ? this.getActiveSidebarTitle() : "",
    });
  }

  private getActiveSidebarTitle(): string {
    switch (this.getActiveSidebarSurface()) {
      case "settingsNavigation":
        return localize("settings.title", "Settings");
      case "thumbnail":
        return localize("files.thumbnailView", "Thumbnail");
      case "explorer":
      default:
        return localize("files.explorerSection", "Explorer");
    }
  }

  private getActiveSidebarSurface(): WorkbenchSidebarSurface {
    return resolveWorkbenchSidebarSurface({
      activeMainPart: this.activeWorkbenchMainPart,
      explorerViewLayout: this.explorerService.viewLayout,
    });
  }

  private updateAuxiliaryBar(visible: boolean): void {
    const container = this.viewsService.getActiveViewPaneContainerWithId(WorkbenchViewContainers.auxiliarybar);
    if (!container) {
      this.closeAuxiliaryBarViews();
      return;
    }

    const state = this.updateAuxiliaryBarPartState({
      activeView: this.layoutService.activeAuxiliaryBarView,
      contextKeyService: this.contextKeyService,
      menuService: this.menuService,
      templateMode: this.templateViewStateService.getState().mode,
      visible,
      workbenchMainPart: this.activeWorkbenchMainPart,
    });
    this.updateAuxiliaryBarPaneContainer({
      actions: state.actions,
      container,
      title: state.title,
    });

    for (const view of state.views) {
      this.viewsService.setViewVisible(view.viewId, view.visible);
    }
  }

  private renderAuxiliaryBarView(): void {
    if (this.activeWorkbenchMainPart === "settings") {
      return;
    }

    switch (this.getActiveAuxiliaryBarView(this.activeWorkbenchMainPart)) {
      case "template":
        break;
      case "parameters":
        this.renderParametersView(this.getSelectedChartFileId());
        break;
      case "search":
        break;
      case "settings":
        break;
      case "export":
      default:
        this.renderExportView();
        break;
    }
  }

  private renderExportView(): void {
    this.exportService.updateViewState({
      activeFileId: this.getSelectedChartFileId(),
      snapshot: this.session.getSnapshot(),
    });
  }

  private renderParametersView(activeFileId: string | null): void {
    this.parametersService.updateViewState({
      fileId: activeFileId,
    });
  }

  private getActiveAuxiliaryBarElement(): HTMLElement | null {
    const viewId = this.getActiveAuxiliaryBarViewId(this.activeWorkbenchMainPart);
    return viewId ? this.viewsService.getViewWithId(viewId)?.element ?? null : null;
  }

  private getTableViewElement(): HTMLElement | null {
    return this.viewsService.getViewWithId(TableViewId)?.element ?? null;
  }

  private getChartViewElement(): HTMLElement | null {
    return this.viewsService.getViewWithId(ChartViewId)?.element ?? null;
  }

  private getActiveMainPartElement(): HTMLElement | null {
    switch (this.activeWorkbenchMainPart) {
      case "chart":
        return this.getChartViewElement();
      case "settings":
        return this.viewsService.getViewWithId(SettingsViewId)?.element ?? null;
      case "table":
      default:
        return this.getTableViewElement();
    }
  }

  private isAuxiliaryBarVisibleForActiveMode(): boolean {
    return this.activeWorkbenchMainPart !== "settings" &&
      this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
  }

  private layoutVisibleViewContainers(): void {
    for (const id of Object.values(WorkbenchViewContainers)) {
      this.viewsService.getActiveViewPaneContainerWithId(id)?.layout?.();
    }
  }

  private getViewContainerElement(containerId: string, fallback: HTMLElement | null): HTMLElement | null {
    const element = this.viewsService.getViewContainerElement(containerId);
    return element instanceof HTMLElement ? element : fallback;
  }

  //#endregion

  //#region navigation

  private showWorkbenchViewMode(viewMode: WorkbenchMainPart): void {
    const previousViewMode = this.activeWorkbenchMainPart;
    if (this.activeView !== viewMode) {
      this.navigateToView(viewMode);
    }
    if (previousViewMode === viewMode) {
      this.refreshWorkbench("sameViewMode");
    }
  }

  //#endregion

  //#region view inputs and selection

  private getSelectedChartFileId(): string | null {
    return resolveExplorerDomainSelection(
      this.explorerService,
      this.explorerService.files,
    ).chartFileId;
  }

  //#endregion

  //#region settings

  private getSettingsServiceOptions(): SettingsServiceOptions {
    const windowState = getWorkbenchWindowState();
    return {
      appUpdateSettings: {
        currentVersion:
          typeof windowState.environment?.appVersion === "string"
            ? windowState.environment.appVersion
            : null,
        isAvailable: windowState.isAppUpdatePreviewEnabled,
      },
      isWindowsDesktopShell: windowState.isWindowsDesktopShell,
      language: this.languagePreference,
      theme: isThemeMode(window.__CONDUCTOR_INITIAL_THEME__)
        ? window.__CONDUCTOR_INITIAL_THEME__
        : "system",
    };
  }

  private createMessagePane(titleText: string, descriptionText: string): HTMLElement {
    const root = document.createElement("div");
    root.className = "workbench_message_pane";

    const title = document.createElement("h2");
    title.className = "workbench_message_title";
    title.textContent = titleText;

    const description = document.createElement("p");
    description.className = "workbench_message_description";
    description.textContent = descriptionText;

    root.append(title, description);
    return root;
  }

//#endregion
}
