import {
  normalizeLxIconSvgMarkup,
} from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { Action, type IAction } from "src/cs/base/common/actions";
import {
  ActionViewItem,
  type IActionViewItem,
  type IActionViewItemOptions,
} from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import {
  Disposable,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { INativeHostService } from "src/cs/platform/native/common/native";
import {
  createWorkbenchLayoutAuxiliaryBarToggleButton,
  createWorkbenchLayoutSidebarToggleButton,
} from "src/cs/workbench/browser/actions/layoutActions";
import * as WorkbenchTitlebarActions from "src/cs/workbench/browser/parts/titlebar/titlebarActions";
import type { WorkbenchTitlebarPageButton } from "src/cs/workbench/browser/parts/titlebar/titlebarActions";
import type { WorkbenchTitlebarProps } from "src/cs/workbench/browser/parts/titlebar/windowTitle";

export const WORKBENCH_TITLEBAR_DRAG_REGION_STYLE = {
  WebkitAppRegion: "drag",
};

export const WORKBENCH_TITLEBAR_ID = "workbench-titlebar";

const WORKBENCH_TITLEBAR_HEIGHT = 35;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const appendChildren = <T extends HTMLElement | SVGElement>(
  parent: T,
  children: Array<HTMLElement | SVGElement | Text | null | undefined>,
): T => {
  for (const child of children) {
    if (child) {
      parent.appendChild(child);
    }
  }

  return parent;
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  attributes: Record<string, string | boolean | number | undefined> = {},
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) {
      continue;
    }

    if (key === "className") {
      element.className = String(value);
      continue;
    }

    if (key === "disabled" && element instanceof HTMLButtonElement) {
      element.disabled = value === true;
      continue;
    }

    element.setAttribute(key, value === true ? "true" : String(value));
  }

  return element;
};

const createSvgIcon = (
  size: number,
  path: string,
  className = "",
): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  if (className) {
    svg.setAttribute("class", className);
  }

  for (const command of path.split("|")) {
    const pathElement = document.createElementNS(SVG_NAMESPACE, "path");
    pathElement.setAttribute("d", command);
    svg.appendChild(pathElement);
  }

  return svg;
};

const createLxIcon = (
  icon: LxIconDefinition,
  size: number,
  className = "",
): SVGSVGElement => {
  const container = document.createElement("div");
  container.innerHTML = normalizeLxIconSvgMarkup(icon);
  const svg = container.firstElementChild;

  if (!(svg instanceof SVGSVGElement)) {
    return createSvgIcon(size, "", className);
  }

  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));

  if (className) {
    svg.setAttribute("class", className);
  }

  return svg;
};

const getDefaultPageActionIcon = (
  action: WorkbenchTitlebarPageButton,
): LxIconDefinition => {
  if (action.id === "table") {
    return LxIcon.table;
  }

  if (action.id === "chart") {
    return LxIcon.chart;
  }

  if (action.id === "settings") {
    return LxIcon.gear;
  }

  return LxIcon.gear;
};

const createIconButton = (
  attributes: Record<string, string | boolean | number | undefined>,
  icon: HTMLElement | SVGElement,
  onClick?: () => void,
): HTMLButtonElement => {
  const button = createElement("button", {
    type: "button",
    ...attributes,
  });

  if (onClick) {
    button.addEventListener("click", onClick);
  }

  button.appendChild(icon);
  return button;
};

type WorkbenchTitlebarRuntimeAction = Action & {
  readonly onIntent?: () => void;
  readonly titlebarClassName: string;
};

const isWorkbenchTitlebarRuntimeAction = (
  action: IAction,
): action is WorkbenchTitlebarRuntimeAction =>
  action instanceof Action &&
  "titlebarClassName" in action;

const createTitlebarRuntimeAction = ({
  commandId,
  commandService,
  icon,
  id,
  onIntent,
  title,
  titlebarClassName = "titlebar-icon-button",
}: {
  readonly commandId: string;
  readonly commandService?: ICommandService;
  readonly icon: LxIconDefinition;
  readonly id: string;
  readonly onIntent?: () => void;
  readonly title: string;
  readonly titlebarClassName?: string;
}): WorkbenchTitlebarRuntimeAction => {
  const action = new Action(
    id,
    title,
    "",
    true,
    () => {
      void commandService?.executeCommand(commandId);
    },
  ) as WorkbenchTitlebarRuntimeAction;
  Object.defineProperties(action, {
    onIntent: {
      value: onIntent,
    },
    titlebarClassName: {
      value: titlebarClassName,
    },
  });
  action.icon = icon;
  action.tooltip = title;
  return action;
};

class TitlebarActionViewItem extends ActionViewItem {
  constructor(
    action: WorkbenchTitlebarRuntimeAction,
    options: IActionViewItemOptions,
  ) {
    super(undefined, action, {
      ...options,
      icon: true,
      label: false,
    });
  }

  public override render(container: HTMLElement): void {
    super.render(container);
    if (!this.label || !isWorkbenchTitlebarRuntimeAction(this.action)) {
      return;
    }

    this.label.id = this.action.id;

    if (this.action.onIntent) {
      this.label.addEventListener("mouseenter", this.action.onIntent);
      this.label.addEventListener("focus", this.action.onIntent);
    }
  }

  protected override updateClass(): void {
    if (!this.label || !isWorkbenchTitlebarRuntimeAction(this.action)) {
      return;
    }

    this.label.className = this.action.titlebarClassName;
    if (this.action.class) {
      this.label.classList.add(...this.action.class.split(/\s+/g).filter(Boolean));
    }
  }
}

class TitlebarUpdateRuntimeAction extends Action {
  public readonly titlebarClassName =
    "titlebar-action-button titlebar-update-button";
  public updateCommandId: string | undefined;
  private progressPercent: number | null = null;

  public constructor(
    private readonly commandService: ICommandService | undefined,
  ) {
    super(
      WorkbenchTitlebarActions.WORKBENCH_TITLEBAR_UPDATE_BUTTON_ID,
      "",
      "",
      true,
    );
  }

  public override async run(): Promise<void> {
    if (this.updateCommandId) {
      await this.commandService?.executeCommand(this.updateCommandId);
    }
  }

  public get updateProgressPercent(): number | null {
    return this.progressPercent;
  }

  public setUpdateProgressPercent(value: number | null): void {
    if (this.progressPercent !== value) {
      this.progressPercent = value;
      this.onDidChangeEmitter.fire({ class: this.class });
    }
  }
}

class TitlebarUpdateActionViewItem extends ActionViewItem {
  constructor(
    action: TitlebarUpdateRuntimeAction,
    options: IActionViewItemOptions,
  ) {
    super(undefined, action, {
      ...options,
      icon: false,
      label: true,
    });
  }

  public override render(container: HTMLElement): void {
    super.render(container);
    if (this.label) {
      this.label.id = this.action.id;
    }
    this.updateProgressStyle();
  }

  protected override updateClass(): void {
    if (!this.label || !(this.action instanceof TitlebarUpdateRuntimeAction)) {
      return;
    }

    this.label.className = this.action.titlebarClassName;
    if (this.action.class) {
      this.label.classList.add(...this.action.class.split(/\s+/g).filter(Boolean));
    }
    this.updateProgressStyle();
  }

  protected override updateLabel(): void {
    super.updateLabel();
    this.updateProgressStyle();
  }

  private updateProgressStyle(): void {
    if (!this.label || !(this.action instanceof TitlebarUpdateRuntimeAction)) {
      return;
    }

    this.label.style.removeProperty("--titlebar-update-progress");
    if (this.action.updateProgressPercent !== null) {
      this.label.style.setProperty(
        "--titlebar-update-progress",
        `${this.action.updateProgressPercent}%`,
      );
    }
  }
}

const createTitlebarActionBar = (
  contentClassName: string,
): ActionBar => new ActionBar({
  className: "titlebar-actionbar",
  contentClassName,
  actionViewItemProvider: (action, options): IActionViewItem | undefined =>
    action instanceof TitlebarUpdateRuntimeAction
      ? new TitlebarUpdateActionViewItem(action, options)
      : isWorkbenchTitlebarRuntimeAction(action)
      ? new TitlebarActionViewItem(action, options)
      : undefined,
});

const createQuickAccessButton = (
  commandService?: ICommandService,
): HTMLButtonElement => {
  const action =
    WorkbenchTitlebarActions.createWorkbenchTitlebarQuickAccessButton();
  const button = createIconButton(
    {
      id: action.id,
      "aria-label": action.title,
      className: "titlebar-quick-access-button",
    },
    createLxIcon(action.icon, 14, "opacity-80"),
    () => {
      void commandService?.executeCommand(action.commandId);
    },
  );

  const label = document.createElement("span");
  label.className = "titlebar-quick-access-label";
  label.textContent = action.title;
  button.appendChild(label);

  return button;
};

type WorkbenchTitlebarViewRefs = {
  readonly auxiliaryBarAction: WorkbenchTitlebarRuntimeAction;
  readonly sidebarAction: WorkbenchTitlebarRuntimeAction;
  readonly navActions: ReadonlyMap<string, WorkbenchTitlebarRuntimeAction>;
  readonly pageActions: ReadonlyMap<string, WorkbenchTitlebarRuntimeAction>;
  readonly updateAction?: TitlebarUpdateRuntimeAction;
};

class WorkbenchTitlebarView extends Disposable {
  public constructor(
    public readonly element: HTMLElement,
    private readonly refs: WorkbenchTitlebarViewRefs,
    private readonly nativeHostService: INativeHostService | undefined,
    disposables: readonly IDisposable[],
  ) {
    super();
    for (const disposable of disposables) {
      this._register(disposable);
    }
  }

  public update(props: WorkbenchTitlebarProps): void {
    const navButtons =
      WorkbenchTitlebarActions.createWorkbenchTitlebarNavButtons(
        props.canNavigateBack ?? false,
        props.canNavigateForward ?? false,
      );
    const pageButtons =
      WorkbenchTitlebarActions.createWorkbenchTitlebarPageButtons(
        props.activePage,
      );
    const sidebarButton =
      createWorkbenchLayoutSidebarToggleButton(
        props.isSidebarVisible,
      );
    const auxiliaryBarButton = createWorkbenchLayoutAuxiliaryBarToggleButton(
      props.isAuxiliaryBarExpanded,
    );

    this.refs.sidebarAction.label = sidebarButton.title;
    this.refs.sidebarAction.tooltip = sidebarButton.title;
    this.refs.sidebarAction.icon = sidebarButton.icon;
    this.refs.sidebarAction.checked = sidebarButton.isActive;

    this.refs.auxiliaryBarAction.label = auxiliaryBarButton.title;
    this.refs.auxiliaryBarAction.tooltip = auxiliaryBarButton.title;
    this.refs.auxiliaryBarAction.icon = auxiliaryBarButton.icon;
    this.refs.auxiliaryBarAction.checked = auxiliaryBarButton.isActive;

    for (const button of navButtons) {
      const runtimeAction = this.refs.navActions.get(button.id);
      if (runtimeAction) {
        runtimeAction.label = button.title;
        runtimeAction.tooltip = button.title;
        runtimeAction.enabled = !button.isDisabled;
      }
    }

    for (const button of pageButtons) {
      const runtimeAction = this.refs.pageActions.get(button.id);
      if (runtimeAction) {
        runtimeAction.label = button.title;
        runtimeAction.tooltip = button.title;
        runtimeAction.class = button.isActive
          ? "titlebar-page-button--active"
          : "";
      }
    }

    if (this.refs.updateAction && props.updateAction?.isVisible === true) {
      syncTitlebarUpdateAction(this.refs.updateAction, props.updateAction);
    }

    this.syncWindowControls();
  }

  public syncWindowControls(): void {
    if (!this.nativeHostService) {
      return;
    }

    const style = getComputedStyle(this.element);
    const height =
      Math.round(this.element.getBoundingClientRect().height) ||
      WORKBENCH_TITLEBAR_HEIGHT;
    void this.nativeHostService.updateWindowControls({
      height,
      backgroundColor: style.backgroundColor,
      foregroundColor: style.color,
    }).catch(() => undefined);
  }
}

const createMacWindowControlsSpacer = (): HTMLElement => {
  const spacer = createElement("div", {
    className: "window-controls-container",
    "aria-hidden": "true",
  });
  spacer.style.width = "70px";
  spacer.style.flexShrink = "0";
  spacer.style.setProperty("-webkit-app-region", "drag");
  return spacer;
};

const createTrailingSpacer = (): HTMLElement => createElement("div", {
  className: "titlebar-right-spacer",
  "aria-hidden": "true",
});

const createWorkbenchTitlebarView = (
  {
    activePage,
    chartIntentCommandId,
    chrome,
    canNavigateBack = false,
    canNavigateForward = false,
    commandService,
    id = WORKBENCH_TITLEBAR_ID,
    isSidebarVisible,
    isAuxiliaryBarExpanded,
    nativeHostService,
    updateAction,
  }: WorkbenchTitlebarProps,
): WorkbenchTitlebarView => {
  const showBrandIcon = chrome?.showBrandIcon ?? true;
  const windowControlsSide = chrome?.windowControlsSide;
  const navButtons = WorkbenchTitlebarActions.createWorkbenchTitlebarNavButtons(
    canNavigateBack,
    canNavigateForward,
  );
  const pageButtons =
    WorkbenchTitlebarActions.createWorkbenchTitlebarPageButtons(activePage);
  const header = createElement("header", {
    id,
    className: "titlebar-root",
  });

  header.addEventListener("contextmenu", (event) => event.preventDefault());

  const brand = showBrandIcon
    ? appendChildren(
      createElement("div", { className: "titlebar-brand" }),
      [
        createElement("span", {
          "aria-hidden": "true",
          className: "titlebar-brand-icon",
        }),
      ],
    )
    : null;
  const actionBarDisposables: IDisposable[] = [];
  const navActionsById = new Map<string, WorkbenchTitlebarRuntimeAction>();
  const pageActionsById = new Map<string, WorkbenchTitlebarRuntimeAction>();
  let updateRuntimeAction: TitlebarUpdateRuntimeAction | undefined;

  const navActionBar = createTitlebarActionBar([
    "titlebar-controls",
    "titlebar-controls--nav",
  ].filter(Boolean).join(" "));
  actionBarDisposables.push(navActionBar);
  const sidebarButton =
    createWorkbenchLayoutSidebarToggleButton(
      isSidebarVisible,
    );
  const auxiliaryBarButton = createWorkbenchLayoutAuxiliaryBarToggleButton(
    isAuxiliaryBarExpanded,
  );
  const sidebarRuntimeAction = createTitlebarRuntimeAction({
    commandId: sidebarButton.commandId,
    commandService,
    icon: sidebarButton.icon,
    id: sidebarButton.id,
    title: sidebarButton.title,
  });
  actionBarDisposables.push(sidebarRuntimeAction);
  sidebarRuntimeAction.checked = sidebarButton.isActive;
  navActionBar.push(sidebarRuntimeAction, { label: false });

  const auxiliaryBarRuntimeAction = createTitlebarRuntimeAction({
    commandId: auxiliaryBarButton.commandId,
    commandService,
    icon: auxiliaryBarButton.icon,
    id: auxiliaryBarButton.id,
    title: auxiliaryBarButton.title,
  });
  actionBarDisposables.push(auxiliaryBarRuntimeAction);
  auxiliaryBarRuntimeAction.checked = auxiliaryBarButton.isActive;

  for (const button of navButtons) {
    const isBack =
      button.id === WorkbenchTitlebarActions.WorkbenchTitlebarNavButtonIds.back;
    const runtimeAction = createTitlebarRuntimeAction({
      commandId: button.commandId,
      commandService,
      icon: isBack ? LxIcon.arrowLeft : LxIcon.arrowRight,
      id: button.id,
      title: button.title,
    });
    actionBarDisposables.push(runtimeAction);
    runtimeAction.enabled = !button.isDisabled;
    navActionBar.push(runtimeAction, { label: false });
    navActionsById.set(button.id, runtimeAction);
  }

  const center = createElement("div", {
    className: "titlebar-center",
  });

  center.appendChild(createQuickAccessButton(commandService));

  const rightControls = createElement("div", {
    className: "titlebar-right",
  });

  const actionToolbarContainer = createElement("div", {
    className: "action-toolbar-container",
  });

  const pageActionBar = createTitlebarActionBar("titlebar-controls");
  actionBarDisposables.push(pageActionBar);
  if (updateAction?.isVisible === true) {
    updateRuntimeAction = new TitlebarUpdateRuntimeAction(commandService);
    syncTitlebarUpdateAction(updateRuntimeAction, updateAction);
    actionBarDisposables.push(updateRuntimeAction);
    pageActionBar.push(updateRuntimeAction, { label: true });
  }

  for (const button of pageButtons) {
    if (button.id === "settings") {
      pageActionBar.push(auxiliaryBarRuntimeAction, { label: false });
    }

    const runtimeAction = createTitlebarRuntimeAction({
      commandId: button.commandId,
      commandService,
      icon: getDefaultPageActionIcon(button),
      id: WorkbenchTitlebarActions.WORKBENCH_TITLEBAR_PAGE_BUTTON_IDS[
        button.id
      ],
      onIntent: button.id === "chart" && chartIntentCommandId
        ? () => {
          void commandService?.executeCommand(chartIntentCommandId);
        }
        : undefined,
      title: button.title,
    });
    actionBarDisposables.push(runtimeAction);
    runtimeAction.class = button.isActive ? "titlebar-page-button--active" : "";

    pageActionBar.push(runtimeAction, { label: false });
    pageActionsById.set(button.id, runtimeAction);
  }
  actionToolbarContainer.appendChild(pageActionBar.domNode);
  rightControls.appendChild(actionToolbarContainer);

  if (windowControlsSide === "right") {
    const windowControlsContainer = createElement("div", {
      className: "window-controls-container",
      "aria-hidden": "true",
    });
    windowControlsContainer.style.width = "138px";
    windowControlsContainer.style.flexShrink = "0";
    rightControls.appendChild(windowControlsContainer);
  } else {
    rightControls.appendChild(createTrailingSpacer());
  }

  const leftToolbarContainer = appendChildren(
    createElement("div", { className: "left-toolbar-container" }),
    [
      brand,
      navActionBar.domNode,
    ],
  );
  const leftControls = appendChildren(
    createElement("div", { className: "titlebar-left" }),
    [
      windowControlsSide === "left"
        ? createMacWindowControlsSpacer()
        : null,
      leftToolbarContainer,
    ],
  );

  return new WorkbenchTitlebarView(
    appendChildren(header, [leftControls, center, rightControls]),
    {
      auxiliaryBarAction: auxiliaryBarRuntimeAction,
      navActions: navActionsById,
      pageActions: pageActionsById,
      sidebarAction: sidebarRuntimeAction,
      updateAction: updateRuntimeAction,
    },
    nativeHostService,
    actionBarDisposables,
  );
};

export const createWorkbenchTitlebarElement = (
  props: WorkbenchTitlebarProps,
): HTMLElement => createWorkbenchTitlebarView(props).element;

const shouldRecreateTitlebar = (
  prev: WorkbenchTitlebarProps,
  next: WorkbenchTitlebarProps,
): boolean =>
  prev.id !== next.id ||
  prev.commandService !== next.commandService ||
  prev.chartIntentCommandId !== next.chartIntentCommandId ||
  prev.chrome?.showBrandIcon !== next.chrome?.showBrandIcon ||
  prev.chrome?.windowControlsSide !== next.chrome?.windowControlsSide ||
  prev.updateAction?.isVisible !== next.updateAction?.isVisible;

const normalizeTitlebarUpdateProgressPercent = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
};

const syncTitlebarUpdateAction = (
  action: TitlebarUpdateRuntimeAction,
  updateAction: NonNullable<WorkbenchTitlebarProps["updateAction"]>,
): void => {
  const updateTitle =
    WorkbenchTitlebarActions.getWorkbenchTitlebarUpdateTitle(updateAction);
  const updateProgressPercent =
    normalizeTitlebarUpdateProgressPercent(updateAction.progressPercent);

  action.updateCommandId = updateAction.commandId;
  action.label =
    WorkbenchTitlebarActions.getWorkbenchTitlebarUpdateLabel(updateAction);
  action.tooltip = updateTitle;
  action.class = updateProgressPercent !== null
    ? "titlebar-update-button--progress"
    : "";
  action.setUpdateProgressPercent(updateProgressPercent);
};

export class WorkbenchTitlebarPart {
  private contentArea: HTMLElement | null = null;
  private renderedProps: WorkbenchTitlebarProps | undefined;
  private titlebarView: WorkbenchTitlebarView | undefined;

  constructor(private readonly parent: HTMLElement) {}

  createContentArea(parent = this.parent): HTMLElement {
    if (this.contentArea) {
      return this.contentArea;
    }

    const contentArea = createElement("div", {
      className: "titlebar-part",
    });
    parent.replaceChildren(contentArea);
    this.contentArea = contentArea;

    return contentArea;
  }

  update(props: WorkbenchTitlebarProps): void {
    const contentArea = this.createContentArea();
    if (!this.renderedProps || shouldRecreateTitlebar(this.renderedProps, props)) {
      this.titlebarView?.dispose();
      this.titlebarView = createWorkbenchTitlebarView(props);
      contentArea.replaceChildren(this.titlebarView.element);
      this.titlebarView.syncWindowControls();
      this.renderedProps = props;
      return;
    }

    this.titlebarView?.update(props);
    this.titlebarView?.syncWindowControls();
    this.renderedProps = props;
  }

  clear(): void {
    this.titlebarView?.dispose();
    this.contentArea?.replaceChildren();
    this.renderedProps = undefined;
    this.titlebarView = undefined;
  }

  layout(): void {
    this.titlebarView?.syncWindowControls();
  }

  dispose(): void {
    this.clear();
    this.contentArea?.remove();
    this.contentArea = null;
  }
}
