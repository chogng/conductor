import "./media/titlebar.css";
import type { CSSProperties } from "react";
import type { TranslateFn } from "../../../../context/language";

export const WORKBENCH_TITLEBAR_APP_ICON_SRC =
  "data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='1' y='1' width='14' height='14' rx='2' fill='black'/%3E%3Crect x='9' y='9' width='4' height='4' rx='1' fill='white'/%3E%3Crect x='3' y='3' width='4' height='4' rx='1' fill='white'/%3E%3Crect x='9' y='3' width='4' height='4' rx='1' fill='white'/%3E%3Crect x='3' y='9' width='4' height='4' rx='1' fill='white'/%3E%3Cpath d='M4 12L12 4' stroke='white' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E";
export const WORKBENCH_TITLEBAR_APP_NAME = "Conductor Studio";
export const WORKBENCH_TITLEBAR_DRAG_REGION_STYLE = {
  WebkitAppRegion: "drag",
} as CSSProperties;

export type WorkbenchTitlebarActivePage =
  | "data"
  | "analysis"
  | "settings"
  | string;

export type WorkbenchTitlebarAnalysisFileOption = {
  value: string;
  label: string;
};

export type WorkbenchTitlebarUpdateAction = {
  isVisible: boolean;
  isReadyToInstall?: boolean;
  version?: string | null;
  onClick?: () => void;
};

export type WorkbenchTitlebarNavAction = {
  id: string;
  title: string;
  isDisabled: boolean;
};

export type WorkbenchTitlebarPageAction = {
  id: "data" | "analysis" | "origin" | "settings";
  title: string;
  isActive: boolean;
};

export type WorkbenchTitlebarWindowAction = {
  id: "minimize" | "maximize" | "close";
  title: string;
  isDanger?: boolean;
};

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
    id: "device-analysis-window-nav-back-btn",
    title: t("da_menu_page_back"),
    isDisabled: !canNavigateBack,
  },
  {
    id: "device-analysis-window-nav-forward-btn",
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
    title: t("da_tab_analysis"),
    isActive: activePage === "analysis",
  },
  {
    id: "origin",
    title: t("da_open_in_origin"),
    isActive: false,
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
