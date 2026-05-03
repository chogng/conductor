import { type HTMLAttributes } from "react";
import { cx } from "../../utils/cx";
import MenuScrollArea from "./MenuScrollArea";
import "./menu.css";

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
    <MenuScrollArea>
      {children}
    </MenuScrollArea>
  ) : (
    children
  );

  return (
    <div
      {...props}
      role={role}
      className={cx("ui-menu", className)}
    >
      {content}
    </div>
  );
};

export default Menu;
