import {
  createGridView,
  type GridViewOptions,
  type GridViewOrientation,
} from "src/cs/base/browser/ui/grid/gridview";

export type GridOrientation = GridViewOrientation;

export type GridItem = {
  readonly id: string;
  readonly element: HTMLElement;
  readonly className?: string;
};

export type GridOptions = Omit<GridViewOptions, "items"> & {
  readonly items: readonly GridItem[];
};

export const createGrid = ({ items, ...options }: GridOptions): HTMLDivElement =>
  createGridView({
    ...options,
    items: items.map((item, index) => ({
      className: item.className,
      element: item.element,
      location: [index],
    })),
  });
