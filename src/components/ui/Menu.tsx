import { type HTMLAttributes } from "react";
import { cx } from "../../utils/cx";
import ScrollArea from "./ScrollArea";

const DEFAULT_MENU_CLASSNAME =
  "!bg-bg-surface !backdrop-blur-none text-text-primary p-1.5";

type MenuProps = HTMLAttributes<HTMLDivElement> & {
  withScrollArea?: boolean;
};

const Menu = ({
  role = "menu",
  className = "",
  children,
  withScrollArea = true,
  ...props
}: MenuProps) => {
  const content = withScrollArea ? (
    <ScrollArea className="max-h-60" viewportClassName="pr-1" axis="y">
      {children}
    </ScrollArea>
  ) : (
    children
  );

  return (
    <div
      {...props}
      role={role}
      className={cx(DEFAULT_MENU_CLASSNAME, className)}
    >
      {content}
    </div>
  );
};

export default Menu;
