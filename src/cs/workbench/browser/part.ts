import "src/cs/workbench/browser/media/part.css";

export type WorkbenchParts = {
  readonly controller?: Node | null;
  readonly main: HTMLElement;
  readonly overlay?: Node | null;
  readonly sidebar: Node | null;
};

export type PanePartOptions = {
  readonly children?: Node | null;
  readonly isActive: boolean;
  readonly labelledBy: string;
  readonly paneId: string;
};

export type ScrollPanePartOptions = PanePartOptions & {
  readonly className?: string;
  readonly viewportClassName?: string;
};

type WorkbenchPartsOptions = {
  readonly analysis?: Node | null;
  readonly controller?: Node | null;
  readonly data?: Node | null;
  readonly overlay?: Node | null;
  readonly sidebar?: Node | null;
};

export const createWorkbenchParts = ({
  analysis,
  controller,
  data,
  overlay,
  sidebar,
}: WorkbenchPartsOptions): WorkbenchParts => {
  const main = document.createElement("div");
  main.className = "workbench_parts_main";
  appendIfPresent(main, data);
  appendIfPresent(main, analysis);

  return {
    controller,
    main,
    overlay,
    sidebar: sidebar ?? null,
  };
};

export const createPanePart = ({
  children,
  isActive,
  labelledBy,
  paneId,
}: PanePartOptions): HTMLElement => {
  const section = document.createElement("section");
  section.id = paneId;
  section.role = "region";
  section.setAttribute("aria-labelledby", labelledBy);
  section.setAttribute("aria-hidden", String(!isActive));
  section.className = isActive ? "workbench_pane_part" : "workbench_pane_part workbench_pane_part--hidden";
  if (!isActive) {
    section.inert = true;
  }
  appendIfPresent(section, children);
  return section;
};

export const createScrollPanePart = ({
  children,
  isActive,
  labelledBy,
  paneId,
  className = "da_page_scroll workbench_scroll_pane_part",
  viewportClassName = "",
}: ScrollPanePartOptions): HTMLElement =>
  createPanePart({
    isActive,
    labelledBy,
    paneId,
    children: createScrollArea({ children, className, viewportClassName }),
  });

const createScrollArea = ({
  children,
  className,
  viewportClassName,
}: {
  readonly children?: Node | null;
  readonly className: string;
  readonly viewportClassName: string;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = `scrollArea ${className}`.trim();

  const viewport = document.createElement("div");
  viewport.className = `scrollAreaViewport ${viewportClassName}`.trim();
  viewport.dataset.axis = "y";
  appendIfPresent(viewport, children);
  root.append(viewport);

  return root;
};

const appendIfPresent = (parent: HTMLElement, child: Node | null | undefined): void => {
  if (child) {
    parent.append(child);
  }
};
