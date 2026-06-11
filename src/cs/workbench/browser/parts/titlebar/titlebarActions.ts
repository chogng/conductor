import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { QuickAccessCommandId } from "src/cs/workbench/contrib/quickaccess/common/quickAccessCommands";
import { createWorkbenchSidebarToggleAction } from "src/cs/workbench/browser/parts/sidebar/sidebarActions";
import type { LayoutView } from "src/cs/workbench/services/layout/browser/layoutService";
import type {
  WorkbenchTitlebarActivePage,
  WorkbenchTitlebarFileOption,
  WorkbenchTitlebarUpdateAction,
} from "src/cs/workbench/services/title/browser/titleService";

export const WORKBENCH_TITLEBAR_UPDATE_BUTTON_ID = "workbench-titlebar-update-button";
export const WORKBENCH_TITLEBAR_QUICK_ACCESS_BUTTON_ID = "workbench-titlebar-quick-access-button";
export const WORKBENCH_TITLEBAR_PAGE_BUTTON_IDS: Record<LayoutView, string> = {
  table: "workbench-titlebar-table-button",
  chart: "workbench-titlebar-chart-button",
  settings: "workbench-titlebar-settings-button",
};

export const WorkbenchTitlebarNavActionIds = {
  back: "workbench-titlebar-nav-back-button",
  forward: "workbench-titlebar-nav-forward-button",
} as const;

const WorkbenchTitlebarLayoutCommandId = {
  navigateBack: "workbench.action.navigateBack",
  navigateForward: "workbench.action.navigateForward",
  showTable: "workbench.action.showTable",
  showChart: "workbench.action.showChart",
  showSettings: "workbench.action.showSettings",
  toggleSidebar: "workbench.action.toggleSidebar",
} as const;

export type WorkbenchTitlebarNavAction = {
  readonly commandId: string;
  readonly id: string;
  readonly title: string;
  readonly isDisabled: boolean;
};

export type WorkbenchTitlebarPageAction = {
  readonly commandId: string;
  readonly id: LayoutView;
  readonly title: string;
  readonly isActive: boolean;
};

export type WorkbenchTitlebarSidebarAction = {
  readonly commandId: string;
  readonly icon: LxIconDefinition;
  readonly id: string;
  readonly isActive: boolean;
  readonly title: string;
};

export type WorkbenchTitlebarQuickAccessAction = {
  readonly commandId: string;
  readonly icon: LxIconDefinition;
  readonly id: string;
  readonly title: string;
};

export type WorkbenchTitlebarWindowAction = {
  readonly commandId: string;
  readonly id: "minimize" | "maximize" | "close";
  readonly title: string;
  readonly isDanger?: boolean;
};

export const normalizeWorkbenchTitlebarFileOptions = (
  options: WorkbenchTitlebarFileOption[] | undefined,
): WorkbenchTitlebarFileOption[] =>
  Array.isArray(options)
    ? options.filter(
        (option) =>
          !!option &&
          typeof option.value === "string" &&
          typeof option.label === "string",
      )
    : [];

export const createWorkbenchTitlebarSidebarAction = (
  isVisible: boolean,
): WorkbenchTitlebarSidebarAction => ({
  ...createWorkbenchSidebarToggleAction(isVisible),
  commandId: WorkbenchTitlebarLayoutCommandId.toggleSidebar,
});

export const createWorkbenchTitlebarNavActions = (
  canNavigateBack: boolean,
  canNavigateForward: boolean,
): WorkbenchTitlebarNavAction[] => [
  {
    commandId: WorkbenchTitlebarLayoutCommandId.navigateBack,
    id: WorkbenchTitlebarNavActionIds.back,
    title: localize("menu_page_back", "Back"),
    isDisabled: !canNavigateBack,
  },
  {
    commandId: WorkbenchTitlebarLayoutCommandId.navigateForward,
    id: WorkbenchTitlebarNavActionIds.forward,
    title: localize("menu_page_forward", "Forward"),
    isDisabled: !canNavigateForward,
  },
];

export const createWorkbenchTitlebarPageActions = (
  activePage: WorkbenchTitlebarActivePage,
): WorkbenchTitlebarPageAction[] => [
  {
    commandId: WorkbenchTitlebarLayoutCommandId.showTable,
    id: "table",
    title: localize("titlebar.mode.table", "Table"),
    isActive: activePage === "table",
  },
  {
    commandId: WorkbenchTitlebarLayoutCommandId.showChart,
    id: "chart",
    title: localize("titlebar.mode.chart", "Chart"),
    isActive: activePage === "chart",
  },
  {
    commandId: WorkbenchTitlebarLayoutCommandId.showSettings,
    id: "settings",
    title: localize("titlebar.mode.settings", "Settings"),
    isActive: activePage === "settings",
  },
];

export const createWorkbenchTitlebarQuickAccessAction =
(): WorkbenchTitlebarQuickAccessAction => ({
  commandId: QuickAccessCommandId.showCommands,
  icon: LxIcon.search,
  id: WORKBENCH_TITLEBAR_QUICK_ACCESS_BUTTON_ID,
  title: localize("titlebar.quickAccess", "Search Commands"),
});

export const createWorkbenchTitlebarWindowActions =
(): WorkbenchTitlebarWindowAction[] => [
  {
    commandId: "workbench.action.minimizeWindow",
    id: "minimize",
    title: localize("menu_window_minimize", "Minimize Window"),
  },
  {
    commandId: "workbench.action.toggleMaximizeWindow",
    id: "maximize",
    title: localize("menu_window_maximize", "Maximize / Restore"),
  },
  {
    commandId: "workbench.action.closeWindow",
    id: "close",
    title: localize("menu_window_close", "Close Window"),
    isDanger: true,
  },
];

export const getWorkbenchTitlebarUpdateLabel = (): string =>
  localize("menu_update_available", "Update");

export const getWorkbenchTitlebarUpdateTitle = (
  updateAction?: WorkbenchTitlebarUpdateAction,
): string => {
  const label = getWorkbenchTitlebarUpdateLabel();
  const version =
    typeof updateAction?.version === "string" && updateAction.version.trim()
      ? updateAction.version.trim()
      : "";

  return version ? `${label} (${version})` : label;
};
