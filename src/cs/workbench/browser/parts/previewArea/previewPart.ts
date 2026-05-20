import "./media/previewpart.css";
import type { ReactNode } from "react";

export type WorkbenchPreviewAreaBadge = {
  text: string;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
};

export type WorkbenchPreviewAreaAction = {
  id: string;
  title: string;
  isActive?: boolean;
  isDisabled?: boolean;
  isDanger?: boolean;
  icon?: ReactNode;
  badge?: WorkbenchPreviewAreaBadge;
};

export type WorkbenchPreviewAreaHeaderAction = WorkbenchPreviewAreaAction & {
  kind?: "primary" | "secondary" | "icon";
};

export type WorkbenchPreviewAreaPartState = {
  id?: string;
  className?: string;
  title?: string;
  description?: string;
  badge?: WorkbenchPreviewAreaBadge;
  labelledBy?: string;
  headerActions?: WorkbenchPreviewAreaHeaderAction[];
  isBusy?: boolean;
};

export type WorkbenchPreviewAreaActionHandler = (
  action: WorkbenchPreviewAreaAction,
) => void;
