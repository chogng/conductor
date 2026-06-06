import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";

export const ToggleSidebarActionId = "workbench-titlebar-sidebar-toggle-button";

export type WorkbenchSidebarToggleAction = {
  readonly id: string;
  readonly icon: LxIconDefinition;
  readonly isActive: boolean;
  readonly title: string;
};

export const createWorkbenchSidebarToggleAction = (
  isVisible: boolean,
): WorkbenchSidebarToggleAction => ({
  id: ToggleSidebarActionId,
  icon: LxIcon.layoutSidebarLeftEmpty,
  isActive: isVisible,
  title: isVisible
    ? localize("sidebar.hide", "Hide Side Bar")
    : localize("sidebar.show", "Show Side Bar"),
});
