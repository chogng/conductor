import { forwardRef } from "react";
import { normalizeCtaName, normalizeCtaToken } from "../../utils/cta";

const cx = (...parts) => parts.filter(Boolean).join(" ");

/**
 * Button (UI)
 * - Matches `docs/button_component_spec.md` (`action-btn*` classes in `src/styles/global.css`)
 * - Defaults `type="button"` to avoid accidental submits
 */
const Button = forwardRef(
  (
      {
        children,
        type = "button",
        variant = "primary", // primary | secondary | ghost | text | danger
        size = "md", // sm | md | lg | control
        fx = false,
        fullWidth = false,
        className = "",
        disabled = false,
        testId,
        dataIcon,
        cta,
        ctaPosition,
        ctaCopy,
        ...props
      },
      ref,
    ) => {
      const isDisabled = !!disabled;
    const devTestId = import.meta.env.DEV && testId ? testId : undefined;

    const resolvedVariant = (() => {
      if (isDisabled) return "disabled";
      if (variant === "ghost") return "ghost";
      return variant;
    })();

    const variantClass = (() => {
      if (resolvedVariant === "disabled") return "action-btn--disabled";
      if (resolvedVariant === "secondary") return "action-btn--secondary";
      if (resolvedVariant === "ghost") return "action-btn--ghost";
      if (resolvedVariant === "text") return "action-btn--text";
      if (resolvedVariant === "danger") return "action-btn--danger";
      return "action-btn--primary";
    })();

       const sizeClass = (() => {
         if (size === "sm") return "action-btn--sm";
         if (size === "lg") return "action-btn--lg";
         if (size === "control") return "action-btn--control";
         return "action-btn--md";
       })();

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        data-icon={dataIcon}
        data-fx={fx ? "on" : undefined}
        data-testid={devTestId}
        data-cta={normalizeCtaName(cta)}
        data-cta-position={normalizeCtaToken(ctaPosition)}
        data-cta-copy={normalizeCtaToken(ctaCopy)}
          className={cx(
          "action-btn",
          sizeClass,
          variantClass,
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        <span className="action-btn__content">{children}</span>
      </button>
    );
  },
);

Button.displayName = "Button";

export default Button;
