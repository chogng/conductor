import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { Categories } from "src/cs/platform/action/common/actionCommonCategories";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { WorkbenchLayoutCommandId } from "src/cs/workbench/browser/actions/layoutCommands";
import { SideBarVisibleContext } from "src/cs/workbench/common/contextkeys";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";

export const WORKBENCH_SIDEBAR_TOGGLE_BUTTON_ID =
  "workbench-titlebar-sidebar-toggle-button";

export type WorkbenchSidebarToggleButton = {
  readonly commandId: string;
  readonly id: string;
  readonly icon: LxIconDefinition;
  readonly isActive: boolean;
  readonly title: string;
};

export const createWorkbenchSidebarToggleButton = (
  isVisible: boolean,
): WorkbenchSidebarToggleButton => ({
  commandId: WorkbenchLayoutCommandId.toggleSidebar,
  id: WORKBENCH_SIDEBAR_TOGGLE_BUTTON_ID,
  icon: isVisible
    ? LxIcon.layoutSidebarLeftEmpty
    : LxIcon.layoutSidebarLeftOffEmpty,
  isActive: isVisible,
  title: isVisible
    ? localize("sidebar.hide", "Hide Side Bar")
    : localize("sidebar.show", "Show Side Bar"),
});

registerAction2(class extends Action2 {
  public constructor() {
    super({
      id: "workbench.action.closeSidebar",
      title: localize("sidebar.close", "Close Primary Side Bar"),
      category: Categories.View,
      f1: true,
      precondition: SideBarVisibleContext,
      metadata: {
        description: localize("sidebar.closeDescription", "Close the primary side bar."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.SIDEBAR_PART);
  }
});
