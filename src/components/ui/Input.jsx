import { forwardRef, useId } from "react";
import { normalizeCtaName, normalizeCtaToken } from "../../utils/cta";

const cx = (...parts) => parts.filter(Boolean).join(" ");

const slugify = (input) =>
  String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const mergeSpaceSeparatedIds = (...parts) => {
  const ids = [];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    for (const token of part.split(/\s+/g)) {
      const id = token.trim();
      if (!id) continue;
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids.length ? ids.join(" ") : undefined;
};

/**
 * Input (UI)
 * - Controlled: value + onChange(nextValue)
 * - Stable markers: data-style/data-state
 */
const Input = forwardRef(
  (
    {
      label,
      labelPlacement = "stack", // "stack" | "inline"
      id,
      idBase,
      name,
      type = "text",
      value,
      onChange,
      disabled = false,
      placeholder,
      autoComplete,
      allowAutoComplete = false,
      size = "md", // "sm" | "md" | "lg" | "xl"
      leftIcon: LeftIcon,
      rightSlot,
      error,
      hint,
      className = "",
      fieldClassName = "",
      inputClassName = "",
      cta,
      ctaPosition,
      ctaCopy,
      ...props
    },
    ref
  ) => {
    const { "aria-describedby": describedByFromProps, ...inputProps } = props;
    const reactId = useId();
    const idBasePrefix =
      typeof idBase === "string" && idBase.trim() ? slugify(idBase) : "input";
    const derivedId = `${idBasePrefix}-${reactId}`;
    const inputId = id || derivedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const describedByFromStatus = error ? errorId : hint ? hintId : undefined;
    const ariaDescribedBy = mergeSpaceSeparatedIds(
      describedByFromProps,
      describedByFromStatus
    );
    const state = disabled ? "disabled" : error ? "error" : "enable";
    const resolvedAutoComplete = allowAutoComplete ? autoComplete : "off";
    const sizeClass =
      size === "sm"
        ? "input_field--sm"
      : size === "lg"
          ? "input_field--lg"
          : size === "xl"
            ? "input_field--xl"
            : "input_field--md";
    const resolvedLabelPlacement =
      labelPlacement === "inline" ? "inline" : "stack";
    const shouldInlineLabel = !!label && resolvedLabelPlacement === "inline";

    const labelNode = label ? (
      <label
        htmlFor={inputId}
        className={cx("input_label", shouldInlineLabel && "whitespace-nowrap")}
      >
        {label}
      </label>
    ) : null;

    const fieldNode = (
      <div
        className={cx("input_field", sizeClass, fieldClassName)}
        data-icon={LeftIcon ? "with" : "without"}
        data-state={state}
        data-cta={normalizeCtaName(cta)}
        data-cta-position={normalizeCtaToken(ctaPosition)}
        data-cta-copy={normalizeCtaToken(ctaCopy)}
      >
        {LeftIcon ? (
          <span className="input_icon" aria-hidden="true">
            <LeftIcon size={16} />
          </span>
        ) : null}

        <input
          {...inputProps}
          ref={ref}
          id={inputId}
          name={name}
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={resolvedAutoComplete}
          aria-invalid={!!error}
          aria-describedby={ariaDescribedBy}
          className={cx("input_native", inputClassName)}
        />

        {rightSlot ? <div className="input_right">{rightSlot}</div> : null}
      </div>
    );

    return (
      <div
        className={cx("input_warp", className)}
        data-style="input"
      >
        {shouldInlineLabel ? (
          <div className="flex items-center gap-2">
            {labelNode}
            {fieldNode}
          </div>
        ) : (
          <>
            {labelNode}
            {fieldNode}
          </>
        )}

        {error ? (
          <div id={errorId} className="input_error">
            {error}
          </div>
        ) : null}
        {!error && hint ? (
          <div id={hintId} className="input_hint">
            {hint}
          </div>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
