import { localize } from "src/cs/nls";
import { Categories } from "src/cs/platform/action/common/actionCommonCategories";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { WorkbenchLayoutCommandId } from "src/cs/workbench/browser/actions/layoutCommands";
import {
  AuxiliaryBarVisibleContext,
  SideBarVisibleContext,
} from "src/cs/workbench/common/contextkeys";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";

class NavigateBackAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchLayoutCommandId.navigateBack,
      title: localize("workbench.navigateBack", "Back"),
      f1: true,
      metadata: {
        description: localize("workbench.navigateBackDescription", "Navigate to the previous workbench view."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    accessor.get(IWorkbenchLayoutService).navigateBack();
  }
}

class NavigateForwardAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchLayoutCommandId.navigateForward,
      title: localize("workbench.navigateForward", "Forward"),
      f1: true,
      metadata: {
        description: localize("workbench.navigateForwardDescription", "Navigate to the next workbench view."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    accessor.get(IWorkbenchLayoutService).navigateForward();
  }
}

class ShowTableAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchLayoutCommandId.showTable,
      title: localize("workbench.mode.table", "Table"),
      f1: true,
      metadata: {
        description: localize("workbench.showTableDescription", "Show the table workbench view."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    accessor.get(IWorkbenchLayoutService).navigateToView("table");
  }
}

class ShowChartAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchLayoutCommandId.showChart,
      title: localize("workbench.mode.chart", "Chart"),
      f1: true,
      metadata: {
        description: localize("workbench.showChartDescription", "Show the chart workbench view."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    accessor.get(IWorkbenchLayoutService).navigateToView("chart");
  }
}

class ToggleSidebarAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchLayoutCommandId.toggleSidebar,
      title: localize("workbench.toggleSidebar", "Toggle Sidebar"),
      category: Categories.View,
      f1: true,
      toggled: SideBarVisibleContext,
      metadata: {
        description: localize("workbench.toggleSidebarDescription", "Toggle the workbench sidebar."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    layoutService.setPartHidden(
      layoutService.isVisible(Parts.SIDEBAR_PART),
      Parts.SIDEBAR_PART,
    );
  }
}

class ToggleAuxiliaryBarAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchLayoutCommandId.toggleAuxiliaryBar,
      title: localize("workbench.toggleAuxiliaryBar", "Toggle Secondary Side Bar"),
      category: Categories.View,
      f1: true,
      toggled: AuxiliaryBarVisibleContext,
      metadata: {
        description: localize("workbench.toggleAuxiliaryBarDescription", "Toggle the secondary side bar."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    layoutService.setPartHidden(
      layoutService.isVisible(Parts.AUXILIARYBAR_PART),
      Parts.AUXILIARYBAR_PART,
    );
  }
}

registerAction2(NavigateBackAction);
registerAction2(NavigateForwardAction);
registerAction2(ShowTableAction);
registerAction2(ShowChartAction);
registerAction2(ToggleSidebarAction);
registerAction2(ToggleAuxiliaryBarAction);
