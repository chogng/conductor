import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { normalizeCtaName, normalizeCtaToken } from "../../utils/cta";

const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "text"
  | "icon"
  | "danger";
type ButtonSize = "sm" | "md" | "lg" | "control" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fx?: boolean;
  fullWidth?: boolean;
  testId?: string;
  dataIcon?: string;
  cta?: string;
  ctaPosition?: string;
  ctaCopy?: string;
};

/**
 * Button (UI)
 * - Matches `docs/button_component_spec.md` (`action-btn*` classes in `src/styles/global.css`)
 * - Defaults `type="button"` to avoid accidental submits
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      type = "button",
      variant = "primary",
      size = "md",
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
    const isDisabled = Boolean(disabled);
    const devTestId = import.meta.env.DEV && testId ? testId : undefined;

    const resolvedVariant = (() => {
      if (variant === "icon" && isDisabled) return "icon-disabled";
      if (variant === "icon") return "icon";
      if (isDisabled) return "disabled";
      if (variant === "ghost") return "ghost";
      return variant;
    })();

    const variantClass = (() => {
      if (resolvedVariant === "disabled") return "action-btn--disabled";
      if (resolvedVariant === "secondary") return "action-btn--secondary";
      if (resolvedVariant === "ghost") return "action-btn--ghost";
      if (resolvedVariant === "text") return "action-btn--text";
      if (resolvedVariant === "icon") return "action-btn--icon";
      if (resolvedVariant === "icon-disabled") return "action-btn--icon-disabled";
      if (resolvedVariant === "danger") return "action-btn--danger";
      return "action-btn--primary";
    })();

    const sizeClass = (() => {
      if (size === "sm") return "action-btn--sm";
      if (size === "lg") return "action-btn--lg";
      if (size === "control") return "action-btn--control";
      if (size === "icon") return "action-btn--icon-size";
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
