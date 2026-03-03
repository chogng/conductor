import React from "react";
import { normalizeCtaName, normalizeCtaToken } from "../../utils/cta";

const cx = (...classes) => classes.filter(Boolean).join(" ");

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
}) => {
    const mode = src ? "image" : Icon ? "icon" : "fallback";

    const sizeClasses = {
        sm: "avatar--sm",
        md: "avatar--md",
        lg: "avatar--lg",
        xl: "avatar--xl",
    };

    const variantClasses = {
        default: null,
        empty: "avatar--empty",
    };

    const baseClasses = "avatar";

    return (
        <div
            className={cx(
                baseClasses,
                sizeClasses[size],
                variantClasses[variant] || null,
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
