import type { TranslateFn } from "src/cs/platform/language/common/language";
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
  t: TranslateFn,
  canNavigateBack: boolean,
  canNavigateForward: boolean,
): WorkbenchTitlebarNavAction[] => [
  {
    id: "analysis-window-nav-back-btn",
    title: t("da_menu_page_back"),
    isDisabled: !canNavigateBack,
  },
  {
    id: "analysis-window-nav-forward-btn",
    title: t("da_menu_page_forward"),
    isDisabled: !canNavigateForward,
  },
];

export const createWorkbenchTitlebarPageActions = (
  t: TranslateFn,
  activePage: WorkbenchTitlebarActivePage,
): WorkbenchTitlebarPageAction[] => [
  {
    id: "data",
    title: t("da_tab_data"),
    isActive: activePage === "data",
  },
  {
    id: "analysis",
    title: t("analysis.visualization"),
    isActive: activePage === "analysis",
  },
  {
    id: "settings",
    title: t("da_settings_title"),
    isActive: activePage === "settings",
  },
];

export const createWorkbenchTitlebarWindowActions = (
  t: TranslateFn,
): WorkbenchTitlebarWindowAction[] => [
  {
    id: "minimize",
    title: t("da_menu_window_minimize"),
  },
  {
    id: "maximize",
    title: t("da_menu_window_maximize"),
  },
  {
    id: "close",
    title: t("da_menu_window_close"),
    isDanger: true,
  },
];

export const getWorkbenchTitlebarUpdateLabel = (t: TranslateFn): string =>
  t("da_menu_update_available");

export const getWorkbenchTitlebarUpdateTitle = (
  t: TranslateFn,
  updateAction?: WorkbenchTitlebarUpdateAction,
): string => {
  const label = getWorkbenchTitlebarUpdateLabel(t);
  const version =
    typeof updateAction?.version === "string" && updateAction.version.trim()
      ? updateAction.version.trim()
      : "";

  return version ? `${label} (${version})` : label;
};
