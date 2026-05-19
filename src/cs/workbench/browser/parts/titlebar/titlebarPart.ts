import "./media/titlebar.css";
import type { CSSProperties } from "react";

const WORKBENCH_TITLEBAR_APP_ICON_SVG =
  "<svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'><g clip-path='url(#clip0_603_2)'><path d='M7.91992 1.02246C9.4735 1.02257 10.9072 1.53174 12.0665 2.39069C12.2996 2.56345 12.3108 2.90112 12.1056 3.10632L10.6672 4.54471C10.4891 4.72286 10.2078 4.73751 9.99299 4.60591C9.3893 4.2361 8.67972 4.02256 7.91992 4.02246C5.72275 4.02246 3.94141 5.8038 3.94141 8.00098C3.94167 10.1979 5.72291 11.9795 7.91992 11.9795C8.67978 11.9794 9.38932 11.7652 9.99302 11.3952C10.2078 11.2635 10.4891 11.2781 10.6672 11.4563L12.1056 12.8947C12.3108 13.0999 12.2996 13.4375 12.0665 13.6103C10.9072 14.4695 9.47358 14.9794 7.91992 14.9795C4.06605 14.9795 0.941667 11.8548 0.941406 8.00098C0.941406 4.14695 4.06589 1.02246 7.91992 1.02246Z' fill='url(#paint0_linear_603_2)'/><path d='M14 0.75C14.6904 0.75 15.25 1.30964 15.25 2V4.75781C15.2499 5.88482 14.8018 6.96577 14.0049 7.7627L13.7676 8L14.0049 8.2373C14.8018 9.03423 15.2499 10.1152 15.25 11.2422V14C15.25 14.6904 14.6904 15.25 14 15.25C13.3096 15.25 12.75 14.6904 12.75 14V11.2422C12.7499 10.7782 12.5654 10.333 12.2373 10.0049L11.4824 9.25H9.55957C9.19302 9.70674 8.6312 10 8 10C6.89543 10 6 9.10457 6 8C6 6.89543 6.89543 6 8 6C8.6312 6 9.19302 6.29326 9.55957 6.75H11.4824L12.2373 5.99512C12.5654 5.66704 12.7499 5.22178 12.75 4.75781V2C12.75 1.30964 13.3096 0.75 14 0.75Z' fill='url(#paint1_linear_603_2)'/></g><defs><linearGradient id='paint0_linear_603_2' x1='6.59619' y1='1.02246' x2='6.59619' y2='14.9795' gradientUnits='userSpaceOnUse'><stop stop-color='#DDB5FF'/><stop offset='0.490385' stop-color='#7252FF'/><stop offset='1' stop-color='#1B2AFF'/></linearGradient><linearGradient id='paint1_linear_603_2' x1='8' y1='6' x2='8' y2='10' gradientUnits='userSpaceOnUse'><stop stop-color='#DFBBFF'/><stop offset='1' stop-color='#0D00FF'/></linearGradient><clipPath id='clip0_603_2'><rect width='16' height='16' fill='white'/></clipPath></defs></svg>";
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
  id: "data" | "analysis" | "settings";
  title: string;
  isActive: boolean;
};

export type WorkbenchTitlebarWindowAction = {
  id: "minimize" | "maximize" | "close";
  title: string;
  isDanger?: boolean;
};
