import { jsx } from "react/jsx-runtime";
import type { CSSProperties, HTMLAttributes } from "react";
import {
  normalizeCogIconSvgMarkup,
  type CogIconRenderer,
} from "src/cs/base/browser/ui/cogIcon/cogIconMarkup";
import { cx } from "src/utils/cx";

type CogIconProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  icon: CogIconRenderer;
  size?: number | string;
};

const CogIcon = ({
  className,
  icon,
  size = 16,
  style,
  ...props
}: CogIconProps) => {
  const iconStyle: CSSProperties =
    typeof size === "number"
      ? {
          width: `${size}px`,
          height: `${size}px`,
          ...style,
        }
      : {
          width: size,
          height: size,
          ...style,
        };

  return jsx("span", {
    ...props,
    className: cx("ui-cogicon", className),
    style: iconStyle,
    dangerouslySetInnerHTML: {
      __html: normalizeCogIconSvgMarkup(icon),
    },
  });
};

export default CogIcon;

export { normalizeCogIconSvgMarkup, type CogIconRenderer };
