import "./media/titlebar.css";
import type { CSSProperties } from "react";
import type { TranslateFn } from "../../../../context/language";

const WORKBENCH_TITLEBAR_APP_ICON_SVG =
  "<svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'><g clip-path='url(#clip0_592_59)'><path d='M7.91992 1.02246C9.4735 1.02257 10.9072 1.53174 12.0665 2.39069C12.2996 2.56345 12.3108 2.90112 12.1056 3.10632L10.6672 4.54471C10.4891 4.72286 10.2078 4.73751 9.99299 4.60591C9.3893 4.2361 8.67972 4.02256 7.91992 4.02246C5.72275 4.02246 3.94141 5.8038 3.94141 8.00098C3.94167 10.1979 5.72291 11.9795 7.91992 11.9795C8.67978 11.9794 9.38932 11.7652 9.99302 11.3952C10.2078 11.2635 10.4891 11.2781 10.6672 11.4563L12.1056 12.8947C12.3108 13.0999 12.2996 13.4375 12.0665 13.6103C10.9072 14.4695 9.47358 14.9794 7.91992 14.9795C4.06605 14.9795 0.941667 11.8548 0.941406 8.00098C0.941406 4.14695 4.06589 1.02246 7.91992 1.02246Z' fill='url(#paint0_linear_592_59)'/><path d='M8 8H12M12 8L13.1213 6.87868C13.6839 6.31607 14 5.55301 14 4.75736V2M12 8L13.1213 9.12132C13.6839 9.68393 14 10.447 14 11.2426V14' stroke='url(#paint1_linear_592_59)' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/><path d='M10 8C10 9.10457 9.10457 10 8 10C6.89543 10 6 9.10457 6 8C6 6.89543 6.89543 6 8 6C9.10457 6 10 6.89543 10 8Z' fill='url(#paint2_linear_592_59)'/></g><defs><linearGradient id='paint0_linear_592_59' x1='6.59619' y1='1.02246' x2='6.59619' y2='14.9795' gradientUnits='userSpaceOnUse'><stop stop-color='#69FFF2'/><stop offset='1' stop-color='#1B2AFF'/></linearGradient><linearGradient id='paint1_linear_592_59' x1='11' y1='6' x2='11' y2='10' gradientUnits='userSpaceOnUse'><stop stop-color='#69FFF2'/><stop offset='1' stop-color='#0D00FF'/></linearGradient><linearGradient id='paint2_linear_592_59' x1='8' y1='6' x2='8' y2='10' gradientUnits='userSpaceOnUse'><stop stop-color='#69FFF2'/><stop offset='1' stop-color='#0D00FF'/></linearGradient><clipPath id='clip0_592_59'><rect width='16' height='16' fill='white'/></clipPath></defs></svg>";
export const WORKBENCH_TITLEBAR_APP_ICON_SRC =
  `data:image/svg+xml,${encodeURIComponent(WORKBENCH_TITLEBAR_APP_ICON_SVG)}`;
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
