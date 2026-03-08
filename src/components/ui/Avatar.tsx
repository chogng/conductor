import type { ComponentType, HTMLAttributes } from "react";
import { normalizeCtaName, normalizeCtaToken } from "../../utils/cta";

const cx = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(" ");

type AvatarSize = "sm" | "md" | "lg" | "xl";
type AvatarVariant = "default" | "empty";

type AvatarProps = HTMLAttributes<HTMLDivElement> & {
  src?: string;
  fallback?: string;
  icon?: ComponentType<{ className?: string }>;
  size?: AvatarSize;
  variant?: AvatarVariant;
  imageClassName?: string;
  iconClassName?: string;
  cta?: string;
  ctaPosition?: string;
  ctaCopy?: string;
};

const Avatar = ({
  src,
  fallback,
  icon: Icon,
  size = "md",
  variant = "default",
  className,
  imageClassName,
  iconClassName,
  cta,
  ctaPosition,
  ctaCopy,
  ...props
}: AvatarProps) => {
  const mode = src ? "image" : Icon ? "icon" : "fallback";

  const sizeClasses: Record<AvatarSize, string> = {
    sm: "avatar--sm",
    md: "avatar--md",
    lg: "avatar--lg",
    xl: "avatar--xl",
  };

  const variantClasses: Record<AvatarVariant, string | null> = {
    default: null,
    empty: "avatar--empty",
  };

  return (
    <div
      className={cx(
        "avatar",
        sizeClasses[size],
        variantClasses[variant],
        src && "avatar--image",
        className,
      )}
      data-mode={mode}
      data-cta={normalizeCtaName(cta)}
      data-cta-position={normalizeCtaToken(ctaPosition)}
      data-cta-copy={normalizeCtaToken(ctaCopy)}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={fallback || "Avatar"}
          className={cx("w-full h-full object-cover", imageClassName)}
        />
      ) : Icon ? (
        <Icon className={cx("w-[60%] h-[60%]", iconClassName)} />
      ) : (
        <span>{fallback?.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
};

export default Avatar;
