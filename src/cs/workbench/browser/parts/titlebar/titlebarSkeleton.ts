import { WORKBENCH_TITLEBAR_APP_ICON_SRC } from "src/cs/workbench/browser/parts/titlebar/titlebarPart";

type WorkbenchTitlebarSkeletonOptions = {
  className?: string;
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className = "",
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  return element;
};

const appendChildren = <T extends HTMLElement>(
  parent: T,
  children: HTMLElement[],
): T => {
  for (const child of children) {
    parent.appendChild(child);
  }

  return parent;
};

const createSkeletonIcon = (className = ""): HTMLElement =>
  appendChildren(
    createElement(
      "div",
      `da_window_icon_btn pointer-events-none ${className}`.trim(),
    ),
    [createElement("div", "workbench_titlebar_skeleton_icon_dot")],
  );

const createSkeletonWindowControl = (className = ""): HTMLElement =>
  appendChildren(
    createElement(
      "div",
      `da_window_control_btn pointer-events-none ${className}`.trim(),
    ),
    [createElement("div", "workbench_titlebar_skeleton_control_dot")],
  );

export const createWorkbenchTitlebarSkeletonElement = ({
  className = "",
}: WorkbenchTitlebarSkeletonOptions = {}): HTMLElement => {
  const header = createElement("header", `da_top_menu_bar ${className}`.trim());
  header.setAttribute("aria-hidden", "true");

  const brandIcon = createElement("img", "da_top_menu_brand_icon");
  brandIcon.src = WORKBENCH_TITLEBAR_APP_ICON_SRC;
  brandIcon.alt = "";
  brandIcon.setAttribute("aria-hidden", "true");

  return appendChildren(header, [
    appendChildren(createElement("div", "da_top_menu_brand"), [brandIcon]),
    appendChildren(createElement("div", "da_window_controls da_window_controls--nav"), [
      createSkeletonIcon(),
      createSkeletonIcon(),
    ]),
    appendChildren(createElement("div", "da_top_menu_center"), [
      createElement(
        "div",
        "workbench_titlebar_skeleton_file_select",
      ),
    ]),
    appendChildren(createElement("div", "da_window_controls"), [
      createSkeletonIcon(),
      createSkeletonIcon(),
      createSkeletonIcon(),
      createSkeletonIcon(),
      createSkeletonIcon(),
      createSkeletonWindowControl(),
      createSkeletonWindowControl(),
      createSkeletonWindowControl("da_window_control_btn--close"),
    ]),
  ]);
};

export const renderWorkbenchTitlebarSkeleton = (
  container: HTMLElement,
  options?: WorkbenchTitlebarSkeletonOptions,
): (() => void) => {
  container.replaceChildren(createWorkbenchTitlebarSkeletonElement(options));

  return () => {
    container.replaceChildren();
  };
};
