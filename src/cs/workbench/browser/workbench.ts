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
  IAssessmentQueueService,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
  ExplorerViewId,
  IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  IParametersService,
} from "src/cs/workbench/services/parameters/common/parameters";
import { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import { IThumbnailPreviewService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  ISettingsService,
  SettingsViewId,
  type SettingsServiceOptions,
} from "src/cs/workbench/services/settings/common/settings";
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
import { AuxiliaryBarModel } from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarModel";
import type { WorkbenchStyle } from "src/cs/workbench/browser/style";
import {
  WorkbenchWindow,
} from "src/cs/workbench/browser/window";
import {
  WorkbenchDomainBridge,
  resolveExplorerSessionSelection,
} from "src/cs/workbench/browser/workbenchDomainBridge";
import { ITableService } from "src/cs/workbench/services/table/common/table";
import { TableViewId } from "src/cs/workbench/contrib/table/common/table";
import {
  ISessionService,
  type ISessionService as ISessionServiceType,
  type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type {
  SessionChangeEvent,
} from "src/cs/workbench/services/session/common/sessionEvents";
import {
  type FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  createProcessedEntryFromFileRecord,
  createSessionReadModel,
  type SessionReadModel,
} from "src/cs/workbench/services/session/common/sessionReadModel";
import {
  ITemplateApplyWorkflowService,
  ITemplateService,
  type ITemplateApplyWorkflowService as ITemplateApplyWorkflowServiceType,
  type ITemplateService as ITemplateServiceType,
} from "src/cs/workbench/services/template/common/template";
import {
  IExportService,
  type ExportState,
} from "src/cs/workbench/services/export/common/export";
import type {
  ProcessedEntry,
} from "src/cs/workbench/services/session/common/sessionTypes";
import {
  INotificationService,
  NotificationService,
} from "src/cs/workbench/services/notification/common/notificationService";
import { NotificationToasts } from "src/cs/workbench/browser/parts/notifications/notificationsToasts";
import { registerNotificationCommands } from "src/cs/workbench/browser/parts/notifications/notificationsCommands";

//#endregion

//#region types and startup helpers

type WorkbenchSessionSnapshot = SessionSnapshot;

type WorkbenchFullRefreshReason =
  | "deferredAuxiliaryBarViewContainer"
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

export type WorkbenchOptions = {
  readonly assessmentQueueService?: IAssessmentQueueService;
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
  readonly parametersService?: IParametersService;
  readonly plotService?: IPlotService;
  readonly settingsService?: ISettingsService;
  readonly viewsService?: IViewsService;
  readonly id?: string;
  readonly instantiationService?: IInstantiationService;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: WorkbenchStyle;
  readonly templateApplyWorkflowService?: ITemplateApplyWorkflowService;
  readonly templateService?: ITemplateService;
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
  readonly assessmentQueueService: IAssessmentQueueService;
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
  readonly tableService: ITableService;
  readonly templateApplyWorkflowService: ITemplateApplyWorkflowServiceType;
  readonly templateService: ITemplateServiceType;
  readonly thumbnailPreviewService: IThumbnailPreviewService;
  readonly titleService: ITitleService;
  readonly viewsService: IViewsService;
};

const hasExplicitWorkbenchServices = (options: WorkbenchOptions): boolean =>
  Boolean(
    options.assessmentQueueService &&
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
    options.tableService &&
    options.templateApplyWorkflowService &&
    options.templateService &&
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
    assessmentQueueService: requireWorkbenchService("IAssessmentQueueService", options.assessmentQueueService),
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
    tableService: requireWorkbenchService("ITableService", options.tableService),
    templateApplyWorkflowService: requireWorkbenchService(
      "ITemplateApplyWorkflowService",
      options.templateApplyWorkflowService,
    ),
    templateService: requireWorkbenchService("ITemplateService", options.templateService),
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
  assessmentQueueService: resolveWorkbenchDependency(
    "IAssessmentQueueService",
    options.assessmentQueueService,
    () => accessor.get(IAssessmentQueueService),
  ),
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
  tableService: resolveWorkbenchDependency(
    "ITableService",
    options.tableService,
    () => accessor.get(ITableService),
  ),
  templateApplyWorkflowService: resolveWorkbenchDependency(
    "ITemplateApplyWorkflowService",
    options.templateApplyWorkflowService,
    () => accessor.get(ITemplateApplyWorkflowService),
  ),
  templateService: resolveWorkbenchDependency(
    "ITemplateService",
    options.templateService,
    () => accessor.get(ITemplateService),
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

export const resolveInitialWorkbenchViewMode = (
  _snapshot: WorkbenchSessionSnapshot,
): WorkbenchMainPart => "table";

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
  private templateApplyWorkflowService!: ITemplateApplyWorkflowServiceType;
  private assessmentQueueService!: IAssessmentQueueService;
  private calculationService!: ICalculationService;
  private chartService!: IChartService;
  private explorerService!: IExplorerService;
  private layoutService!: IWorkbenchLayoutService;
  private menuService!: IMenuService;
  private notificationService!: NotificationService;
  private parametersService!: IParametersService;
  private plotService!: IPlotService;
  private settingsService!: ISettingsService;
  private viewsService!: IViewsService;
  private tableService!: ITableService;
  private templateService!: ITemplateServiceType;
  private thumbnailPreviewService!: IThumbnailPreviewService;
  private titleService!: ITitleService;
  private exportService!: IExportService;
  private domainBridge: WorkbenchDomainBridge | null = null;
  private readonly auxiliaryBarModel = new AuxiliaryBarModel();
  private cancelScheduledAuxiliarySurfacesRefresh: (() => void) | null = null;
  private readonly scheduledAuxiliarySurfacesRefreshReasons = new Set<WorkbenchAuxiliaryRefreshReason>();
  private scheduledAuxiliarySurfacesRefreshNeedsChrome = false;
  private lastObservedExportState: ExportState | null = null;
  private titlebarState: WorkbenchTitlebarState | undefined;
  private deferAuxiliaryBarViewContainer = false;
  private deferSidebarViewContainer = false;
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
    this.window = this._register(new WorkbenchWindow(parent, {
      ...options,
      showSkeleton: deferServiceStartup || options.showSkeleton === true,
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
        this.assessmentQueueService = services.assessmentQueueService;
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
        this.session = services.sessionService;
        this.viewsService = services.viewsService;
        this.tableService = services.tableService;
        this.templateApplyWorkflowService = services.templateApplyWorkflowService;
        this.templateService = services.templateService;
        this.thumbnailPreviewService = services.thumbnailPreviewService;
        this.titleService = services.titleService;
      });

      measureWorkbenchBoot("workbench:service-layer:install:contextkeys", () => {
        this._register(new WorkbenchContextKeysHandler(this.contextKeyService));
        this.activeWorkbenchViewContext = ActiveWorkbenchViewContext.bindTo(this.contextKeyService);
        this.activeWorkbenchMainPartContext = ActiveWorkbenchMainPartContext.bindTo(this.contextKeyService);
        this.activeAuxiliaryBarViewContext = ActiveAuxiliaryBarViewContext.bindTo(this.contextKeyService);
      });

      const initialViewMode = measureWorkbenchBoot("workbench:service-layer:install:initial-state", () => {
        this.lastObservedExportState = this.exportService.getState();
        this.titleService.updateTitlebarState(this.titlebarState);
        const viewMode = resolveInitialWorkbenchViewMode(this.session.getSnapshot());
        this._register(this.createNotificationsHandlers());
        this.settingsService.update(this.getSettingsServiceOptions());
        return viewMode;
      });

      const domainBridge = measureWorkbenchBoot("workbench:service-layer:install:bridge-create", () =>
        this._register(new WorkbenchDomainBridge({
          assessmentQueueService: this.assessmentQueueService,
          calculationService: this.calculationService,
          chartService: this.chartService,
          explorerService: this.explorerService,
          layoutService: this.layoutService,
          plotService: this.plotService,
          sessionService: this.session,
          settingsService: this.settingsService,
          tableService: this.tableService,
          templateApplyWorkflowService: this.templateApplyWorkflowService,
          templateService: this.templateService,
          thumbnailPreviewService: this.thumbnailPreviewService,
        })),
      );
      this.domainBridge = domainBridge;

      measureWorkbenchBoot("workbench:service-layer:install:listeners", () => {
        this._register(this.settingsService.onDidChangeConductorSettings(() => {
          this.scheduleWorkbenchAuxiliarySurfacesRefresh("settings", true);
        }));
        this._register(this.explorerService.onDidChangeSelection(() => {
          this.scheduleWorkbenchAuxiliarySurfacesRefresh("explorerSelection", false);
        }));
        this._register(this.chartService.onDidChangeChartState(() => {
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
          this.scheduleWorkbenchAuxiliarySurfacesRefresh("plotState", true);
        }));
        this._register(this.plotService.onDidChangePlotDisplayModelCache(() => {
          this.scheduleWorkbenchAuxiliarySurfacesRefresh("plotDisplayModelCache", false);
        }));
        this._register(this.exportService.onDidChangeExportState(state => {
          if (this.shouldRefreshAuxiliarySurfacesForExportState(state)) {
            this.scheduleWorkbenchAuxiliarySurfacesRefresh("exportState", true);
          }
          this.lastObservedExportState = state;
        }));
        this._register(this.templateService.onDidChangeTemplateState(() => {
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

      this.deferAuxiliaryBarViewContainer = true;
      this.deferSidebarViewContainer = true;
      measureWorkbenchBoot("workbench:service-layer:install:reset-view", () => {
        this.suppressNavigationRefresh = true;
        try {
          this.resetToView(initialViewMode);
        } finally {
          this.suppressNavigationRefresh = false;
        }
      });
      measureWorkbenchBoot("workbench:service-layer:install:domain-sync", () => {
        domainBridge.sync();
      });
      measureWorkbenchBoot("workbench:service-layer:install:refresh-initial", () => {
        this.refreshWorkbench("initial");
      });
      this.scheduleDeferredPeripheralViewContainers();
    });
  }

  private scheduleDeferredPeripheralViewContainers(): void {
    if (!this.hasDeferredPeripheralViewContainers()) {
      return;
    }

    logWorkbenchBoot("workbench:service-layer:deferred-peripheral:scheduled");
    this._register(scheduleAtNextAnimationFrame(window, () => {
      if (this.disposed || !this.hasDeferredPeripheralViewContainers()) {
        return;
      }

      this._register(runWhenWindowIdle(window, () => {
        if (this.disposed || !this.hasDeferredPeripheralViewContainers()) {
          return;
        }

        this.flushDeferredSidebarViewContainer();
      }, 500));
    }));
  }

  private flushDeferredSidebarViewContainer(): void {
    if (this.deferSidebarViewContainer) {
      measureWorkbenchBoot("workbench:service-layer:deferred-sidebar-open", () => {
        this.deferSidebarViewContainer = false;
        this.updateViewContainers();
        this.updateContextKeys();
      });
      this.scheduleDeferredSidebarViewContainerRender();
      return;
    }
    this.scheduleDeferredAuxiliaryBarViewContainer();
  }

  private scheduleDeferredSidebarViewContainerRender(): void {
    logWorkbenchBoot("workbench:service-layer:deferred-sidebar-render:scheduled");
    this._register(scheduleAtNextAnimationFrame(window, () => {
      if (this.disposed) {
        return;
      }

      this._register(runWhenWindowIdle(window, () => {
        if (this.disposed) {
          return;
        }

        measureWorkbenchBoot("workbench:service-layer:deferred-sidebar-render", () => {
          this.renderWorkbench();
        });
        this.scheduleDeferredAuxiliaryBarViewContainer();
      }, 500));
    }));
  }

  private scheduleDeferredAuxiliaryBarViewContainer(): void {
    if (!this.deferAuxiliaryBarViewContainer) {
      return;
    }

    logWorkbenchBoot("workbench:service-layer:deferred-auxiliarybar:scheduled");
    this._register(scheduleAtNextAnimationFrame(window, () => {
      if (this.disposed || !this.deferAuxiliaryBarViewContainer) {
        return;
      }

      this._register(runWhenWindowIdle(window, () => {
        if (this.disposed || !this.deferAuxiliaryBarViewContainer) {
          return;
        }

        measureWorkbenchBoot("workbench:service-layer:deferred-auxiliarybar", () => {
          this.deferAuxiliaryBarViewContainer = false;
          this.refreshWorkbench("deferredAuxiliaryBarViewContainer");
        });
      }, 500));
    }));
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
      showSkeleton: options.showSkeleton ?? this.serviceStartupState !== "started",
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
      activeAuxiliaryBarView: this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart),
      activeView: this.activeView,
      mode: this.activeWorkbenchMainPart,
      reason,
    }, { silent: true });
    const snapshot = measureWorkbenchBoot(`workbench:refresh:${reason}:snapshot`, () =>
      this.session.getSnapshot(),
    );
    const readModel = measureWorkbenchBoot(`workbench:refresh:${reason}:read-model`, () =>
      createSessionReadModel(snapshot),
    );
    measureWorkbenchBoot(`workbench:refresh:${reason}:mode-context`, () => {
      this.updateWorkbenchModeContextKeys();
    });
    measureWorkbenchBoot(`workbench:refresh:${reason}:view-containers`, () => {
      this.updateViewContainers();
    });
    measureWorkbenchBoot(`workbench:refresh:${reason}:context`, () => {
      this.updateContextKeys();
    });
    if (!this.shouldDeferAuxiliaryBarViewContainer()) {
      measureWorkbenchBoot(`workbench:refresh:${reason}:auxiliary-view`, () => {
        this.renderAuxiliaryBarView(snapshot, readModel);
      });
    }
    measureWorkbenchBoot(`workbench:refresh:${reason}:render`, () => {
      this.renderWorkbench();
    });
    endPerf({
      fileCount: Object.keys(snapshot.filesById).length,
      processedFileCount: readModel.processedFileIds.length,
      rawFileCount: readModel.rawFiles.length,
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
      activeAuxiliaryBarView: this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart),
      activeView: this.activeView,
      mode: this.activeWorkbenchMainPart,
      reason: reasons[0] ?? "unknown",
      reasons: reasons.join(","),
    }, { silent: true });
    const snapshot = this.session.getSnapshot();
    const readModel = createSessionReadModel(snapshot);
    if (needsChromeRefresh) {
      const isWorkbenchActive = this.activeView !== "settings";
      const isAuxiliaryBarVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
      this.updateWorkbenchModeContextKeys();
      this.updateAuxiliaryBar(isWorkbenchActive && isAuxiliaryBarVisible);
      this.updateContextKeys();
    }
    this.renderAuxiliaryBarView(snapshot, readModel);
    endPerf({
      fileCount: Object.keys(snapshot.filesById).length,
      needsChromeRefresh,
      processedFileCount: readModel.processedFileIds.length,
      rawFileCount: readModel.rawFiles.length,
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

  private shouldRefreshAuxiliarySurfacesForSessionChange(event: SessionChangeEvent): boolean {
    const activeAuxiliaryView = this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart);
    switch (activeAuxiliaryView) {
      case "export":
        return this.shouldRefreshExportSurfacesForSessionChange(event);
      case "template":
      case "settings":
        return false;
      case "parameters":
      case "search":
      default:
        return true;
    }
  }

  private shouldRefreshExportSurfacesForSessionChange(event: SessionChangeEvent): boolean {
    switch (event.reason) {
      case "assessmentChanged":
        return false;
      case "calculatedRecordsChanged":
      case "metricsChanged":
      case "metricInputsChanged":
        return this.exportService.getState().selectedContentKeys.some(key => key !== "iv");
      default:
        return true;
    }
  }

  private renderWorkbench(): void {
    const deferSidebarViewContainer = this.shouldDeferSidebarViewContainer();
    const deferAuxiliaryBarViewContainer = this.shouldDeferAuxiliaryBarViewContainer();
    measureWorkbenchBoot("workbench:render:set-parts", () => {
      this.setParts({
        sidebar: deferSidebarViewContainer
          ? null
          : this.getViewContainerElement(WorkbenchViewContainers.files, null),
        workbench: this.getViewContainerElement(
          WorkbenchViewContainers.main,
          this.activeWorkbenchMainPart === "chart" ? this.getChartViewElement() : this.getTableViewElement(),
        ),
        auxiliaryBar: deferAuxiliaryBarViewContainer
          ? null
          : this.getViewContainerElement(
            WorkbenchViewContainers.auxiliarybar,
            this.getActiveAuxiliaryBarElement(),
          ),
        overlay: this.notifications.element,
        settings: this.getViewContainerElement(WorkbenchViewContainers.settings, null),
      });
    });

    if (!deferSidebarViewContainer || !deferAuxiliaryBarViewContainer) {
      measureWorkbenchBoot("workbench:render:layout-containers", () => {
        this.layoutVisibleViewContainers();
      });
    }

    measureWorkbenchBoot("workbench:render:window-update", () => {
      this.window.update({
        id: "workbench-page",
        className: "workbench_root",
        showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
        showSkeleton: false,
        titleService: this.titleService,
      });
    });
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
      showSkeleton: false,
      titleService: this.titleService,
    });
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
    const isSettingsActive = this.activeView === "settings";
    const isWorkbenchActive = !isSettingsActive;
    const isChartActive = this.activeWorkbenchMainPart === "chart";
    const isSidebarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
    const isAuxiliaryBarVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
    const deferSidebarViewContainer = this.shouldDeferSidebarViewContainer();
    const deferAuxiliaryBarViewContainer = this.shouldDeferAuxiliaryBarViewContainer();

    if (isSidebarVisible && !deferSidebarViewContainer) {
      measureWorkbenchBoot("workbench:view-containers:open:files", () => {
        void this.viewsService.openViewContainer(WorkbenchViewContainers.files);
      });
    }
    if (isAuxiliaryBarVisible && !deferAuxiliaryBarViewContainer) {
      measureWorkbenchBoot("workbench:view-containers:open:auxiliarybar", () => {
        void this.viewsService.openViewContainer(WorkbenchViewContainers.auxiliarybar);
      });
    }

    if (isWorkbenchActive) {
      measureWorkbenchBoot("workbench:view-containers:open:main", () => {
        void this.viewsService.openViewContainer(WorkbenchViewContainers.main);
      });
      measureWorkbenchBoot("workbench:view-containers:close:settings", () => {
        this.viewsService.closeViewContainer(WorkbenchViewContainers.settings);
      });
    } else {
      measureWorkbenchBoot("workbench:view-containers:open:settings", () => {
        void this.viewsService.openViewContainer(WorkbenchViewContainers.settings);
      });
    }

    measureWorkbenchBoot("workbench:view-containers:set-visible", () => {
      this.viewsService.setViewVisible(
        ExplorerViewId,
        isWorkbenchActive && isSidebarVisible && !deferSidebarViewContainer,
      );
      this.viewsService.setViewVisible(TableViewId, isWorkbenchActive && !isChartActive);
      this.viewsService.setViewVisible(ChartViewId, isWorkbenchActive && isChartActive);
      this.viewsService.setViewVisible(SettingsViewId, isSettingsActive);
    });
    if (!deferSidebarViewContainer) {
      measureWorkbenchBoot("workbench:view-containers:update-sidebar", () => {
        this.updateSidebar(isWorkbenchActive && isSidebarVisible);
      });
    }
    if (!deferAuxiliaryBarViewContainer) {
      measureWorkbenchBoot("workbench:view-containers:update-auxiliarybar", () => {
        this.updateAuxiliaryBar(isWorkbenchActive && isAuxiliaryBarVisible);
      });
    }
  }

  private hasDeferredPeripheralViewContainers(): boolean {
    return this.deferSidebarViewContainer || this.deferAuxiliaryBarViewContainer;
  }

  private shouldDeferSidebarViewContainer(): boolean {
    return this.deferSidebarViewContainer && this.activeView !== "settings";
  }

  private shouldDeferAuxiliaryBarViewContainer(): boolean {
    return this.deferAuxiliaryBarViewContainer && this.activeView !== "settings";
  }

  private updateContextKeys(): void {
    this.updateWorkbenchModeContextKeys();
    this.activeAuxiliaryBarViewContext?.set(
      this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart),
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
      title: visible ? localize("files.explorerSection", "Explorer") : "",
    });
  }

  private updateAuxiliaryBar(visible: boolean): void {
    const container = this.viewsService.getActiveViewPaneContainerWithId(WorkbenchViewContainers.auxiliarybar);
    if (!container) {
      this.closeAuxiliaryBarViews();
      return;
    }

    const state = this.auxiliaryBarModel.update({
      activeView: this.layoutService.activeAuxiliaryBarView,
      contextKeyService: this.contextKeyService,
      menuService: this.menuService,
      mode: this.activeWorkbenchMainPart,
      templateMode: this.templateService.getState().mode,
      visible,
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

  private renderAuxiliaryBarView(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ): void {
    if (this.activeView === "settings") {
      return;
    }

    const activeFile = this.getSelectedProcessedFile(snapshot, readModel);
    const activeFileRecord = this.getSelectedProcessedFileRecord(snapshot, readModel);

    switch (this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart)) {
      case "template":
        break;
      case "parameters":
        this.renderParametersView(snapshot, this.getSelectedProcessedFileId(readModel));
        break;
      case "search":
        break;
      case "settings":
        break;
      case "export":
      default:
        this.renderExportView(activeFile, activeFileRecord, snapshot, readModel);
        break;
    }
  }

  private renderExportView(
    activeFile: ProcessedEntry | null,
    activeFileRecord: FileRecord | null,
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ): void {
    this.exportService.updateViewState({
      activeFile,
      activeFileId: this.getSelectedProcessedFileId(readModel),
      activeFileRecord,
      snapshot,
    });
  }

  private renderParametersView(
    snapshot: WorkbenchSessionSnapshot,
    activeFileId: string | null,
  ): void {
    this.parametersService.updateViewState({
      fileId: activeFileId,
      snapshot,
    });
  }

  private getActiveAuxiliaryBarElement(): HTMLElement | null {
    const viewId = this.auxiliaryBarModel.getActiveViewId(this.activeWorkbenchMainPart);
    return viewId ? this.viewsService.getViewWithId(viewId)?.element ?? null : null;
  }

  private getTableViewElement(): HTMLElement | null {
    return this.viewsService.getViewWithId(TableViewId)?.element ?? null;
  }

  private getChartViewElement(): HTMLElement | null {
    return this.viewsService.getViewWithId(ChartViewId)?.element ?? null;
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

  private getSelectedProcessedFileId(readModel: SessionReadModel): string | null {
    return resolveExplorerSessionSelection(this.explorerService, readModel).selectedProcessedFileId;
  }

  private getSelectedProcessedFileRecord(
    snapshot: WorkbenchSessionSnapshot,
    readModel = createSessionReadModel(snapshot),
  ): FileRecord | null {
    const activeFileId = this.getSelectedProcessedFileId(readModel);
    return activeFileId ? snapshot.filesById[activeFileId] ?? null : null;
  }

  private getSelectedProcessedFile(
    snapshot: WorkbenchSessionSnapshot,
    readModel = createSessionReadModel(snapshot),
  ): ProcessedEntry | null {
    const fileRecord = this.getSelectedProcessedFileRecord(snapshot, readModel);
    return fileRecord ? createProcessedEntryFromFileRecord(fileRecord) : null;
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
