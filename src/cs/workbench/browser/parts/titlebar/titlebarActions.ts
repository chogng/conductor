import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { WorkbenchLayoutCommandId } from "src/cs/workbench/browser/actions/layoutCommands";
import { createWorkbenchSidebarToggleButton } from "src/cs/workbench/browser/parts/sidebar/sidebarActions";
import { QuickAccessCommandId } from "src/cs/workbench/contrib/quickaccess/common/quickAccessCommands";
import type { LayoutView } from "src/cs/workbench/services/layout/browser/layoutService";
import type { WorkbenchTitlebarFileOption } from "src/cs/workbench/services/title/browser/titleService";

export const WORKBENCH_TITLEBAR_UPDATE_BUTTON_ID =
  "workbench-titlebar-update-button";
export const WORKBENCH_TITLEBAR_QUICK_ACCESS_BUTTON_ID =
  "workbench-titlebar-quick-access-button";
export const WORKBENCH_TITLEBAR_PAGE_BUTTON_IDS: Record<LayoutView, string> = {
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
  readonly id: LayoutView;
  readonly title: string;
  readonly isActive: boolean;
};

export type WorkbenchTitlebarSidebarButton = ReturnType<
  typeof createWorkbenchSidebarToggleButton
>;

export type WorkbenchTitlebarQuickAccessButton = {
  readonly commandId: string;
  readonly icon: LxIconDefinition;
  readonly id: string;
  readonly title: string;
};

export type WorkbenchTitlebarActivePage = LayoutView | string;

export type WorkbenchTitlebarUpdateInfo = {
  readonly version?: string | null;
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

export const createWorkbenchTitlebarSidebarButton = (
  isVisible: boolean,
): WorkbenchTitlebarSidebarButton =>
  createWorkbenchSidebarToggleButton(isVisible);

export const createWorkbenchTitlebarNavButtons = (
  canNavigateBack: boolean,
  canNavigateForward: boolean,
): WorkbenchTitlebarNavButton[] => [
  {
    commandId: WorkbenchLayoutCommandId.navigateBack,
    id: WorkbenchTitlebarNavButtonIds.back,
    title: localize("menu.page.back", "Back"),
    isDisabled: !canNavigateBack,
  },
  {
    commandId: WorkbenchLayoutCommandId.navigateForward,
    id: WorkbenchTitlebarNavButtonIds.forward,
    title: localize("menu.page.forward", "Forward"),
    isDisabled: !canNavigateForward,
  },
];

export const createWorkbenchTitlebarPageButtons = (
  activePage: WorkbenchTitlebarActivePage,
): WorkbenchTitlebarPageButton[] => [
  {
    commandId: WorkbenchLayoutCommandId.showTable,
    id: "table",
    title: localize("titlebar.mode.table", "Table"),
    isActive: activePage === "table",
  },
  {
    commandId: WorkbenchLayoutCommandId.showChart,
    id: "chart",
    title: localize("titlebar.mode.chart", "Chart"),
    isActive: activePage === "chart",
  },
  {
    commandId: WorkbenchLayoutCommandId.showSettings,
    id: "settings",
    title: localize("titlebar.mode.settings", "Settings"),
    isActive: activePage === "settings",
  },
];

export const createWorkbenchTitlebarQuickAccessButton =
(): WorkbenchTitlebarQuickAccessButton => ({
  commandId: QuickAccessCommandId.quickOpen,
  icon: LxIcon.search,
  id: WORKBENCH_TITLEBAR_QUICK_ACCESS_BUTTON_ID,
  title: localize("titlebar.quickAccess", "Search commands/files"),
});

export const getWorkbenchTitlebarUpdateLabel = (): string =>
  localize("menu.update.available", "Update");

export const getWorkbenchTitlebarUpdateTitle = (
  updateAction?: WorkbenchTitlebarUpdateInfo,
): string => {
  const label = getWorkbenchTitlebarUpdateLabel();
  const version =
    typeof updateAction?.version === "string" && updateAction.version.trim()
      ? updateAction.version.trim()
      : "";

  return version ? `${label} (${version})` : label;
};
