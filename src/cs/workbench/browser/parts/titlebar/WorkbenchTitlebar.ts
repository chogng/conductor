import {
  lxAnalysis,
  lxArrowLeft,
  lxArrowRight,
  lxDownloadTray,
  lxGear,
} from "cogicon";
import {
  normalizeCogIconSvgMarkup,
  type CogIconRenderer,
} from "src/cs/base/browser/ui/CogIcon/cogicon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import {
  createWorkbenchTitlebarNavActions,
  createWorkbenchTitlebarPageActions,
  createWorkbenchTitlebarWindowActions,
  getWorkbenchTitlebarUpdateLabel,
  getWorkbenchTitlebarUpdateTitle,
  normalizeWorkbenchTitlebarAnalysisFileOptions,
} from "src/cs/workbench/browser/parts/titlebar/titlebarActions";
import {
  WORKBENCH_TITLEBAR_APP_ICON_SRC,
  type WorkbenchTitlebarActivePage,
  type WorkbenchTitlebarAnalysisFileOption,
  type WorkbenchTitlebarPageAction,
  type WorkbenchTitlebarUpdateAction,
} from "src/cs/workbench/browser/parts/titlebar/titlebarPart";

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

const createCogIcon = (
  icon: CogIconRenderer,
  size: number,
  className = "",
): SVGSVGElement => {
  const container = document.createElement("div");
  container.innerHTML = normalizeCogIconSvgMarkup(icon);
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
    return createCogIcon(lxDownloadTray, 14, "opacity-80");
  }

  if (action.id === "analysis") {
    return createCogIcon(lxAnalysis, 14, "opacity-80");
  }

  if (action.id === "settings") {
    return createCogIcon(lxGear, 14, "opacity-80");
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
    className: "da_top_menu_center_file_select",
  });
  const select = createElement("select", {
    id: "analysis-window-file-select",
    className: "da_top_menu_file_select_native da-neutral-select",
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
    className: "da_top_menu_bar",
  });

  header.addEventListener("contextmenu", (event) => event.preventDefault());

  const brandIcon = createElement("img", {
    src: WORKBENCH_TITLEBAR_APP_ICON_SRC,
    alt: "",
    "aria-hidden": "true",
    className: "da_top_menu_brand_icon",
  });
  const brand = appendChildren(
    createElement("div", { className: "da_top_menu_brand" }),
    [brandIcon],
  );
  const navControls = createElement("div", {
    className: "da_window_controls ml-4",
  });

  for (const action of navActions) {
    const isBack = action.id === "analysis-window-nav-back-btn";

    navControls.appendChild(
      createIconButton(
        {
          id: action.id,
          "aria-label": action.title,
          title: action.title,
          className: "da_window_icon_btn",
          disabled: action.isDisabled,
        },
        createCogIcon(isBack ? lxArrowLeft : lxArrowRight, 14, "opacity-80"),
        isBack ? onNavigateBack : onNavigateForward,
      ),
    );
  }

  const center = createElement("div", {
    className: "da_top_menu_center",
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
    className: "da_window_controls",
  });

  if (updateAction?.isVisible === true) {
    const updateButton = createElement("button", {
      id: "analysis-window-update-btn",
      type: "button",
      "aria-label": getWorkbenchTitlebarUpdateTitle(t, updateAction),
      title: getWorkbenchTitlebarUpdateTitle(t, updateAction),
      className: "da_window_action_btn",
    });
    updateButton.textContent = getWorkbenchTitlebarUpdateLabel(t);
    updateButton.addEventListener("click", () => updateAction.onClick?.());
    rightControls.appendChild(updateButton);
  }

  for (const action of pageActions) {
    const pageActionIcon = createDefaultPageActionIcon(action);
    const className = `da_window_icon_btn ${
      action.isActive ? "da_top_nav_btn--active" : ""
    }`.trim();
    const button = createIconButton(
      {
        id:
          action.id === "data"
            ? "analysis-window-data-btn"
            : action.id === "analysis"
              ? "analysis-window-analysis-btn"
              : action.id === "settings"
              ? "analysis-window-settings-btn"
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
        className: `da_window_control_btn ${
          action.isDanger ? "da_window_control_btn--close" : ""
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
