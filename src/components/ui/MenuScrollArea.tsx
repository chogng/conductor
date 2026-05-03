import { type ComponentProps } from "react";
import { cx } from "../../utils/cx";
import ScrollArea from "./ScrollArea";

type MenuScrollAreaProps = Omit<ComponentProps<typeof ScrollArea>, "axis">;

const MenuScrollArea = ({
  className = "",
  viewportClassName = "",
  viewportProps,
  ...props
}: MenuScrollAreaProps) => (
  <ScrollArea
    {...props}
    axis="y"
    className={cx("ui-menu__scroll-area max-h-60 -mr-1 pr-1", className)}
    viewportClassName={cx("max-h-60", viewportClassName)}
    viewportProps={{
      ...viewportProps,
      style: {
        height: "auto",
        maxHeight: "15rem",
        ...viewportProps?.style,
      },
    }}
  />
);

export default MenuScrollArea;
