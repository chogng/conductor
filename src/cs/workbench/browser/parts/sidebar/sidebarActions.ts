import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { WorkbenchLayoutCommandId } from "src/cs/workbench/browser/actions/layoutCommands";

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
  icon: LxIcon.layoutSidebarLeftEmpty,
  isActive: isVisible,
  title: isVisible
    ? localize("sidebar.hide", "Hide Side Bar")
    : localize("sidebar.show", "Show Side Bar"),
});
