import "./media/sidebarpart.css";
import type { ReactNode } from "react";

export const WORKBENCH_SIDEBAR_WIDTH_CSS_VAR = "--sidebar-width";

export type WorkbenchSidebarBadge = {
  text: string;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
};

export type WorkbenchSidebarAction = {
  id: string;
  title: string;
  isActive?: boolean;
  isDisabled?: boolean;
  isDanger?: boolean;
  icon?: ReactNode;
  badge?: WorkbenchSidebarBadge;
};

export type WorkbenchSidebarHeaderAction = WorkbenchSidebarAction & {
  kind?: "primary" | "secondary" | "icon";
};

export type WorkbenchSidebarSection = {
  id: string;
  title: string;
  description?: string;
  actions?: WorkbenchSidebarAction[];
  badge?: WorkbenchSidebarBadge;
};

export type WorkbenchSidebarPartState = {
  id?: string;
  className?: string;
  title?: string;
  description?: string;
  badge?: WorkbenchSidebarBadge;
  labelledBy?: string;
  sections?: WorkbenchSidebarSection[];
  headerActions?: WorkbenchSidebarHeaderAction[];
  isResizing?: boolean;
  widthPx?: number;
};

export type WorkbenchSidebarActionHandler = (
  action: WorkbenchSidebarAction,
) => void;

export const getWorkbenchSidebarWidthStyle = (
  widthPx: number | undefined,
): Record<string, string> | undefined => {
  if (!Number.isFinite(widthPx) || typeof widthPx !== "number") {
    return undefined;
  }

  return {
    [WORKBENCH_SIDEBAR_WIDTH_CSS_VAR]: `${widthPx}px`,
  };
};
