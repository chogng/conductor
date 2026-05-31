import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";
import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/input/input.css";

export type InputSize = "sm" | "md" | "lg" | "xl";
export type LabelPlacement = "stack" | "inline";

export type InputOptions = {
  readonly allowAutoComplete?: boolean;
  readonly autoComplete?: string;
  readonly className?: string;
  readonly cta?: string;
  readonly ctaCopy?: string;
  readonly ctaPosition?: string;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly fieldClassName?: string;
  readonly hideSpinner?: boolean;
  readonly id?: string;
  readonly inputClassName?: string;
  readonly name?: string;
  readonly placeholder?: string;
  readonly size?: InputSize;
  readonly type?: string;
  readonly value?: string | number;
};

export const slugifyInputId = (input: unknown): string =>
  String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const mergeSpaceSeparatedIds = (
  ...parts: Array<string | undefined>
): string | undefined => {
  const ids: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    for (const token of part.split(/\s+/g)) {
      const id = token.trim();
      if (id && !ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return ids.length ? ids.join(" ") : undefined;
};

export const getInputWrapperClassName = (className = ""): string =>
  cx("input_warp", className);

export const getInputFieldClassName = ({
  fieldClassName = "",
  size = "md",
}: Pick<InputOptions, "fieldClassName" | "size"> = {}): string =>
  cx("input_field", getInputSizeClassName(size), fieldClassName);

export const getInputNativeClassName = ({
  hideSpinner = false,
  inputClassName = "",
}: Pick<InputOptions, "hideSpinner" | "inputClassName"> = {}): string =>
  cx("input_native", hideSpinner && "input_native--no-spinner", inputClassName);

export const getInputFieldState = ({
  disabled = false,
  error = false,
}: Pick<InputOptions, "disabled" | "error"> = {}): "disabled" | "error" | "enable" => {
  if (disabled) return "disabled";
  if (error) return "error";
  return "enable";
};

export const getInputDataAttributes = ({
  cta,
  ctaCopy,
  ctaPosition,
}: Pick<InputOptions, "cta" | "ctaCopy" | "ctaPosition">): Record<string, string | undefined> => ({
  "data-cta": normalizeCtaName(cta),
  "data-cta-position": normalizeCtaToken(ctaPosition),
  "data-cta-copy": normalizeCtaToken(ctaCopy),
});

export const createInput = (options: InputOptions = {}): HTMLInputElement => {
  const input = document.createElement("input");
  updateInput(input, options);
  return input;
};

export const updateInput = (
  input: HTMLInputElement,
  options: InputOptions = {},
): void => {
  if (options.id !== undefined) input.id = options.id;
  if (options.name !== undefined) input.name = options.name;
  input.type = options.type ?? "text";
  input.value = String(options.value ?? "");
  input.disabled = options.disabled === true;
  input.placeholder = options.placeholder ?? "";
  input.setAttribute(
    "autocomplete",
    options.allowAutoComplete ? options.autoComplete ?? "" : "off",
  );
  input.className = getInputNativeClassName(options);
};

const getInputSizeClassName = (size: InputSize): string => {
  if (size === "sm") return "input_field--sm";
  if (size === "lg") return "input_field--lg";
  if (size === "xl") return "input_field--xl";
  return "input_field--md";
};
