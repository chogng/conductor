import {
  normalizeLxIconSvgMarkup,
} from "src/cs/base/browser/ui/lxicon/lxicon";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { Action, type IAction } from "src/cs/base/common/actions";
import {
  ActionViewItem,
  type IActionViewItem,
  type IActionViewItemOptions,
} from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { getBaseLayerHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import {
  Disposable,
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import { Emitter } from "src/cs/base/common/event";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { INativeHostService } from "src/cs/platform/native/common/native";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { localize } from "src/cs/nls";
import * as WorkbenchTitlebarActions from "src/cs/workbench/browser/parts/titlebar/titlebarActions";
import type { WorkbenchTitlebarPageButton } from "src/cs/workbench/browser/parts/titlebar/titlebarActions";
import {
  getWorkbenchWindowState,
  ITitleService,
  type WorkbenchTitlebarActivePage,
  type WorkbenchTitlebarFileOption,
  type WorkbenchTitlebarState,
} from "src/cs/workbench/services/title/browser/titleService";

const WORKBENCH_TITLEBAR_APP_ICON_LIGHT_SVG =
  "<svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'><g clip-path='url(#clip0_conductor_titlebar_light)'><path d='M8 0L14.9282 4V12L8 16L1.0718 12V4L8 0Z' fill='black'/><path d='M8.00003 6L9.73208 7V9L8.00003 10L6.26798 9V7L8.00003 6Z' fill='white'/><path d='M8.00003 6L9.73208 7V9M8.00003 6L6.26798 7V9M8.00003 6L4.73205 4L3 5V11M8.00003 2L13.0001 5V7L9.73208 9L8.00003 10L6.26798 9M6.26798 9V13L8.00003 14L13.0001 11' stroke='white'/><circle cx='8' cy='2' r='1' fill='white'/><circle cx='3' cy='11' r='1' fill='white'/><circle cx='13' cy='11' r='1' fill='white'/></g><defs><clipPath id='clip0_conductor_titlebar_light'><rect width='16' height='16' fill='white'/></clipPath></defs></svg>";
const WORKBENCH_TITLEBAR_APP_ICON_DARK_SVG =
  "<svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'><g clip-path='url(#clip0_conductor_titlebar_dark)'><rect width='16' height='16' fill='black'/><path d='M8 0L14.9282 4V12L8 16L1.0718 12V4L8 0Z' fill='white'/><path d='M8.00003 6L9.73208 7V9L8.00003 10L6.26798 9V7L8.00003 6Z' fill='black'/><path d='M8.00003 6L9.73208 7V9M8.00003 6L6.26798 7V9M8.00003 6L4.73205 4L3 5V11M8.00003 2L13.0001 5V7L9.73208 9L8.00003 10L6.26798 9M6.26798 9V13L8.00003 14L13.0001 11' stroke='black'/><circle cx='8' cy='2' r='0.5' fill='black' stroke='black'/><circle cx='3' cy='11' r='0.5' fill='black' stroke='black'/><circle cx='13' cy='11' r='0.5' fill='black' stroke='black'/></g><defs><clipPath id='clip0_conductor_titlebar_dark'><rect width='16' height='16' fill='white'/></clipPath></defs></svg>";
export const WORKBENCH_TITLEBAR_APP_ICON_LIGHT_SRC =
  `data:image/svg+xml,${encodeURIComponent(WORKBENCH_TITLEBAR_APP_ICON_LIGHT_SVG)}`;
export const WORKBENCH_TITLEBAR_APP_ICON_DARK_SRC =
  `data:image/svg+xml,${encodeURIComponent(WORKBENCH_TITLEBAR_APP_ICON_DARK_SVG)}`;
export const WORKBENCH_TITLEBAR_DRAG_REGION_STYLE = {
  WebkitAppRegion: "drag",
};

export const WORKBENCH_TITLEBAR_ID = "workbench-titlebar";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

type WorkbenchTitlebarUpdateAction = {
  readonly commandId?: string;
  readonly isVisible: boolean;
  readonly isReadyToInstall?: boolean;
  readonly version?: string | null;
};

type WorkbenchTitlebarProps = Omit<WorkbenchTitlebarState, "activePage"> & {
  readonly activePage: WorkbenchTitlebarActivePage;
  readonly commandService?: ICommandService;
  readonly id?: string;
  readonly nativeHostService?: INativeHostService;
  readonly reserveWindowControls?: boolean;
  readonly updateAction?: WorkbenchTitlebarUpdateAction;
};

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

const createDefaultPageActionIcon = (
  action: WorkbenchTitlebarPageButton,
): SVGSVGElement => {
  if (action.id === "table") {
    return createLxIcon(LxIcon.downloadTray, 14, "opacity-80");
  }

  if (action.id === "chart") {
    return createLxIcon(LxIcon.chart, 14, "opacity-80");
  }

  if (action.id === "settings") {
    return createLxIcon(LxIcon.gear, 14, "opacity-80");
  }

  return createSvgIcon(
    14,
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
    "opacity-80",
  );
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
  readonly icon: LxIconDefinition | (() => SVGSVGElement);
  readonly onIntent?: () => void;
  readonly titlebarClassName: string;
};

const isWorkbenchTitlebarRuntimeAction = (
  action: IAction,
): action is WorkbenchTitlebarRuntimeAction =>
  action instanceof Action &&
  "icon" in action &&
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
  readonly icon: LxIconDefinition | (() => SVGSVGElement);
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
    icon: {
      value: icon,
    },
    onIntent: {
      value: onIntent,
    },
    titlebarClassName: {
      value: titlebarClassName,
    },
  });
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

  protected override updateLabel(): void {
    super.updateLabel();
    if (!this.label || !isWorkbenchTitlebarRuntimeAction(this.action)) {
      return;
    }

    const icon = typeof this.action.icon === "function"
      ? this.action.icon()
      : createLxIcon(this.action.icon, 14, "opacity-80");
    this.label.replaceChildren(icon);
  }
}

const createTitlebarActionBar = (
  contentClassName: string,
): ActionBar => new ActionBar({
  className: "titlebar-actionbar",
  contentClassName,
  actionViewItemProvider: (action, options): IActionViewItem | undefined =>
    isWorkbenchTitlebarRuntimeAction(action)
      ? new TitlebarActionViewItem(action, options)
      : undefined,
});

const setupTooltipHover = (
  target: HTMLElement,
  tooltip: string,
  hoverStore?: DisposableStore,
): void => {
  if (!tooltip || !hoverStore) {
    return;
  }

  target.removeAttribute("title");
  target.setAttribute("aria-label", tooltip);
  hoverStore.add(getBaseLayerHoverDelegate().setupManagedHover(target, tooltip));
};

const createFileSelector = ({
  activeFileId,
  commandId,
  commandService,
  options,
}: {
  activeFileId: string | null;
  commandId?: string;
  commandService?: ICommandService;
  options: WorkbenchTitlebarFileOption[];
}): { readonly element: HTMLElement; readonly select: HTMLSelectElement } => {
  const wrapper = createElement("div", {
    className: "titlebar-file-select",
  });
  const select = createElement("select", {
    id: "workbench-titlebar-file-select",
    className: "titlebar-file-select-native neutral-select",
    "aria-label": localize("titlebar.fileAriaLabel", "File"),
  });

  select.value = activeFileId ?? "";
  select.addEventListener("change", () => {
    if (commandId) {
      void commandService?.executeCommand(commandId, select.value);
    }
  });

  for (const option of options) {
    const optionElement = createElement("option", {
      value: option.value,
    });
    optionElement.textContent = option.label;
    select.appendChild(optionElement);
  }

  wrapper.appendChild(select);
  return { element: wrapper, select };
};

const createQuickAccessButton = (
  commandService?: ICommandService,
  hoverStore?: DisposableStore,
): HTMLButtonElement => {
  const action =
    WorkbenchTitlebarActions.createWorkbenchTitlebarQuickAccessButton();
  const button = createIconButton(
    {
      id: action.id,
      "aria-label": action.title,
      title: action.title,
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
  setupTooltipHover(button, action.title, hoverStore);

  return button;
};

type WorkbenchTitlebarViewRefs = {
  readonly sidebarAction: WorkbenchTitlebarRuntimeAction;
  readonly navActions: ReadonlyMap<string, WorkbenchTitlebarRuntimeAction>;
  readonly pageActions: ReadonlyMap<string, WorkbenchTitlebarRuntimeAction>;
  readonly fileSelect?: HTMLSelectElement;
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
      WorkbenchTitlebarActions.createWorkbenchTitlebarSidebarButton(
        props.isSidebarVisible ?? true,
      );

    this.refs.sidebarAction.label = sidebarButton.title;
    this.refs.sidebarAction.tooltip = sidebarButton.title;
    this.refs.sidebarAction.checked = sidebarButton.isActive;

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

    const activeFileId = props.activeFileId ?? "";
    if (this.refs.fileSelect && this.refs.fileSelect.value !== activeFileId) {
      this.refs.fileSelect.value = activeFileId;
    }

    this.syncWindowControls();
  }

  public syncWindowControls(): void {
    if (!this.nativeHostService) {
      return;
    }

    const style = getComputedStyle(this.element);
    const height = Math.round(this.element.getBoundingClientRect().height) || 38;
    void this.nativeHostService.updateWindowControls({
      height,
      backgroundColor: style.backgroundColor,
      foregroundColor: style.color,
    }).catch(() => undefined);
  }
}

const createWorkbenchTitlebarView = (
  {
    activePage,
    activeFileId = null,
    chartIntentCommandId,
    fileOptions = [],
    fileSelectionCommandId,
    canNavigateBack = false,
    canNavigateForward = false,
    commandService,
    id = WORKBENCH_TITLEBAR_ID,
    isSidebarVisible = true,
    nativeHostService,
    reserveWindowControls = false,
    showFileSelector = false,
    updateAction,
  }: WorkbenchTitlebarProps,
  hoverStore?: DisposableStore,
): WorkbenchTitlebarView => {
  const normalizedFileOptions =
    WorkbenchTitlebarActions.normalizeWorkbenchTitlebarFileOptions(fileOptions);
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

  const brandIconLight = createElement("img", {
    src: WORKBENCH_TITLEBAR_APP_ICON_LIGHT_SRC,
    alt: "",
    "aria-hidden": "true",
    className: "titlebar-brand-icon titlebar-brand-icon--light",
  });
  const brandIconDark = createElement("img", {
    src: WORKBENCH_TITLEBAR_APP_ICON_DARK_SRC,
    alt: "",
    "aria-hidden": "true",
    className: "titlebar-brand-icon titlebar-brand-icon--dark",
  });
  const brand = appendChildren(
    createElement("div", { className: "titlebar-brand" }),
    [brandIconLight, brandIconDark],
  );
  const actionBarDisposables: IDisposable[] = [];
  const navActionsById = new Map<string, WorkbenchTitlebarRuntimeAction>();
  const pageActionsById = new Map<string, WorkbenchTitlebarRuntimeAction>();
  let fileSelect: HTMLSelectElement | undefined;

  const navActionBar = createTitlebarActionBar(
    "titlebar-controls titlebar-controls--nav",
  );
  actionBarDisposables.push(navActionBar);
  const sidebarButton =
    WorkbenchTitlebarActions.createWorkbenchTitlebarSidebarButton(
      isSidebarVisible,
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

  center.appendChild(createQuickAccessButton(commandService, hoverStore));

  if (showFileSelector && normalizedFileOptions.length > 0) {
    const selector = createFileSelector({
      activeFileId: activeFileId,
      commandId: fileSelectionCommandId,
      commandService,
      options: normalizedFileOptions,
    });
    center.appendChild(selector.element);
    fileSelect = selector.select;
  }

  const rightControls = createElement("div", {
    className: "titlebar-right titlebar-controls",
  });

  if (updateAction?.isVisible === true) {
    const updateTitle =
      WorkbenchTitlebarActions.getWorkbenchTitlebarUpdateTitle(updateAction);
    const updateButton = createElement("button", {
      id: WorkbenchTitlebarActions.WORKBENCH_TITLEBAR_UPDATE_BUTTON_ID,
      type: "button",
      "aria-label": updateTitle,
      title: updateTitle,
      className: "titlebar-action-button",
    });
    updateButton.textContent =
      WorkbenchTitlebarActions.getWorkbenchTitlebarUpdateLabel();
    updateButton.addEventListener("click", () => {
      if (updateAction.commandId) {
        void commandService?.executeCommand(updateAction.commandId);
      }
    });
    setupTooltipHover(updateButton, updateTitle, hoverStore);
    rightControls.appendChild(updateButton);
  }

  const pageActionBar = createTitlebarActionBar("titlebar-controls");
  actionBarDisposables.push(pageActionBar);
  for (const button of pageButtons) {
    const runtimeAction = createTitlebarRuntimeAction({
      commandId: button.commandId,
      commandService,
      icon: () => createDefaultPageActionIcon(button),
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
  rightControls.appendChild(pageActionBar.domNode);

  if (reserveWindowControls) {
    rightControls.appendChild(createElement("div", {
      className: "titlebar-window-controls-spacer",
      "aria-hidden": "true",
    }));
  }

  const leftControls = appendChildren(
    createElement("div", { className: "titlebar-left" }),
    [brand, navActionBar.domNode],
  );

  return new WorkbenchTitlebarView(
    appendChildren(header, [leftControls, center, rightControls]),
    {
      fileSelect,
      navActions: navActionsById,
      pageActions: pageActionsById,
      sidebarAction: sidebarRuntimeAction,
    },
    nativeHostService,
    actionBarDisposables,
  );
};

export const createWorkbenchTitlebarElement = (
  props: WorkbenchTitlebarProps,
  hoverStore?: DisposableStore,
): HTMLElement => createWorkbenchTitlebarView(props, hoverStore).element;

const sameFileOptions = (
  prevOptions: WorkbenchTitlebarFileOption[] | undefined,
  nextOptions: WorkbenchTitlebarFileOption[] | undefined,
): boolean => {
  const prev =
    WorkbenchTitlebarActions.normalizeWorkbenchTitlebarFileOptions(prevOptions);
  const next =
    WorkbenchTitlebarActions.normalizeWorkbenchTitlebarFileOptions(nextOptions);
  if (prev.length !== next.length) {
    return false;
  }

  return prev.every((option, index) =>
    option.value === next[index]?.value &&
    option.label === next[index]?.label,
  );
};

const shouldRecreateTitlebar = (
  prev: WorkbenchTitlebarProps,
  next: WorkbenchTitlebarProps,
): boolean =>
  prev.id !== next.id ||
  prev.commandService !== next.commandService ||
  prev.showFileSelector !== next.showFileSelector ||
  prev.fileSelectionCommandId !== next.fileSelectionCommandId ||
  prev.chartIntentCommandId !== next.chartIntentCommandId ||
  prev.updateAction?.isVisible !== next.updateAction?.isVisible ||
  prev.updateAction?.version !== next.updateAction?.version ||
  prev.updateAction?.commandId !== next.updateAction?.commandId ||
  !sameFileOptions(prev.fileOptions, next.fileOptions);

export class WorkbenchTitlebarPart {
  private contentArea: HTMLElement | null = null;
  private readonly hoverStore = new DisposableStore();
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
      this.hoverStore.clear();
      this.titlebarView = createWorkbenchTitlebarView(props, this.hoverStore);
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
    this.hoverStore.clear();
    this.contentArea?.replaceChildren();
    this.renderedProps = undefined;
    this.titlebarView = undefined;
  }

  layout(): void {
    this.titlebarView?.syncWindowControls();
  }

  dispose(): void {
    this.clear();
    this.hoverStore.dispose();
    this.contentArea?.remove();
    this.contentArea = null;
  }
}

export class BrowserTitleService extends Disposable implements ITitleService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeTitlebarStateEmitter =
    this._register(new Emitter<void>());
  private titlebarState: WorkbenchTitlebarState = {};

  public readonly onDidChangeTitlebarState =
    this.onDidChangeTitlebarStateEmitter.event;

  public constructor(
    @ICommandService private readonly commandService: ICommandService,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @INativeHostService private readonly nativeHostService: INativeHostService,
  ) {
    super();

    this._register(this.layoutService.onDidChangeWorkbenchNavigation(() => {
      this.onDidChangeTitlebarStateEmitter.fire();
    }));
    this._register(this.layoutService.onDidChangePartVisibility(event => {
      if (event.partId === Parts.SIDEBAR_PART) {
        this.onDidChangeTitlebarStateEmitter.fire();
      }
    }));
  }

  public attachTitlebarPart(parent: HTMLElement): IDisposable {
    const disposables = new DisposableStore();
    const part = new WorkbenchTitlebarPart(parent);
    const render = (): void => {
      const props = this.getTitlebarProps();
      if (!props) {
        part.clear();
        return;
      }

      part.update(props);
      part.layout();
    };

    render();
    disposables.add(this.onDidChangeTitlebarState(render));
    disposables.add(part);

    return disposables;
  }

  public getTitlebarState(): WorkbenchTitlebarState | undefined {
    const state = this.titlebarState;
    const navigation = this.layoutService.getWorkbenchNavigationState();
    const windowState = getWorkbenchWindowState();
    const enabled = state.enabled ?? windowState.isDesktopChromePreviewEnabled;

    if (!enabled) {
      return undefined;
    }

    return {
      activeFileId: state.activeFileId,
      activePage: state.activePage ?? navigation.activeMainPart,
      canNavigateBack:
        state.canNavigateBack ?? navigation.historyIndex > 0,
      canNavigateForward:
        state.canNavigateForward ??
        navigation.historyIndex < navigation.historyLength - 1,
      chartIntentCommandId: state.chartIntentCommandId,
      fileSelectionCommandId: state.fileSelectionCommandId,
      fileOptions: state.fileOptions,
      installUpdateCommandId: state.installUpdateCommandId,
      isSidebarVisible:
        state.isSidebarVisible ??
        this.layoutService.isVisible(Parts.SIDEBAR_PART),
      isUpdateReadyToInstall: state.isUpdateReadyToInstall,
      showFileSelector: state.showFileSelector,
      updateVersion: state.updateVersion,
    };
  }

  private getTitlebarProps(): WorkbenchTitlebarProps | undefined {
    const state = this.getTitlebarState();

    if (!state) {
      return undefined;
    }

    const windowState = getWorkbenchWindowState();
    return {
      ...state,
      activePage: state.activePage ?? "table",
      id: WORKBENCH_TITLEBAR_ID,
      commandService: this.commandService,
      nativeHostService: this.nativeHostService,
      reserveWindowControls: windowState.isWindowsDesktopShell,
      updateAction: {
        commandId: state.installUpdateCommandId,
        isVisible: Boolean(state.isUpdateReadyToInstall),
        isReadyToInstall: state.isUpdateReadyToInstall,
        version: state.updateVersion,
      },
    };
  }

  public layout(): void {
    this.onDidChangeTitlebarStateEmitter.fire();
  }

  public updateTitlebarState(state: WorkbenchTitlebarState = {}): void {
    this.titlebarState = state;
    this.onDidChangeTitlebarStateEmitter.fire();
  }
}

registerSingleton(
  ITitleService,
  BrowserTitleService,
  InstantiationType.Delayed,
);
