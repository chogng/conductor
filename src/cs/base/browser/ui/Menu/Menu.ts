import { jsx } from "react/jsx-runtime";
import { type HTMLAttributes } from "react";
import { cx } from "src/utils/cx";
import MenuScrollArea from "cs/base/browser/ui/MenuScrollArea/MenuScrollArea";
import "./menu.css";

type MenuProps = HTMLAttributes<HTMLDivElement> & {
    withScrollArea?: boolean;
};
const Menu = ({ role = "menu", className = "", children, withScrollArea = true, ...props }: MenuProps) => {
    const content = withScrollArea ? (jsx(MenuScrollArea, {
        children: children
    })) : (children);
    return (jsx("div", {
        ...props,
        role: role,
        className: cx("ui-menu", className),
        children: content
    }));
};
export default Menu;
