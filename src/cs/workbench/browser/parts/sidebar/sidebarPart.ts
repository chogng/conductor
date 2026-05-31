import { jsx, jsxs } from "react/jsx-runtime";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  getButtonClassName,
  getButtonContentClassName,
} from "src/cs/base/browser/ui/button/button";
import Sash, { type SashDragEvent, type SashOptions } from "src/cs/base/browser/ui/sash/sash";
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
  kind?: "primary" | "secondary" | "icon" | "statusBadge";
};

const SashHost = (props: SashOptions) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sashRef = useRef<Sash | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    sashRef.current = new Sash(props);
    host.replaceChildren(sashRef.current.element);

    return () => {
      sashRef.current?.dispose();
      sashRef.current = null;
    };
  }, []);

  useEffect(() => {
    sashRef.current?.update(props);
  }, [props.active, props.className, props.disabled, props.edge, props.onDidChange, props.onDidEnd, props.onDidStart, props.orientation, props.role, props.style]);

  return jsx("div", {
    ref: hostRef,
  });
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

const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const getRollingDirection = (
  previousValue: string,
  nextValue: string,
): "up" | "down" => {
  const previousNumber = Number(previousValue);
  const nextNumber = Number(nextValue);

  if (Number.isFinite(previousNumber) && Number.isFinite(nextNumber)) {
    return nextNumber >= previousNumber ? "up" : "down";
  }

  return "up";
};

const padRollingValue = (value: string, length: number): string =>
  value.padStart(length, " ");

const renderRollingDigitColumn = ({
  direction,
  index,
  nextChar,
  onAnimationEnd,
  previousChar,
}: {
  readonly direction: "up" | "down";
  readonly index: number;
  readonly nextChar: string;
  readonly onAnimationEnd: () => void;
  readonly previousChar: string;
}) => {
  const hasChanged = previousChar !== nextChar;
  const renderChar = (char: string) => (char === " " ? "" : char);

  if (!hasChanged) {
    return jsx(
      "span",
      {
        className: "workbench_sidebar_header_status_badge_digit_viewport",
        children: jsx("span", {
          className: "workbench_sidebar_header_status_badge_digit",
          children: renderChar(nextChar),
        }),
      },
      `static-${index}-${nextChar}`,
    );
  }

  return jsx(
    "span",
    {
      className: "workbench_sidebar_header_status_badge_digit_viewport",
      children: jsxs("span", {
        className:
          "workbench_sidebar_header_status_badge_digit workbench_sidebar_header_status_badge_digit--rolling",
        "data-direction": direction,
        onAnimationEnd,
        children:
          direction === "up"
            ? [
                jsx("span", { children: renderChar(previousChar) }, "previous"),
                jsx("span", { children: renderChar(nextChar) }, "next"),
              ]
            : [
                jsx("span", { children: renderChar(nextChar) }, "next"),
                jsx("span", { children: renderChar(previousChar) }, "previous"),
              ],
      }),
    },
    `rolling-${index}-${previousChar}-${nextChar}`,
  );
};

const renderRollingDigits = ({
  direction,
  nextValue,
  onAnimationEnd,
  previousValue,
}: {
  readonly direction: "up" | "down";
  readonly nextValue: string;
  readonly onAnimationEnd: () => void;
  readonly previousValue: string | null;
}) => {
  const length = Math.max(previousValue?.length ?? 0, nextValue.length);
  const next = padRollingValue(nextValue, length);
  const previous =
    previousValue === null ? next : padRollingValue(previousValue, length);

  return jsx("span", {
    "aria-hidden": "true",
    className: "workbench_sidebar_header_status_badge_digits",
    children: Array.from({ length }, (_, index) =>
      renderRollingDigitColumn({
        direction,
        index,
        nextChar: next[index] ?? " ",
        onAnimationEnd,
        previousChar: previous[index] ?? " ",
      }),
    ),
  });
};

const SidebarHeaderStatusBadge = ({
  id,
  label,
  value,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const displayValueRef = useRef(value);

  useEffect(() => {
    if (value === displayValueRef.current) return;

    const previous = displayValueRef.current;
    displayValueRef.current = value;
    setDisplayValue(value);

    if (prefersReducedMotion()) {
      setPreviousValue(null);
      return;
    }

    setDirection(getRollingDirection(previous, value));
    setPreviousValue(previous);
  }, [value]);

  return jsx("span", {
    id,
    className: "workbench_sidebar_header_status_badge",
    role: "status",
    "aria-live": "polite",
    "aria-label": label,
    title: label,
    children: renderRollingDigits({
      direction,
      nextValue: displayValue,
      onAnimationEnd: () => setPreviousValue(null),
      previousValue,
    }),
  });
};

const renderSidebarAction = (
  action: WorkbenchSidebarAction,
  onAction: WorkbenchSidebarActionHandler | undefined,
  kind?: WorkbenchSidebarHeaderAction["kind"],
) => {
  if (kind) {
    if (kind === "statusBadge") {
      return jsx(SidebarHeaderStatusBadge, {
        id: action.id,
        label: action.title,
        value: action.badge?.text ?? action.title,
      });
    }

    if (kind === "icon") {
      return jsx("button", {
        id: action.id,
        type: "button",
        className: getButtonClassName({
          className: "workbench_sidebar_header_icon_btn",
          disabled: action.isDisabled,
          size: "iconSm",
          variant: "ghost",
        }),
        disabled: action.isDisabled,
        onClick: () => onAction?.(action),
        title: action.title,
        "aria-label": action.title,
        children: jsx("span", {
          className: getButtonContentClassName(),
          children: action.icon,
        }),
      });
    }

    return jsx("button", {
      id: action.id,
      type: "button",
      className: getButtonClassName({
        className: "workbench_sidebar_header_btn",
        disabled: action.isDisabled,
        size: "sm",
        variant: kind === "primary" ? "primary" : "ghost",
      }),
      disabled: action.isDisabled,
      onClick: () => onAction?.(action),
      title: action.title,
      "data-icon": action.icon ? "with" : undefined,
      children: jsx("span", {
        className: getButtonContentClassName(),
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
      }),
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
        ? jsx(SashHost, {
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
