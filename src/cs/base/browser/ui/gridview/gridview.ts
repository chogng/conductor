import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/gridview/gridview.css";

export type GridViewOrientation = "horizontal" | "vertical";

export type GridViewItem = {
  readonly id: string;
  readonly element: HTMLElement;
  readonly className?: string;
};

export type GridViewOptions = {
  readonly className?: string;
  readonly gap?: number;
  readonly items: readonly GridViewItem[];
  readonly orientation?: GridViewOrientation;
  readonly sizes: readonly number[];
};

export type GridViewStyle = {
  gap: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
};

export const getGridViewClassName = (className = ""): string =>
  cx("ui-grid-view", className);

export const getGridViewItemClassName = (className = ""): string =>
  cx("ui-grid-view__item", className);

export const getGridViewStyle = ({
  gap = 0,
  orientation = "horizontal",
  sizes,
}: Pick<GridViewOptions, "gap" | "orientation" | "sizes">): GridViewStyle => {
  const template = sizes.map((size) => `${Math.max(0, size)}px`).join(" ");

  return orientation === "horizontal"
    ? { gap: `${Math.max(0, gap)}px`, gridTemplateColumns: template }
    : { gap: `${Math.max(0, gap)}px`, gridTemplateRows: template };
};

export const createGridView = ({
  className = "",
  gap = 0,
  items,
  orientation = "horizontal",
  sizes,
}: GridViewOptions): HTMLDivElement => {
  const element = document.createElement("div");
  element.className = getGridViewClassName(className);
  element.dataset.orientation = orientation;
  Object.assign(element.style, getGridViewStyle({ gap, orientation, sizes }));

  for (const item of items) {
    const itemElement = document.createElement("div");
    itemElement.className = getGridViewItemClassName(item.className);
    itemElement.append(item.element);
    element.append(itemElement);
  }

  return element;
};
