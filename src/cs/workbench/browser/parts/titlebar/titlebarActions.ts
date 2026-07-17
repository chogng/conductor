import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import {
  NAVIGATE_BACK_COMMAND_ID,
  NAVIGATE_FORWARD_COMMAND_ID,
  SHOW_CHART_COMMAND_ID,
  SHOW_TABLE_COMMAND_ID,
} from "src/cs/workbench/browser/actions/layoutCommands";
import { QUICK_OPEN_COMMAND_ID } from "src/cs/workbench/contrib/quickaccess/common/quickAccessCommands";
import { SHOW_SETTINGS_COMMAND_ID } from "src/cs/workbench/contrib/settings/browser/settingsActions";
import { SettingsViewContainerId } from "src/cs/workbench/contrib/settings/common/settings";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";

export const WORKBENCH_TITLEBAR_UPDATE_BUTTON_ID =
  "workbench-titlebar-update-button";
export const WORKBENCH_TITLEBAR_QUICK_ACCESS_BUTTON_ID =
  "workbench-titlebar-quick-access-button";
export type WorkbenchTitlebarPageId = "table" | "chart" | "settings";

export const WORKBENCH_TITLEBAR_PAGE_BUTTON_IDS: Record<WorkbenchTitlebarPageId, string> = {
  table: "workbench-titlebar-table-button",
  chart: "workbench-titlebar-chart-button",
  settings: "workbench-titlebar-settings-button",
};

export const WorkbenchTitlebarNavButtonIds = {
  back: "workbench-titlebar-nav-back-button",
  forward: "workbench-titlebar-nav-forward-button",
} as const;

export type WorkbenchTitlebarNavButton = {
  readonly commandId: string;
  readonly id: string;
  readonly title: string;
  readonly isDisabled: boolean;
};

export type WorkbenchTitlebarPageButton = {
  readonly commandId: string;
  readonly id: WorkbenchTitlebarPageId;
  readonly title: string;
  readonly isActive: boolean;
};

export type WorkbenchTitlebarQuickAccessButton = {
  readonly commandId: string;
  readonly icon: LxIcon;
  readonly id: string;
  readonly title: string;
};

export type WorkbenchTitlebarActivePage = string;

export type WorkbenchTitlebarUpdateInfo = {
  readonly label?: string | null;
  readonly progressPercent?: number | null;
  readonly tooltip?: string | null;
  readonly version?: string | null;
};

export const createWorkbenchTitlebarNavButtons = (
  canNavigateBack: boolean,
  canNavigateForward: boolean,
): WorkbenchTitlebarNavButton[] => [
  {
    commandId: NAVIGATE_BACK_COMMAND_ID,
    id: WorkbenchTitlebarNavButtonIds.back,
    title: localize("menu.page.back", "Back"),
    isDisabled: !canNavigateBack,
  },
  {
    commandId: NAVIGATE_FORWARD_COMMAND_ID,
    id: WorkbenchTitlebarNavButtonIds.forward,
    title: localize("menu.page.forward", "Forward"),
    isDisabled: !canNavigateForward,
  },
];

export const createWorkbenchTitlebarPageButtons = (
  activePage: WorkbenchTitlebarActivePage,
): WorkbenchTitlebarPageButton[] => [
  {
    commandId: SHOW_TABLE_COMMAND_ID,
    id: "table",
    title: localize("titlebar.mode.table", "Table"),
    isActive: activePage === TableViewContainerId,
  },
  {
    commandId: SHOW_CHART_COMMAND_ID,
    id: "chart",
    title: localize("titlebar.mode.chart", "Chart"),
    isActive: activePage === ChartViewContainerId,
  },
  {
    commandId: SHOW_SETTINGS_COMMAND_ID,
    id: "settings",
    title: localize("titlebar.mode.settings", "Settings"),
    isActive: activePage === SettingsViewContainerId,
  },
];

export const createWorkbenchTitlebarQuickAccessButton =
(): WorkbenchTitlebarQuickAccessButton => ({
  commandId: QUICK_OPEN_COMMAND_ID,
  icon: LxIcon.search,
  id: WORKBENCH_TITLEBAR_QUICK_ACCESS_BUTTON_ID,
  title: localize("titlebar.quickAccess", "Search commands/files"),
});

export const getWorkbenchTitlebarUpdateLabel = (
  updateAction?: WorkbenchTitlebarUpdateInfo,
): string => {
  const label = updateAction?.label?.trim();
  return label || localize("menu.update.available", "Update");
};

export const getWorkbenchTitlebarUpdateTitle = (
  updateAction?: WorkbenchTitlebarUpdateInfo,
): string => {
  const tooltip = updateAction?.tooltip?.trim();
  if (tooltip) {
    return tooltip;
  }

  const label = getWorkbenchTitlebarUpdateLabel(updateAction);
  const version =
    typeof updateAction?.version === "string" && updateAction.version.trim()
      ? updateAction.version.trim()
      : "";

  return version ? `${label} (${version})` : label;
};
