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
      `titlebar-icon-button pointer-events-none ${className}`.trim(),
    ),
    [createElement("div", "titlebar-skeleton-icon-dot")],
  );

const createSkeletonWindowControl = (className = ""): HTMLElement =>
  appendChildren(
    createElement(
      "div",
      `titlebar-window-button pointer-events-none ${className}`.trim(),
    ),
    [createElement("div", "titlebar-skeleton-control-dot")],
  );

export const createWorkbenchTitlebarSkeletonElement = ({
  className = "",
}: WorkbenchTitlebarSkeletonOptions = {}): HTMLElement => {
  const header = createElement("header", `titlebar-root ${className}`.trim());
  header.setAttribute("aria-hidden", "true");

  const brandIcon = createElement("img", "titlebar-brand-icon");
  brandIcon.src = WORKBENCH_TITLEBAR_APP_ICON_SRC;
  brandIcon.alt = "";
  brandIcon.setAttribute("aria-hidden", "true");

  return appendChildren(header, [
    appendChildren(createElement("div", "titlebar-brand"), [brandIcon]),
    appendChildren(createElement("div", "titlebar-controls titlebar-controls--nav"), [
      createSkeletonIcon(),
      createSkeletonIcon(),
    ]),
    appendChildren(createElement("div", "titlebar-center"), [
      createElement(
        "div",
        "titlebar-skeleton-file-select",
      ),
    ]),
    appendChildren(createElement("div", "titlebar-controls"), [
      createSkeletonIcon(),
      createSkeletonIcon(),
      createSkeletonIcon(),
      createSkeletonIcon(),
      createSkeletonWindowControl(),
      createSkeletonWindowControl(),
      createSkeletonWindowControl("titlebar-window-button--close"),
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
