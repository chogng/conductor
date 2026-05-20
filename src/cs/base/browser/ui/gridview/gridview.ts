import { jsx } from "react/jsx-runtime";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { cx } from "src/utils/cx";
import "./gridview.css";

export type GridViewOrientation = "horizontal" | "vertical";

export type GridViewItem = {
  readonly id: string;
  readonly children: ReactNode;
  readonly className?: string;
};

export type GridViewProps = {
  readonly className?: string;
  readonly gap?: number;
  readonly items: readonly GridViewItem[];
  readonly orientation?: GridViewOrientation;
  readonly sizes: readonly number[];
};

const GridView = ({
  className = "",
  gap = 0,
  items,
  orientation = "horizontal",
  sizes,
}: GridViewProps) => {
  const gridStyle = useMemo<CSSProperties>(() => {
    const template = sizes.map((size) => `${Math.max(0, size)}px`).join(" ");

    return {
      gap: `${Math.max(0, gap)}px`,
      ...(orientation === "horizontal"
        ? { gridTemplateColumns: template }
        : { gridTemplateRows: template }),
    };
  }, [gap, orientation, sizes]);

  return jsx("div", {
    className: cx("ui-grid-view", className),
    "data-orientation": orientation,
    style: gridStyle,
    children: items.map((item) =>
      jsx("div", {
        className: cx("ui-grid-view__item", item.className),
        children: item.children,
      }, item.id),
    ),
  });
};

export default GridView;
