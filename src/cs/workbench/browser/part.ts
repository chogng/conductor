import { jsx, jsxs } from "react/jsx-runtime";
import type { ReactNode } from "react";
import ScrollArea from "src/cs/base/browser/ui/scrollArea/scrollArea";

export type WorkbenchParts = {
  readonly controller?: ReactNode;
  readonly main: ReactNode;
  readonly overlay?: ReactNode;
  readonly sidebar: ReactNode;
};

export type PanePartOptions = {
  readonly children: ReactNode;
  readonly isActive: boolean;
  readonly labelledBy: string;
  readonly paneId: string;
};

export type ScrollPanePartOptions = PanePartOptions & {
  readonly className?: string;
  readonly viewportClassName?: string;
};

type WorkbenchPartsOptions = {
  readonly analysis: ReactNode;
  readonly controller?: ReactNode;
  readonly data: ReactNode;
  readonly overlay?: ReactNode;
  readonly sidebar: ReactNode;
};

export const createWorkbenchParts = ({
  analysis,
  controller,
  data,
  overlay,
  sidebar,
}: WorkbenchPartsOptions): WorkbenchParts => ({
  controller,
  main: jsxs("div", {
    className: "relative h-full min-h-0",
    children: [data, analysis],
  }),
  overlay,
  sidebar,
});

export const createPanePart = ({
  children,
  isActive,
  labelledBy,
  paneId,
}: PanePartOptions): ReactNode =>
  jsx("section", {
    id: paneId,
    role: "region",
    "aria-labelledby": labelledBy,
    "aria-hidden": !isActive,
    inert: !isActive ? true : undefined,
    className: isActive ? "h-full min-h-0" : "hidden h-full min-h-0",
    children,
  });

export const createScrollPanePart = ({
  children,
  isActive,
  labelledBy,
  paneId,
  className = "da_page_scroll h-full min-h-0",
  viewportClassName,
}: ScrollPanePartOptions): ReactNode =>
  createPanePart({
    isActive,
    labelledBy,
    paneId,
    children: jsx(ScrollArea, {
      className,
      viewportClassName,
      axis: "y",
      children,
    }),
  });
