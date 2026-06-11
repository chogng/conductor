import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";

export const WorkbenchLayoutCommandId = {
  navigateBack: "workbench.action.navigateBack",
  navigateForward: "workbench.action.navigateForward",
  showTable: "workbench.action.showTable",
  showChart: "workbench.action.showChart",
  toggleSidebar: "workbench.action.toggleSidebar",
} as const;

class NavigateBackAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchLayoutCommandId.navigateBack,
      title: localize("workbench.navigateBack", "Back"),
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

registerAction2(NavigateBackAction);
registerAction2(NavigateForwardAction);
registerAction2(ShowTableAction);
registerAction2(ShowChartAction);
registerAction2(ToggleSidebarAction);
