import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { Categories } from "src/cs/platform/action/common/actionCommonCategories";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { WorkbenchLayoutCommandId } from "src/cs/workbench/browser/actions/layoutCommands";
import {
  AuxiliaryBarVisibleContext,
  SideBarVisibleContext,
} from "src/cs/workbench/common/contextkeys";
import { ViewContainerLocation } from "src/cs/workbench/common/views";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";

export const WORKBENCH_LAYOUT_SIDEBAR_TOGGLE_BUTTON_ID =
  "workbench-titlebar-sidebar-toggle-button";
export const WORKBENCH_LAYOUT_AUXILIARY_BAR_TOGGLE_BUTTON_ID =
  "workbench-titlebar-auxiliarybar-toggle-button";

export type WorkbenchLayoutToggleButton = {
  readonly commandId: string;
  readonly icon: LxIconDefinition;
  readonly id: string;
  readonly isActive: boolean;
  readonly title: string;
};

export const createWorkbenchLayoutSidebarToggleButton = (
  isVisible: boolean,
): WorkbenchLayoutToggleButton => ({
  commandId: WorkbenchLayoutCommandId.toggleSidebar,
  icon: isVisible
    ? LxIcon.layoutSidebarLeftEmpty
    : LxIcon.layoutSidebarLeftOffEmpty,
  id: WORKBENCH_LAYOUT_SIDEBAR_TOGGLE_BUTTON_ID,
  isActive: isVisible,
  title: isVisible
    ? localize("sidebar.hide", "Hide Side Bar")
    : localize("sidebar.show", "Show Side Bar"),
});

export const createWorkbenchLayoutAuxiliaryBarToggleButton = (
  isVisible: boolean,
): WorkbenchLayoutToggleButton => ({
  commandId: WorkbenchLayoutCommandId.toggleAuxiliaryBar,
  icon: isVisible
    ? LxIcon.layoutSidebarRightEmpty
    : LxIcon.layoutSidebarRightOffEmpty,
  id: WORKBENCH_LAYOUT_AUXILIARY_BAR_TOGGLE_BUTTON_ID,
  isActive: isVisible,
  title: isVisible
    ? localize("titlebar.auxiliaryBar.hide", "Hide Secondary Side Bar")
    : localize("titlebar.auxiliaryBar.show", "Show Secondary Side Bar"),
});

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
    accessor.get(IViewsService).navigateViewContainerBack(ViewContainerLocation.Panel);
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
    accessor.get(IViewsService).navigateViewContainerForward(ViewContainerLocation.Panel);
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
    void accessor.get(IViewsService).openViewContainer(
      TableViewContainerId,
    );
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
    void accessor.get(IViewsService).openViewContainer(
      ChartViewContainerId,
    );
  }
}

class ToggleSidebarAction extends Action2 {
  public constructor() {
    super({
      id: WorkbenchLayoutCommandId.toggleSidebar,
      title: localize("workbench.toggleSidebar", "Toggle Sidebar"),
      category: Categories.View,
      f1: true,
      toggled: SideBarVisibleContext.isEqualTo(true),
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
      toggled: AuxiliaryBarVisibleContext.isEqualTo(true),
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
