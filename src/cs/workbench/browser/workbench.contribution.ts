import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ViewPaneContainer } from "src/cs/workbench/browser/parts/views/viewPaneContainer";
import { Workbench } from "src/cs/workbench/browser/workbench";
import { WorkbenchLayoutCommandId } from "src/cs/workbench/browser/actions/layoutCommands";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions";
import "src/cs/workbench/browser/parts/sidebar/sidebarActions";
import { createAuxiliaryBarActionViewItem } from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import { createSidebarActionViewItem } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { hideWorkbenchSplash } from "src/cs/workbench/browser/parts/splash/partsSplash";
import {
  CommandsRegistry,
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
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  ViewContainerLocation,
  type ViewContainer,
} from "src/cs/workbench/common/views";

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
  WorkbenchViewContainers.thumbnail,
  localize("workbench.views.thumbnail", "Thumbnail"),
  ViewContainerLocation.Sidebar,
);
registerContainer(
  WorkbenchViewContainers.settingsNavigation,
  localize("workbench.views.settings", "Settings"),
  ViewContainerLocation.Sidebar,
);
registerContainer(
  WorkbenchViewContainers.table,
  localize("workbench.views.table", "Table"),
  ViewContainerLocation.Panel,
);
registerContainer(
  WorkbenchViewContainers.chart,
  localize("workbench.views.chart", "Chart"),
  ViewContainerLocation.Panel,
);
registerContainer(
  WorkbenchViewContainers.settings,
  localize("workbench.views.settings", "Settings"),
  ViewContainerLocation.Panel,
);
registerContainer(
  WorkbenchViewContainers.template,
  localize("template.management.title", "Template Management"),
  ViewContainerLocation.AuxiliaryBar,
);
registerContainer(
  WorkbenchViewContainers.search,
  localize("chart.views.search", "Search"),
  ViewContainerLocation.AuxiliaryBar,
);
registerContainer(
  WorkbenchViewContainers.export,
  localize("chart.views.export", "Export"),
  ViewContainerLocation.AuxiliaryBar,
);
registerContainer(
  WorkbenchViewContainers.parameters,
  localize("chart.views.parameters", "Parameters"),
  ViewContainerLocation.AuxiliaryBar,
);
registerContainer(
  WorkbenchViewContainers.originSettings,
  localize("origin.curveSettings.title", "Origin Settings"),
  ViewContainerLocation.AuxiliaryBar,
);

export class WorkbenchContribution extends Disposable implements IWorkbenchContribution {
  private readonly workbench: Workbench;

  constructor(
    @IInstantiationService instantiationService: IInstantiationServiceType,
  ) {
    super();

    const root = document.getElementById("root");
    if (!root) {
      throw new Error('Root element with id "root" was not found.');
    }

    this.workbench = this._register(new Workbench(root, {
      instantiationService,
      onDidRenderInitialWorkbench: () => markBootUiReady("workbench"),
    }));
    this._register(CommandsRegistry.registerCommand({
      id: WorkbenchLayoutCommandId.resetLayoutState,
      handler: () => this.workbench.resetLayoutState(),
      metadata: {
        description: localize("workbench.commands.resetLayoutState", "Reset workbench layout state"),
      },
    }));
  }

  public get contentElement(): HTMLElement {
    return this.workbench.contentElement;
  }
}

function registerContainer(id: string, title: string, location: ViewContainerLocation): ViewContainer {
  const isAuxiliaryBar = location === ViewContainerLocation.AuxiliaryBar;
  const isSidebar = id === WorkbenchViewContainers.files ||
    id === WorkbenchViewContainers.thumbnail ||
    id === WorkbenchViewContainers.settingsNavigation;
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
