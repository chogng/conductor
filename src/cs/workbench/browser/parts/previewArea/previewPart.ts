import { jsx, jsxs } from "react/jsx-runtime";
import type { ReactNode } from "react";
import Button from "src/cs/base/browser/ui/button/button";
import {
  getWorkbenchPreviewAreaActionClassName,
  normalizeWorkbenchPreviewAreaHeaderActions,
} from "src/cs/workbench/browser/parts/previewArea/previewActions";

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

export type PreviewPartProps = WorkbenchPreviewAreaPartState & {
  ariaLabel?: string;
  children?: ReactNode;
  onAction?: WorkbenchPreviewAreaActionHandler;
};

const renderPreviewAreaBadge = (badge: WorkbenchPreviewAreaBadge | undefined) => {
  if (!badge) {
    return null;
  }

  return jsx("span", {
    className: "workbench_preview_area_badge",
    "data-tone": badge.tone ?? "default",
    children: badge.text,
  });
};

const renderPreviewAreaAction = (
  action: WorkbenchPreviewAreaAction,
  onAction: WorkbenchPreviewAreaActionHandler | undefined,
  kind?: WorkbenchPreviewAreaHeaderAction["kind"],
) => {
  if (kind === "icon") {
    return jsx(Button, {
      id: action.id,
      variant: "ghost",
      size: "iconSm",
      className: "workbench_preview_area_header_icon_btn",
      disabled: action.isDisabled,
      onClick: () => onAction?.(action),
      title: action.title,
      "aria-label": action.title,
      children: action.icon,
    });
  }

  if (kind) {
    return jsx(Button, {
      id: action.id,
      variant: kind === "primary" ? "primary" : "ghost",
      size: "sm",
      className: "workbench_preview_area_header_btn",
      disabled: action.isDisabled,
      onClick: () => onAction?.(action),
      title: action.title,
      dataIcon: action.icon ? "with" : undefined,
      children: [
        action.icon
          ? jsx("span", {
              className: "shrink-0",
              "aria-hidden": "true",
              children: action.icon,
            })
          : null,
        jsx("span", {
          className: "min-w-0 truncate text-left",
          children: action.title,
        }),
      ],
    });
  }

  return jsxs("button", {
    id: action.id,
    type: "button",
    className: getWorkbenchPreviewAreaActionClassName(action),
    disabled: action.isDisabled,
    onClick: () => onAction?.(action),
    title: action.title,
    children: [
      action.icon
        ? jsx("span", {
            className: "shrink-0",
            "aria-hidden": "true",
            children: action.icon,
          })
        : null,
      jsx("span", {
        className: "min-w-0 truncate text-left",
        children: action.title,
      }),
      renderPreviewAreaBadge(action.badge),
    ],
  });
};

const PreviewPart = ({
  ariaLabel,
  badge,
  children,
  className = "",
  description,
  headerActions,
  id,
  isBusy = false,
  labelledBy,
  onAction,
  title,
}: PreviewPartProps) => {
  const normalizedHeaderActions =
    normalizeWorkbenchPreviewAreaHeaderActions(headerActions);
  const hasHeaderContent = Boolean(title || description || badge);

  return jsxs("section", {
    id,
    "aria-busy": isBusy ? "true" : undefined,
    "aria-label": ariaLabel,
    "aria-labelledby": labelledBy,
    className: `workbench_preview_area_part ${className}`.trim(),
    children: [
      hasHeaderContent || normalizedHeaderActions.length > 0
        ? jsxs("div", {
            className: `workbench_preview_area_header ${!hasHeaderContent ? "workbench_preview_area_header--actions-only" : ""}`.trim(),
            children: [
              title || description || badge
                ? jsxs("div", {
                    className: "workbench_preview_area_header_main",
                    children: [
                      title
                        ? jsx("h2", {
                            className: "workbench_preview_area_title",
                            children: title,
                          })
                        : null,
                      description
                        ? jsx("p", {
                            className: "workbench_preview_area_description",
                            children: description,
                          })
                        : null,
                      renderPreviewAreaBadge(badge),
                    ],
                  })
                : null,
              normalizedHeaderActions.length > 0
                ? jsx("div", {
                    className: "workbench_preview_area_header_actions",
                    children: normalizedHeaderActions.map((action) =>
                      renderPreviewAreaAction(action, onAction, action.kind),
                    ),
                  })
                : null,
            ],
          })
        : null,
      jsx("div", {
        className: "workbench_preview_area_content",
        children,
      }),
    ],
  });
};

export default PreviewPart;
