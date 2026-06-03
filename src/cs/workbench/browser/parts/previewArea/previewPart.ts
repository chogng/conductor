import {
  getButtonClassName,
  getButtonContentClassName,
} from "src/cs/base/browser/ui/button/button";
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
  icon?: Node | string | null;
  badge?: WorkbenchPreviewAreaBadge;
};

export type WorkbenchPreviewAreaHeaderAction = WorkbenchPreviewAreaAction & {
  kind?: "primary" | "secondary" | "icon";
};

export type WorkbenchPreviewAreaPartState = {
  id?: string;
  className?: string;
  title?: string;
  titleContent?: Node | null;
  description?: string;
  badge?: WorkbenchPreviewAreaBadge;
  labelledBy?: string;
  headerActions?: WorkbenchPreviewAreaHeaderAction[];
  actionbarContent?: Node | null;
  isBusy?: boolean;
};

export type WorkbenchPreviewAreaActionHandler = (
  action: WorkbenchPreviewAreaAction,
) => void;

export type PreviewPartOptions = WorkbenchPreviewAreaPartState & {
  ariaLabel?: string;
  children?: Node | null;
  onAction?: WorkbenchPreviewAreaActionHandler;
};

export const createPreviewPart = ({
  ariaLabel,
  actionbarContent,
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
  titleContent,
}: PreviewPartOptions): HTMLElement => {
  const root = document.createElement("section");
  if (id) {
    root.id = id;
  }
  if (isBusy) {
    root.setAttribute("aria-busy", "true");
  }
  setOptionalAttribute(root, "aria-label", ariaLabel);
  setOptionalAttribute(root, "aria-labelledby", labelledBy);
  root.className = `workbench_preview_area_part ${className}`.trim();

  const normalizedHeaderActions =
    normalizeWorkbenchPreviewAreaHeaderActions(headerActions);
  const hasHeaderContent = Boolean(titleContent || title || description || badge);
  const hasActionbarContent = Boolean(actionbarContent || normalizedHeaderActions.length > 0);

  if (hasHeaderContent || hasActionbarContent) {
    root.append(
      createPreviewHeader({
        actionbarContent,
        badge,
        description,
        hasHeaderContent,
        normalizedHeaderActions,
        onAction,
        title,
        titleContent,
      }),
    );
  }

  const content = document.createElement("div");
  content.className = "workbench_preview_area_content";
  if (children) {
    content.append(children);
  }
  root.append(content);

  return root;
};

const createPreviewHeader = ({
  actionbarContent,
  badge,
  description,
  hasHeaderContent,
  normalizedHeaderActions,
  onAction,
  title,
  titleContent,
}: {
  readonly actionbarContent?: Node | null;
  readonly badge?: WorkbenchPreviewAreaBadge;
  readonly description?: string;
  readonly hasHeaderContent: boolean;
  readonly normalizedHeaderActions: WorkbenchPreviewAreaHeaderAction[];
  readonly onAction?: WorkbenchPreviewAreaActionHandler;
  readonly title?: string;
  readonly titleContent?: Node | null;
}): HTMLElement => {
  const header = document.createElement("div");
  header.className = `workbench_preview_area_header ${!hasHeaderContent ? "workbench_preview_area_header--actions-only" : ""}`.trim();

  if (titleContent || title || description || badge) {
    const main = document.createElement("div");
    main.className = "workbench_preview_area_header_main title-label";
    if (titleContent) {
      main.append(titleContent);
    }
    if (title) {
      const heading = document.createElement("h2");
      heading.className = "workbench_preview_area_title";
      heading.textContent = title;
      main.append(heading);
    }
    if (description) {
      const text = document.createElement("p");
      text.className = "workbench_preview_area_description";
      text.textContent = description;
      main.append(text);
    }
    const badgeElement = createPreviewBadge(badge);
    if (badgeElement) {
      main.append(badgeElement);
    }
    header.append(main);
  }

  if (actionbarContent || normalizedHeaderActions.length > 0) {
    const actions = document.createElement("div");
    actions.className = "workbench_preview_area_header_actions actionbar";
    if (actionbarContent) {
      actions.append(actionbarContent);
    }
    for (const action of normalizedHeaderActions) {
      actions.append(createPreviewAction(action, onAction, action.kind));
    }
    header.append(actions);
  }

  return header;
};

const createPreviewBadge = (
  badge: WorkbenchPreviewAreaBadge | undefined,
): HTMLElement | null => {
  if (!badge) {
    return null;
  }

  const element = document.createElement("span");
  element.className = "workbench_preview_area_badge";
  element.dataset.tone = badge.tone ?? "default";
  element.textContent = badge.text;
  return element;
};

const createPreviewAction = (
  action: WorkbenchPreviewAreaAction,
  onAction: WorkbenchPreviewAreaActionHandler | undefined,
  kind?: WorkbenchPreviewAreaHeaderAction["kind"],
): HTMLButtonElement => {
  const button = document.createElement("button");
  button.id = action.id;
  button.type = "button";
  button.disabled = Boolean(action.isDisabled);
  button.title = action.title;
  button.addEventListener("click", () => onAction?.(action));

  if (kind === "icon") {
    button.className = getButtonClassName({
      className: action.isActive
        ? "workbench_preview_area_header_icon_btn workbench_preview_area_header_icon_btn--active"
        : "workbench_preview_area_header_icon_btn",
      disabled: action.isDisabled,
      size: "iconSm",
      variant: "ghost",
    });
    button.setAttribute("aria-label", action.title);
    button.setAttribute("aria-pressed", action.isActive ? "true" : "false");
    button.append(createButtonContent(action.icon));
    return button;
  }

  if (kind) {
    button.className = getButtonClassName({
      className: "workbench_preview_area_header_btn",
      disabled: action.isDisabled,
      size: "sm",
      variant: kind === "primary" ? "primary" : "ghost",
    });
    if (action.icon) {
      button.dataset.icon = "with";
    }
    button.append(createButtonContent(action.icon, action.title));
    return button;
  }

  button.className = getWorkbenchPreviewAreaActionClassName(action);
  appendIcon(button, action.icon);
  button.append(createTextSpan(action.title));
  const badge = createPreviewBadge(action.badge);
  if (badge) {
    button.append(badge);
  }
  return button;
};

const createButtonContent = (
  icon: Node | string | null | undefined,
  label?: string,
): HTMLSpanElement => {
  const content = document.createElement("span");
  content.className = getButtonContentClassName();
  appendIcon(content, icon);
  if (label) {
    content.append(createTextSpan(label));
  }
  return content;
};

const appendIcon = (
  parent: HTMLElement,
  icon: Node | string | null | undefined,
): void => {
  if (!icon) {
    return;
  }

  const wrapper = document.createElement("span");
  wrapper.className = "workbench_preview_area_action_icon";
  wrapper.setAttribute("aria-hidden", "true");
  if (typeof icon === "string") {
    wrapper.innerHTML = icon;
  } else {
    wrapper.append(icon.cloneNode(true));
  }
  parent.append(wrapper);
};

const createTextSpan = (text: string): HTMLSpanElement => {
  const span = document.createElement("span");
  span.className = "workbench_preview_area_action_label";
  span.textContent = text;
  return span;
};

const setOptionalAttribute = (
  element: HTMLElement,
  name: string,
  value: string | undefined,
): void => {
  if (value) {
    element.setAttribute(name, value);
  }
};

export default createPreviewPart;
