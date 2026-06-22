import { scheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ViewPaneContainer } from "src/cs/workbench/browser/parts/views/viewPaneContainer";
import { Workbench } from "src/cs/workbench/browser/workbench";
import { WorkbenchLayoutCommandId } from "src/cs/workbench/browser/actions/layoutCommands";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import { createAuxiliaryBarActionViewItem } from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import { createSidebarActionViewItem } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { hideWorkbenchSplash } from "src/cs/workbench/browser/parts/splash/partsSplash";
import {
  IFileDialogService,
  type IFileDialogService as IFileDialogServiceType,
} from "src/cs/platform/dialogs/common/dialogs";
import {
  IFileService,
  type IFileService as IFileServiceType,
} from "src/cs/platform/files/common/files";
import {
  IPathService,
  type IPathService as IPathServiceType,
} from "src/cs/workbench/services/path/common/pathService";
import {
  IChartService,
  type IChartService as IChartServiceType,
} from "src/cs/workbench/services/chart/common/chart";
import {
  ICalculationService,
  type ICalculationService as ICalculationServiceType,
} from "src/cs/workbench/services/calculation/common/calculation";
import {
  IAssessmentQueueService,
  type IAssessmentQueueService as IAssessmentQueueServiceType,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
  IParametersService,
} from "src/cs/workbench/services/parameters/common/parameters";
import {
  IPlotService,
  type IPlotService as IPlotServiceType,
} from "src/cs/workbench/services/plot/common/plot";
import {
  IThumbnailPreviewService,
  type IThumbnailPreviewService as IThumbnailPreviewServiceType,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  ISettingsService,
  type ISettingsService as ISettingsServiceType,
} from "src/cs/workbench/services/settings/common/settings";
import {
  IExplorerService,
  type IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  IExportService,
  type IExportService as IExportServiceType,
} from "src/cs/workbench/services/export/common/export";
import {
  IWorkbenchLayoutService,
  type IWorkbenchLayoutService as IWorkbenchLayoutServiceType,
} from "src/cs/workbench/services/layout/browser/layoutService";
import {
  ITitleService,
  type ITitleService as ITitleServiceType,
} from "src/cs/workbench/services/title/browser/titleService";
import {
  IViewsService,
  type IViewsService as IViewsServiceType,
} from "src/cs/workbench/services/views/common/viewsService";
import {
  IContextKeyService,
  type IContextKeyService as IContextKeyServiceType,
} from "src/cs/platform/contextkey/common/contextkey";
import {
  IKeybindingService,
  type IKeybindingService as IKeybindingServiceType,
} from "src/cs/platform/keybinding/common/keybinding";
import {
  CommandsRegistry,
  ICommandService,
  type ICommandService as ICommandServiceType,
} from "src/cs/platform/commands/common/commands";
import {
  IMenuService,
  type IMenuService as IMenuServiceType,
} from "src/cs/platform/actions/common/actions";
import {
  IStorageService,
  type IStorageService as IStorageServiceType,
} from "src/cs/platform/storage/common/storage";
import {
  INativeHostService,
  type INativeHostService as INativeHostServiceType,
} from "src/cs/platform/native/common/native";
import {
  IInstantiationService,
  type IInstantiationService as IInstantiationServiceType,
} from "src/cs/platform/instantiation/common/instantiation";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import { WorkbenchContextKeysHandler } from "src/cs/workbench/browser/contextkeys";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  ViewContainerLocation,
  type ViewContainer,
} from "src/cs/workbench/common/views";
import {
  ITableService,
  type ITableService as ITableServiceType,
} from "src/cs/workbench/services/table/common/table";
import {
  ITemplateApplyWorkflowService,
  ITemplateService,
  type ITemplateService as ITemplateServiceType,
} from "src/cs/workbench/services/template/common/template";
import {
  ISessionService,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import {
  INotificationService,
  NotificationService,
} from "src/cs/workbench/services/notification/common/notificationService";

export const WorkbenchContributionId = "workbench.browser.workbench";

const markBootUiReady = (source: string) => {
  hideWorkbenchSplash();
  window.__CONDUCTOR_BOOT_MARK_UI_READY__?.(source);
};

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);

registerContainer(
  WorkbenchViewContainers.files,
  localize("workbench.views.files", "Files"),
  ViewContainerLocation.Sidebar,
);
registerContainer(
  WorkbenchViewContainers.main,
  localize("workbench.views.main", "Workbench"),
  ViewContainerLocation.Panel,
);
registerContainer(
  WorkbenchViewContainers.auxiliarybar,
  localize("workbench.views.secondary", "Details"),
  ViewContainerLocation.AuxiliaryBar,
);
registerContainer(
  WorkbenchViewContainers.settings,
  localize("workbench.views.settings", "Settings"),
  ViewContainerLocation.Panel,
);

export class WorkbenchContribution extends Disposable implements IWorkbenchContribution {
  private readonly workbench: Workbench;

  constructor(
    @ITableService tableService: ITableServiceType,
    @IFileService filesService: IFileServiceType,
    @IFileDialogService dialogsService: IFileDialogServiceType,
    @IContextKeyService contextKeyService: IContextKeyServiceType,
    @ICommandService commandService: ICommandServiceType,
    @IMenuService menuService: IMenuServiceType,
    @IKeybindingService _keybindingService: IKeybindingServiceType,
    @IChartService chartService: IChartServiceType,
    @ICalculationService calculationService: ICalculationServiceType,
    @IAssessmentQueueService assessmentQueueService: IAssessmentQueueServiceType,
    @IExplorerService explorerService: IExplorerServiceType,
    @IExportService exportService: IExportServiceType,
    @IParametersService parametersService: IParametersService,
    @IPlotService plotService: IPlotServiceType,
    @ISettingsService settingsService: ISettingsServiceType,
    @IPathService pathService: IPathServiceType,
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutServiceType,
    @ITitleService titleService: ITitleServiceType,
    @IViewsService viewsService: IViewsServiceType,
    @ITemplateApplyWorkflowService templateApplyWorkflowService: ITemplateApplyWorkflowService,
    @ITemplateService templateService: ITemplateServiceType,
    @IThumbnailPreviewService thumbnailPreviewService: IThumbnailPreviewServiceType,
    @ISessionService sessionService: ISessionServiceType,
    @INotificationService notificationService: NotificationService,
    @IStorageService storageService: IStorageServiceType,
    @INativeHostService nativeHostService: INativeHostServiceType | undefined,
    @IInstantiationService instantiationService: IInstantiationServiceType,
  ) {
    super();

    this._register(instantiationService.createInstance(WorkbenchContextKeysHandler));

    const root = document.getElementById("root");
    if (!root) {
      throw new Error('Root element with id "root" was not found.');
    }

    this.workbench = this._register(new Workbench(root, {
      assessmentQueueService,
      calculationService,
      dialogsService,
      commandService,
      chartService,
      contextKeyService,
      explorerService,
      exportService,
      filesService,
      parametersService,
      plotService,
      settingsService,
      pathService,
      layoutService,
      menuService,
      nativeHostService,
      notificationService,
      titleService,
      viewsService,
      sessionService,
      storageService,
      tableService,
      templateApplyWorkflowService,
      templateService,
      thumbnailPreviewService,
    }));
    this._register(CommandsRegistry.registerCommand({
      id: WorkbenchLayoutCommandId.resetLayoutState,
      handler: () => this.workbench.resetLayoutState(),
      metadata: {
        description: localize("workbench.commands.resetLayoutState", "Reset workbench layout state"),
      },
    }));
    this._register(
      scheduleAtNextAnimationFrame(window, () => {
        markBootUiReady("workbench");
      }),
    );
  }

  public get contentElement(): HTMLElement {
    return this.workbench.contentElement;
  }
}

function registerContainer(id: string, title: string, location: ViewContainerLocation): ViewContainer {
  const isAuxiliaryBar = id === WorkbenchViewContainers.auxiliarybar;
  const isSidebar = id === WorkbenchViewContainers.files;
  return viewContainersRegistry.registerViewContainer({
    id,
    title,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
      actionViewItemProvider: isAuxiliaryBar
        ? createAuxiliaryBarActionViewItem
        : isSidebar
          ? createSidebarActionViewItem
          : undefined,
      className: "workbench-part-view-pane-container",
      id,
      renderHeader: isAuxiliaryBar || isSidebar,
      title,
    }]),
  }, location, { isDefault: true, doNotRegisterOpenCommand: true });
}

registerWorkbenchContribution2(
  WorkbenchContributionId,
  WorkbenchContribution,
  WorkbenchPhase.BlockStartup,
);
