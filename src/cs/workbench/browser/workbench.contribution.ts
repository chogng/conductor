import { scheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ViewPaneContainer } from "src/cs/workbench/browser/parts/views/viewPaneContainer";
import { Workbench } from "src/cs/workbench/browser/workbench";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import { createAuxiliaryBarActionViewItem } from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import { hideWorkbenchSplash } from "src/cs/workbench/contrib/splash/browser/partsSplash";
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
  IWorkbenchLayoutService,
  type IWorkbenchLayoutService as IWorkbenchLayoutServiceType,
} from "src/cs/workbench/services/layout/browser/layoutService";
import {
  IViewsService,
  type IViewsService as IViewsServiceType,
} from "src/cs/workbench/services/views/common/viewsService";
import {
  IAnalysisFileService,
  type IAnalysisFileService as IAnalysisFileServiceType,
} from "src/cs/workbench/services/analysisFile/common/analysisFile";
import {
  IContextMenuService,
  type IContextMenuService as IContextMenuServiceType,
} from "src/cs/platform/contextview/browser/contextView";
import {
  IContextKeyService,
  type IContextKeyService as IContextKeyServiceType,
} from "src/cs/platform/contextkey/common/contextkey";
import {
  ICommandService,
  type ICommandService as ICommandServiceType,
} from "src/cs/platform/commands/common/commands";
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
} from "src/cs/workbench/contrib/table/common/tableService";
import {
  ITemplateApplyService,
  ITemplateService,
  type ITemplateApplyService as ITemplateApplyServiceType,
  type ITemplateService as ITemplateServiceType,
} from "src/cs/workbench/contrib/template/common/template";

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
    @IAnalysisFileService analysisFileService: IAnalysisFileServiceType,
    @IFileService filesService: IFileServiceType,
    @IFileDialogService dialogsService: IFileDialogServiceType,
    @IContextMenuService contextMenuService: IContextMenuServiceType,
    @IContextKeyService contextKeyService: IContextKeyServiceType,
    @ICommandService commandService: ICommandServiceType,
    @IPathService pathService: IPathServiceType,
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutServiceType,
    @IViewsService viewsService: IViewsServiceType,
    @ITemplateApplyService templateApplyService: ITemplateApplyServiceType,
    @ITemplateService templateService: ITemplateServiceType,
    @IInstantiationService instantiationService: IInstantiationServiceType,
  ) {
    super();

    this._register(instantiationService.createInstance(WorkbenchContextKeysHandler));

    const root = document.getElementById("root");
    if (!root) {
      throw new Error('Root element with id "root" was not found.');
    }

    this.workbench = this._register(new Workbench(root, {
      analysisFileService,
      dialogsService,
      commandService,
      contextKeyService,
      contextMenuService,
      filesService,
      pathService,
      layoutService,
      viewsService,
      tableService,
      templateApplyService,
      templateService,
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
  return viewContainersRegistry.registerViewContainer({
    id,
    title,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
      actionViewItemProvider: isAuxiliaryBar ? createAuxiliaryBarActionViewItem : undefined,
      className: "workbench-part-view-pane-container",
      id,
      renderHeader: isAuxiliaryBar,
      title,
    }]),
  }, location, { isDefault: true, doNotRegisterOpenCommand: true });
}

registerWorkbenchContribution2(
  WorkbenchContributionId,
  WorkbenchContribution,
  WorkbenchPhase.BlockStartup,
);
