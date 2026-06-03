import { localize } from "src/cs/nls";
import type {
  WorkbenchTitlebarActivePage,
  WorkbenchTitlebarAnalysisFileOption,
  WorkbenchTitlebarNavAction,
  WorkbenchTitlebarPageAction,
  WorkbenchTitlebarUpdateAction,
  WorkbenchTitlebarWindowAction,
} from "src/cs/workbench/browser/parts/titlebar/titlebarPart";

export const normalizeWorkbenchTitlebarAnalysisFileOptions = (
  options: WorkbenchTitlebarAnalysisFileOption[] | undefined,
): WorkbenchTitlebarAnalysisFileOption[] =>
  Array.isArray(options)
    ? options.filter(
        (option) =>
          !!option &&
          typeof option.value === "string" &&
          typeof option.label === "string",
      )
    : [];

export const createWorkbenchTitlebarNavActions = (
  canNavigateBack: boolean,
  canNavigateForward: boolean,
): WorkbenchTitlebarNavAction[] => [
  {
    id: "analysis-window-nav-back-btn",
    title: localize("da_menu_page_back", "Back"),
    isDisabled: !canNavigateBack,
  },
  {
    id: "analysis-window-nav-forward-btn",
    title: localize("da_menu_page_forward", "Forward"),
    isDisabled: !canNavigateForward,
  },
];

export const createWorkbenchTitlebarPageActions = (
  activePage: WorkbenchTitlebarActivePage,
): WorkbenchTitlebarPageAction[] => [
  {
    id: "data",
    title: localize("da_tab_data", "Import & Extraction"),
    isActive: activePage === "data",
  },
  {
    id: "analysis",
    title: localize("analysis.visualization", "Analysis & Visualization"),
    isActive: activePage === "analysis",
  },
  {
    id: "settings",
    title: localize("da_settings_title", "Settings"),
    isActive: activePage === "settings",
  },
];

export const createWorkbenchTitlebarWindowActions =
(): WorkbenchTitlebarWindowAction[] => [
  {
    id: "minimize",
    title: localize("da_menu_window_minimize", "Minimize Window"),
  },
  {
    id: "maximize",
    title: localize("da_menu_window_maximize", "Maximize / Restore"),
  },
  {
    id: "close",
    title: localize("da_menu_window_close", "Close Window"),
    isDanger: true,
  },
];

export const getWorkbenchTitlebarUpdateLabel = (): string =>
  localize("da_menu_update_available", "Update");

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
