import { lxAnalysis, lxArrowLeft, lxArrowRight, lxDownloadTray, lxGear } from "@chogng/lxicon";
import {
  normalizeLxIconSvgMarkup,
  type LxIconRenderer,
} from "src/cs/base/browser/ui/lxicon/lxicon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { layoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import {
  createWorkbenchTitlebarNavActions,
  createWorkbenchTitlebarPageActions,
  createWorkbenchTitlebarWindowActions,
  getWorkbenchTitlebarUpdateLabel,
  getWorkbenchTitlebarUpdateTitle,
  normalizeWorkbenchTitlebarAnalysisFileOptions,
} from "src/cs/workbench/browser/parts/titlebar/titlebarActions";

const WORKBENCH_TITLEBAR_APP_ICON_SVG =
  "<svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'><g clip-path='url(#clip0_603_2)'><path d='M7.91992 1.02246C9.4735 1.02257 10.9072 1.53174 12.0665 2.39069C12.2996 2.56345 12.3108 2.90112 12.1056 3.10632L10.6672 4.54471C10.4891 4.72286 10.2078 4.73751 9.99299 4.60591C9.3893 4.2361 8.67972 4.02256 7.91992 4.02246C5.72275 4.02246 3.94141 5.8038 3.94141 8.00098C3.94167 10.1979 5.72291 11.9795 7.91992 11.9795C8.67978 11.9794 9.38932 11.7652 9.99302 11.3952C10.2078 11.2635 10.4891 11.2781 10.6672 11.4563L12.1056 12.8947C12.3108 13.0999 12.2996 13.4375 12.0665 13.6103C10.9072 14.4695 9.47358 14.9794 7.91992 14.9795C4.06605 14.9795 0.941667 11.8548 0.941406 8.00098C0.941406 4.14695 4.06589 1.02246 7.91992 1.02246Z' fill='url(#paint0_linear_603_2)'/><path d='M14 0.75C14.6904 0.75 15.25 1.30964 15.25 2V4.75781C15.2499 5.88482 14.8018 6.96577 14.0049 7.7627L13.7676 8L14.0049 8.2373C14.8018 9.03423 15.2499 10.1152 15.25 11.2422V14C15.25 14.6904 14.6904 15.25 14 15.25C13.3096 15.25 12.75 14.6904 12.75 14V11.2422C12.7499 10.7782 12.5654 10.333 12.2373 10.0049L11.4824 9.25H9.55957C9.19302 9.70674 8.6312 10 8 10C6.89543 10 6 9.10457 6 8C6 6.89543 6.89543 6 8 6C8.6312 6 9.19302 6.29326 9.55957 6.75H11.4824L12.2373 5.99512C12.5654 5.66704 12.7499 5.22178 12.75 4.75781V2C12.75 1.30964 13.3096 0.75 14 0.75Z' fill='url(#paint1_linear_603_2)'/></g><defs><linearGradient id='paint0_linear_603_2' x1='6.59619' y1='1.02246' x2='6.59619' y2='14.9795' gradientUnits='userSpaceOnUse'><stop stop-color='#DDB5FF'/><stop offset='0.490385' stop-color='#7252FF'/><stop offset='1' stop-color='#1B2AFF'/></linearGradient><linearGradient id='paint1_linear_603_2' x1='8' y1='6' x2='8' y2='10' gradientUnits='userSpaceOnUse'><stop stop-color='#DFBBFF'/><stop offset='1' stop-color='#0D00FF'/></linearGradient><clipPath id='clip0_603_2'><rect width='16' height='16' fill='white'/></clipPath></defs></svg>";
export const WORKBENCH_TITLEBAR_APP_ICON_SRC =
  `data:image/svg+xml,${encodeURIComponent(WORKBENCH_TITLEBAR_APP_ICON_SVG)}`;
export const WORKBENCH_TITLEBAR_DRAG_REGION_STYLE = {
  WebkitAppRegion: "drag",
};

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

export type WorkbenchTitlebarProps = {
  activePage: WorkbenchTitlebarActivePage;
  analysisActiveFileId?: string | null;
  analysisFileOptions?: WorkbenchTitlebarAnalysisFileOption[];
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  id?: string;
  onAnalysisFileChange?: (fileId: string) => void;
  onAnalysisIntent?: () => void;
  onCloseWindow?: () => void;
  onMinimizeWindow?: () => void;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  onOpenSettings?: () => void;
  onPageChange?: (page: "data" | "analysis") => void;
  onToggleMaximizeWindow?: () => void;
  showAnalysisFileSelector?: boolean;
  t: TranslateFn;
  updateAction?: WorkbenchTitlebarUpdateAction;
};

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
  icon: LxIconRenderer,
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
  action: WorkbenchTitlebarPageAction,
): SVGSVGElement => {
  if (action.id === "data") {
    return createLxIcon(lxDownloadTray, 14, "opacity-80");
  }

  if (action.id === "analysis") {
    return createLxIcon(lxAnalysis, 14, "opacity-80");
  }

  if (action.id === "settings") {
    return createLxIcon(lxGear, 14, "opacity-80");
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

const createFileSelector = ({
  activeFileId,
  options,
  onChange,
}: {
  activeFileId: string | null;
  options: WorkbenchTitlebarAnalysisFileOption[];
  onChange?: (fileId: string) => void;
}): HTMLElement => {
  const wrapper = createElement("div", {
    className: "titlebar-file-select",
  });
  const select = createElement("select", {
    id: "analysis-window-file-select",
    className: "titlebar-file-select-native da-neutral-select",
    "aria-label": "Analysis file",
  });

  select.value = activeFileId ?? "";
  select.addEventListener("change", () => onChange?.(select.value));

  for (const option of options) {
    const optionElement = createElement("option", {
      value: option.value,
    });
    optionElement.textContent = option.label;
    select.appendChild(optionElement);
  }

  wrapper.appendChild(select);
  return wrapper;
};

export const createWorkbenchTitlebarElement = ({
  activePage,
  analysisActiveFileId = null,
  analysisFileOptions = [],
  canNavigateBack = false,
  canNavigateForward = false,
  id = "workbench-titlebar",
  onAnalysisFileChange,
  onAnalysisIntent,
  onCloseWindow,
  onMinimizeWindow,
  onNavigateBack,
  onNavigateForward,
  onOpenSettings,
  onPageChange,
  onToggleMaximizeWindow,
  showAnalysisFileSelector = false,
  t,
  updateAction,
}: WorkbenchTitlebarProps): HTMLElement => {
  const normalizedAnalysisFileOptions =
    normalizeWorkbenchTitlebarAnalysisFileOptions(analysisFileOptions);
  const navActions = createWorkbenchTitlebarNavActions(
    t,
    canNavigateBack,
    canNavigateForward,
  );
  const pageActions = createWorkbenchTitlebarPageActions(t, activePage);
  const windowActions = createWorkbenchTitlebarWindowActions(t);
  const header = createElement("header", {
    id,
    className: "titlebar-root",
  });

  header.addEventListener("contextmenu", (event) => event.preventDefault());

  const brandIcon = createElement("img", {
    src: WORKBENCH_TITLEBAR_APP_ICON_SRC,
    alt: "",
    "aria-hidden": "true",
    className: "titlebar-brand-icon",
  });
  const brand = appendChildren(
    createElement("div", { className: "titlebar-brand" }),
    [brandIcon],
  );
  const navControls = createElement("div", {
    className: "titlebar-controls titlebar-controls--nav",
  });

  for (const action of navActions) {
    const isBack = action.id === "analysis-window-nav-back-btn";

    navControls.appendChild(
      createIconButton(
        {
          id: action.id,
          "aria-label": action.title,
          title: action.title,
          className: "titlebar-icon-button",
          disabled: action.isDisabled,
        },
        createLxIcon(isBack ? lxArrowLeft : lxArrowRight, 14, "opacity-80"),
        isBack ? onNavigateBack : onNavigateForward,
      ),
    );
  }

  const center = createElement("div", {
    className: "titlebar-center",
  });

  if (showAnalysisFileSelector && normalizedAnalysisFileOptions.length > 0) {
    center.appendChild(
      createFileSelector({
        activeFileId: analysisActiveFileId,
        options: normalizedAnalysisFileOptions,
        onChange: onAnalysisFileChange,
      }),
    );
  }

  const rightControls = createElement("div", {
    className: "titlebar-controls",
  });

  if (updateAction?.isVisible === true) {
    const updateButton = createElement("button", {
      id: layoutService.elements.titlebarUpdateButton,
      type: "button",
      "aria-label": getWorkbenchTitlebarUpdateTitle(t, updateAction),
      title: getWorkbenchTitlebarUpdateTitle(t, updateAction),
      className: "titlebar-action-button",
    });
    updateButton.textContent = getWorkbenchTitlebarUpdateLabel(t);
    updateButton.addEventListener("click", () => updateAction.onClick?.());
    rightControls.appendChild(updateButton);
  }

  for (const action of pageActions) {
    const pageActionIcon = createDefaultPageActionIcon(action);
    const className = `titlebar-icon-button ${
      action.isActive ? "titlebar-page-button--active" : ""
    }`.trim();
    const button = createIconButton(
      {
        id:
          action.id === "data"
            ? layoutService.elements.dataViewSwitch
            : action.id === "analysis"
              ? layoutService.elements.analysisViewSwitch
              : action.id === "settings"
                ? layoutService.elements.settingsViewSwitch
                : undefined,
        "aria-label": action.title,
        title: action.title,
        className,
      },
      pageActionIcon,
      () => {
        if (action.id === "data" || action.id === "analysis") {
          onPageChange?.(action.id);
          return;
        }

        onOpenSettings?.();
      },
    );

    if (action.id === "analysis") {
      button.addEventListener("mouseenter", () => onAnalysisIntent?.());
      button.addEventListener("focus", () => onAnalysisIntent?.());
    }

    rightControls.appendChild(button);
  }

  for (const action of windowActions) {
    const icon =
      action.id === "minimize"
        ? createSvgIcon(14, "M5 12h14")
        : action.id === "maximize"
          ? createSvgIcon(12, "M5 5h14v14H5z")
          : createSvgIcon(14, "M18 6 6 18|M6 6l12 12");
    const button = createIconButton(
      {
        id: `analysis-window-${action.id}-btn`,
        "aria-label": action.title,
        title: action.title,
        className: `titlebar-window-button ${
          action.isDanger ? "titlebar-window-button--close" : ""
        }`.trim(),
      },
      icon,
      action.id === "minimize"
        ? onMinimizeWindow
        : action.id === "maximize"
          ? onToggleMaximizeWindow
          : onCloseWindow,
    );

    rightControls.appendChild(button);
  }

  return appendChildren(header, [brand, navControls, center, rightControls]);
};

export class WorkbenchTitlebarPart {
  private contentArea: HTMLElement | null = null;

  constructor(private readonly parent: HTMLElement) {}

  createContentArea(parent = this.parent): HTMLElement {
    if (this.contentArea) {
      return this.contentArea;
    }

    const contentArea = createElement("div", {
      className: "workbench_titlebar_part",
    });
    parent.replaceChildren(contentArea);
    this.contentArea = contentArea;

    return contentArea;
  }

  update(props: WorkbenchTitlebarProps): void {
    const contentArea = this.createContentArea();
    contentArea.replaceChildren(createWorkbenchTitlebarElement(props));
  }

  layout(): void {
    // The titlebar is CSS-sized today; keep the lifecycle hook explicit.
  }

  dispose(): void {
    this.contentArea?.remove();
    this.contentArea = null;
  }
}
