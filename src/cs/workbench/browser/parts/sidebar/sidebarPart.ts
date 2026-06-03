import {
  getButtonClassName,
  getButtonContentClassName,
} from "src/cs/base/browser/ui/button/button";
import Sash, { type SashDragEvent } from "src/cs/base/browser/ui/sash/sash";
import { DisposableStore } from "src/cs/base/common/lifecycle";
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
  icon?: Node | string | null;
  badge?: WorkbenchSidebarBadge;
};

export type WorkbenchSidebarHeaderAction = WorkbenchSidebarAction & {
  kind?: "primary" | "secondary" | "icon" | "statusBadge";
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

export type SidebarPartOptions = WorkbenchSidebarPartState & {
  ariaLabel?: string;
  children?: Node | null;
  onAction?: WorkbenchSidebarActionHandler;
  onStartResizing?: (event: SashDragEvent) => void;
  style?: Partial<CSSStyleDeclaration> | Record<string, string>;
};

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

export class SidebarPart {
  public readonly element: HTMLElement;
  private readonly disposables = new DisposableStore();
  private sash: Sash | null = null;

  constructor(options: SidebarPartOptions) {
    this.element = document.createElement("aside");
    this.update(options);
  }

  public update(options: SidebarPartOptions): void {
    this.disposables.clear();
    this.sash?.dispose();
    this.sash = null;

    const child = options.children ?? null;
    const preservedChild = child?.parentNode === this.element ? child : null;
    for (const node of Array.from(this.element.childNodes)) {
      if (node !== preservedChild) {
        node.remove();
      }
    }
    applySidebarAttributes(this.element, options);

    const normalizedHeaderActions = normalizeWorkbenchSidebarHeaderActions(
      options.headerActions,
    );
    const normalizedSections = normalizeWorkbenchSidebarSections(options.sections);
    const hasHeaderContent = Boolean(
      options.title || options.description || options.badge,
    );
    const content = document.createDocumentFragment();

    if (hasHeaderContent || normalizedHeaderActions.length > 0) {
      content.append(
        createSidebarHeader({
          badge: options.badge,
          description: options.description,
          hasHeaderContent,
          normalizedHeaderActions,
          onAction: options.onAction,
          title: options.title,
        }),
      );
    }

    for (const section of normalizedSections) {
      content.append(createSidebarSection(section, options.onAction));
    }

    if (preservedChild) {
      this.element.insertBefore(content, preservedChild);
    } else {
      this.element.append(content);
      if (child) {
        this.element.append(child);
      }
    }

    if (options.onStartResizing) {
      this.sash = new Sash({
        className: "workbench_sidebar_sash",
        edge: "right",
        active: options.isResizing,
        onDidStart: options.onStartResizing,
      });
      this.element.append(this.sash.element);
    }
  }

  public dispose(): void {
    this.disposables.dispose();
    this.sash?.dispose();
    this.sash = null;
  }
}

const applySidebarAttributes = (
  element: HTMLElement,
  options: SidebarPartOptions,
): void => {
  element.removeAttribute("id");
  element.removeAttribute("aria-label");
  element.removeAttribute("aria-labelledby");

  if (options.id) {
    element.id = options.id;
  }
  setOptionalAttribute(element, "aria-label", options.ariaLabel);
  setOptionalAttribute(element, "aria-labelledby", options.labelledBy);
  element.className = `workbench_sidebar_part ${options.className ?? ""}`.trim();
  element.dataset.resizing = options.isResizing ? "true" : "false";

  element.removeAttribute("style");
  const widthStyle = getWorkbenchSidebarWidthStyle(options.widthPx);
  applyStyle(element, widthStyle);
  applyStyle(element, options.style);
};

const createSidebarHeader = ({
  badge,
  description,
  hasHeaderContent,
  normalizedHeaderActions,
  onAction,
  title,
}: {
  readonly badge?: WorkbenchSidebarBadge;
  readonly description?: string;
  readonly hasHeaderContent: boolean;
  readonly normalizedHeaderActions: WorkbenchSidebarHeaderAction[];
  readonly onAction?: WorkbenchSidebarActionHandler;
  readonly title?: string;
}): HTMLElement => {
  const header = document.createElement("div");
  header.className = `workbench_sidebar_header ${!hasHeaderContent ? "workbench_sidebar_header--actions-only" : ""}`.trim();

  if (title || description) {
    header.append(createSidebarHeaderMain(title, description));
  }

  const badgeElement = createSidebarBadge(badge);
  if (badgeElement) {
    const badgeWrapper = document.createElement("div");
    badgeWrapper.className = "workbench_sidebar_badge_wrapper";
    badgeWrapper.append(badgeElement);
    header.append(badgeWrapper);
  }

  if (normalizedHeaderActions.length > 0) {
    const actions = document.createElement("div");
    actions.className = "workbench_sidebar_header_actions actionbar";
    for (const action of normalizedHeaderActions) {
      actions.append(createSidebarAction(action, onAction, action.kind));
    }
    header.append(actions);
  }

  return header;
};

const createSidebarHeaderMain = (
  title: string | undefined,
  description: string | undefined,
): HTMLElement => {
  const main = document.createElement("div");
  main.className = "workbench_sidebar_header_main title-label";
  if (title) {
    const heading = document.createElement("h2");
    heading.className = "workbench_sidebar_title";
    heading.textContent = title;
    main.append(heading);
  }
  if (description) {
    const text = document.createElement("p");
    text.className = "workbench_sidebar_description";
    text.textContent = description;
    main.append(text);
  }
  return main;
};

const createSidebarSection = (
  section: WorkbenchSidebarSection,
  onAction: WorkbenchSidebarActionHandler | undefined,
): HTMLElement => {
  const root = document.createElement("section");
  root.className = "workbench_sidebar_section";

  const header = document.createElement("div");
  header.className = "workbench_sidebar_section_header";
  header.append(createSidebarHeaderMain(section.title, section.description));
  const badge = createSidebarBadge(section.badge);
  if (badge) {
    header.append(badge);
  }
  root.append(header);

  if (section.actions?.length) {
    const actions = document.createElement("div");
    actions.className = "workbench_sidebar_section_actions";
    for (const action of section.actions) {
      actions.append(createSidebarAction(action, onAction));
    }
    root.append(actions);
  }

  return root;
};

const createSidebarAction = (
  action: WorkbenchSidebarAction,
  onAction: WorkbenchSidebarActionHandler | undefined,
  kind?: WorkbenchSidebarHeaderAction["kind"],
): HTMLElement => {
  if (kind === "statusBadge") {
    return new SidebarHeaderStatusBadge(
      action.id,
      action.title,
      action.badge?.text ?? action.title,
    ).element;
  }

  const button = document.createElement("button");
  button.id = action.id;
  button.type = "button";
  button.disabled = Boolean(action.isDisabled);
  button.title = action.title;
  button.addEventListener("click", () => onAction?.(action));

  if (kind === "icon") {
    button.className = getButtonClassName({
      className: action.isActive
        ? "workbench_sidebar_header_icon_btn workbench_sidebar_header_icon_btn--active"
        : "workbench_sidebar_header_icon_btn",
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
      className: "workbench_sidebar_header_btn",
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

  button.className = getWorkbenchSidebarActionClassName(action);
  button.dataset.kind = kind;
  appendIcon(button, action.icon);
  button.append(createTextSpan(action.title));
  const badge = createSidebarBadge(action.badge);
  if (badge) {
    button.append(badge);
  }
  return button;
};

class SidebarHeaderStatusBadge {
  public readonly element: HTMLElement;
  private value: string;

  constructor(id: string, label: string, value: string) {
    this.value = value;
    this.element = document.createElement("span");
    this.element.id = id;
    this.element.className = "workbench_sidebar_header_status_badge";
    this.element.role = "status";
    this.element.setAttribute("aria-live", "polite");
    this.element.setAttribute("aria-label", label);
    this.element.title = label;
    this.render(value, null, "up");
  }

  public update(value: string): void {
    if (value === this.value) {
      return;
    }
    const previous = this.value;
    this.value = value;
    const direction = getRollingDirection(previous, value);
    this.render(value, prefersReducedMotion() ? null : previous, direction);
  }

  private render(
    nextValue: string,
    previousValue: string | null,
    direction: "up" | "down",
  ): void {
    const digits = createRollingDigits({
      direction,
      nextValue,
      onAnimationEnd: () => this.render(this.value, null, direction),
      previousValue,
    });
    this.element.replaceChildren(digits);
  }
}

const createSidebarBadge = (
  badge: WorkbenchSidebarBadge | undefined,
): HTMLElement | null => {
  if (!badge) {
    return null;
  }

  const element = document.createElement("span");
  element.className = "workbench_sidebar_badge";
  element.dataset.tone = badge.tone ?? "default";
  element.textContent = badge.text;
  return element;
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

const createRollingDigits = ({
  direction,
  nextValue,
  onAnimationEnd,
  previousValue,
}: {
  readonly direction: "up" | "down";
  readonly nextValue: string;
  readonly onAnimationEnd: () => void;
  readonly previousValue: string | null;
}): HTMLElement => {
  const length = Math.max(previousValue?.length ?? 0, nextValue.length);
  const next = nextValue.padStart(length, " ");
  const previous =
    previousValue === null ? next : previousValue.padStart(length, " ");

  const root = document.createElement("span");
  root.setAttribute("aria-hidden", "true");
  root.className = "workbench_sidebar_header_status_badge_digits";

  for (let index = 0; index < length; index++) {
    root.append(
      createRollingDigitColumn({
        direction,
        index,
        nextChar: next[index] ?? " ",
        onAnimationEnd,
        previousChar: previous[index] ?? " ",
      }),
    );
  }

  return root;
};

const createRollingDigitColumn = ({
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
}): HTMLElement => {
  const viewport = document.createElement("span");
  viewport.className = "workbench_sidebar_header_status_badge_digit_viewport";

  const digit = document.createElement("span");
  digit.className = "workbench_sidebar_header_status_badge_digit";

  if (previousChar === nextChar) {
    digit.textContent = renderRollingChar(nextChar);
    viewport.append(digit);
    return viewport;
  }

  digit.className += " workbench_sidebar_header_status_badge_digit--rolling";
  digit.dataset.direction = direction;
  digit.addEventListener("animationend", onAnimationEnd, { once: true });
  const first = document.createElement("span");
  const second = document.createElement("span");
  first.textContent =
    direction === "up"
      ? renderRollingChar(previousChar)
      : renderRollingChar(nextChar);
  second.textContent =
    direction === "up"
      ? renderRollingChar(nextChar)
      : renderRollingChar(previousChar);
  first.dataset.index = String(index);
  digit.append(first, second);
  viewport.append(digit);
  return viewport;
};

const renderRollingChar = (char: string): string => (char === " " ? "" : char);

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
  wrapper.className = "workbench_sidebar_action_icon";
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
  span.className = "workbench_sidebar_action_label";
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

const applyStyle = (
  element: HTMLElement,
  style: Partial<CSSStyleDeclaration> | Record<string, string> | undefined,
): void => {
  if (!style) {
    return;
  }

  for (const [key, value] of Object.entries(style)) {
    if (typeof value === "string" && value) {
      element.style.setProperty(key, value);
    }
  }
};

export default SidebarPart;
