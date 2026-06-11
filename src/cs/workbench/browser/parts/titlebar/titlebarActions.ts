import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import {
  closeWindow,
  minimizeWindow,
  toggleWindowMaximized,
} from "src/cs/workbench/browser/actions/windowActions";

export const WorkbenchCommandId = {
  navigateBack: "workbench.action.navigateBack",
  navigateForward: "workbench.action.navigateForward",
  showTable: "workbench.action.showTable",
  showChart: "workbench.action.showChart",
  toggleSidebar: "workbench.action.toggleSidebar",
  minimizeWindow: "workbench.action.minimizeWindow",
  toggleMaximizeWindow: "workbench.action.toggleMaximizeWindow",
  closeWindow: "workbench.action.closeWindow",
} as const;

class NavigateBackAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchCommandId.navigateBack,
      title: localize("titlebar.navigateBack", "Back"),
      metadata: {
        description: localize("titlebar.navigateBackDescription", "Navigate to the previous workbench view."),
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
      id: WorkbenchCommandId.navigateForward,
      title: localize("titlebar.navigateForward", "Forward"),
      metadata: {
        description: localize("titlebar.navigateForwardDescription", "Navigate to the next workbench view."),
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
      id: WorkbenchCommandId.showTable,
      title: localize("titlebar.mode.table", "Table"),
      metadata: {
        description: localize("titlebar.showTableDescription", "Show the table workbench view."),
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
      id: WorkbenchCommandId.showChart,
      title: localize("titlebar.mode.chart", "Chart"),
      metadata: {
        description: localize("titlebar.showChartDescription", "Show the chart workbench view."),
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
      id: WorkbenchCommandId.toggleSidebar,
      title: localize("titlebar.toggleSidebar", "Toggle Sidebar"),
      metadata: {
        description: localize("titlebar.toggleSidebarDescription", "Toggle the workbench sidebar."),
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

class MinimizeWindowAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchCommandId.minimizeWindow,
      title: localize("menu_window_minimize", "Minimize Window"),
      metadata: {
        description: localize("titlebar.minimizeWindowDescription", "Minimize the current window."),
      },
    });
  }

  public run(): void {
    minimizeWindow();
  }
}

class ToggleMaximizeWindowAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchCommandId.toggleMaximizeWindow,
      title: localize("menu_window_maximize", "Maximize / Restore"),
      metadata: {
        description: localize("titlebar.toggleMaximizeWindowDescription", "Maximize or restore the current window."),
      },
    });
  }

  public run(): void {
    toggleWindowMaximized();
  }
}

class CloseWindowAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchCommandId.closeWindow,
      title: localize("menu_window_close", "Close Window"),
      metadata: {
        description: localize("titlebar.closeWindowDescription", "Close the current window."),
      },
    });
  }

  public run(): void {
    closeWindow();
  }
}

registerAction2(NavigateBackAction);
registerAction2(NavigateForwardAction);
registerAction2(ShowTableAction);
registerAction2(ShowChartAction);
registerAction2(ToggleSidebarAction);
registerAction2(MinimizeWindowAction);
registerAction2(ToggleMaximizeWindowAction);
registerAction2(CloseWindowAction);
