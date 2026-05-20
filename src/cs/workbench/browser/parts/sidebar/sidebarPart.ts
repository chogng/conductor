import { jsx, jsxs } from "react/jsx-runtime";
import "./media/sidebarpart.css";
import { type CSSProperties, type ReactNode } from "react";
import Button from "src/cs/base/browser/ui/Button/Button";
import Sash, { type SashDragEvent } from "src/cs/base/browser/ui/sash/sash";
import {
  getWorkbenchSidebarActionClassName,
  normalizeWorkbenchSidebarHeaderActions,
  normalizeWorkbenchSidebarSections,
} from "src/cs/workbench/browser/parts/sidebar/sidebarActions";

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

export type SidebarPartProps = WorkbenchSidebarPartState & {
  ariaLabel?: string;
  children?: ReactNode;
  onAction?: WorkbenchSidebarActionHandler;
  onStartResizing?: (event: SashDragEvent) => void;
  style?: CSSProperties;
};

const renderSidebarBadge = (badge: WorkbenchSidebarBadge | undefined) => {
  if (!badge) {
    return null;
  }

  return jsx("span", {
    className: "workbench_sidebar_badge",
    "data-tone": badge.tone ?? "default",
    children: badge.text,
  });
};

const renderSidebarAction = (
  action: WorkbenchSidebarAction,
  onAction: WorkbenchSidebarActionHandler | undefined,
  kind?: WorkbenchSidebarHeaderAction["kind"],
) => {
  if (kind) {
    if (kind === "icon") {
      return jsx(Button, {
        id: action.id,
        variant: "ghost",
        size: "iconSm",
        className: "workbench_sidebar_header_icon_btn",
        disabled: action.isDisabled,
        onClick: () => onAction?.(action),
        title: action.title,
        "aria-label": action.title,
        children: action.icon,
      });
    }

    return jsx(Button, {
      id: action.id,
      variant: kind === "primary" ? "primary" : "ghost",
      size: "sm",
      className: "workbench_sidebar_header_btn",
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
    className: getWorkbenchSidebarActionClassName(action),
    "data-kind": kind,
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
      renderSidebarBadge(action.badge),
    ],
  });
};

const SidebarPart = ({
  ariaLabel,
  badge,
  children,
  className = "",
  description,
  headerActions,
  id,
  isResizing = false,
  labelledBy,
  onAction,
  onStartResizing,
  sections,
  style,
  title,
  widthPx,
}: SidebarPartProps) => {
  const widthStyle = getWorkbenchSidebarWidthStyle(widthPx);
  const normalizedHeaderActions =
    normalizeWorkbenchSidebarHeaderActions(headerActions);
  const normalizedSections = normalizeWorkbenchSidebarSections(sections);
  const hasHeaderContent = Boolean(title || description || badge);
  const resolvedStyle =
    widthStyle || style
      ? {
          ...widthStyle,
          ...style,
        }
      : undefined;

  return jsxs("aside", {
    id,
    "aria-label": ariaLabel,
    "aria-labelledby": labelledBy,
    className: `workbench_sidebar_part ${className}`.trim(),
    "data-resizing": isResizing ? "true" : "false",
    style: resolvedStyle,
    children: [
      hasHeaderContent || normalizedHeaderActions.length > 0
        ? jsx("div", {
            className: `workbench_sidebar_header ${!hasHeaderContent ? "workbench_sidebar_header--actions-only" : ""}`.trim(),
            children: [
              title || description
                ? jsxs("div", {
                    className: "workbench_sidebar_header_main",
                    children: [
                      title
                        ? jsx("h2", {
                            className: "workbench_sidebar_title",
                            children: title,
                          })
                        : null,
                      description
                        ? jsx("p", {
                            className: "workbench_sidebar_description",
                            children: description,
                          })
                        : null,
                    ],
                  })
                : null,
              badge
                ? jsx("div", {
                    className: "shrink-0 self-start",
                    children: renderSidebarBadge(badge),
                  })
                : null,
              normalizedHeaderActions.length > 0
                ? jsx("div", {
                    className: "workbench_sidebar_header_actions",
                    children: normalizedHeaderActions.map((action) =>
                      renderSidebarAction(action, onAction, action.kind),
                    ),
                  })
                : null,
            ],
          })
        : null,
      normalizedSections.map((section) =>
        jsxs(
          "section",
          {
            className: "workbench_sidebar_section",
            children: [
              jsxs("div", {
                className: "flex items-start justify-between gap-2",
                children: [
                  jsxs("div", {
                    className: "workbench_sidebar_header_main",
                    children: [
                      jsx("h2", {
                        className: "workbench_sidebar_title",
                        children: section.title,
                      }),
                      section.description
                        ? jsx("p", {
                            className: "workbench_sidebar_description",
                            children: section.description,
                          })
                        : null,
                    ],
                  }),
                  renderSidebarBadge(section.badge),
                ],
              }),
              section.actions?.length
                ? jsx("div", {
                    className: "flex flex-col gap-1",
                    children: section.actions.map((action) =>
                      renderSidebarAction(action, onAction),
                    ),
                  })
                : null,
            ],
          },
          section.id,
        ),
      ),
      children,
      onStartResizing
        ? jsx(Sash, {
            className: "workbench_sidebar_sash",
            edge: "right",
            active: isResizing,
            onDidStart: onStartResizing,
          })
        : null,
    ],
  });
};

export default SidebarPart;
