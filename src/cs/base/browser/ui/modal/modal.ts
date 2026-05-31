import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";
import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/modal/modal.css";

export const MODAL_OVERLAY_CLASS = "modal-overlay";
export const MODAL_BACKDROP_CLASS = "modal-backdrop";
export const MODAL_DIALOG_BASE_CLASS = "modal";

export type ModalVariant = "default" | "primary" | "glass" | "solid" | "flat";
export type ModalSize = "sm" | "md" | "lg" | "xl";
export type ModalInitialFocus = "dialog" | "first";

const MODAL_DIALOG_VARIANTS: Record<ModalVariant, string> = {
  default: "modal--primary",
  primary: "modal--primary",
  glass: "modal--primary",
  solid: "modal--solid",
  flat: "modal--flat",
};

const MODAL_DIALOG_SIZES: Record<ModalSize, string> = {
  sm: "modal--sm",
  md: "modal--md",
  lg: "modal--lg",
  xl: "modal--xl",
};

export type ModalDataOptions = {
  readonly cta?: string;
  readonly ctaCopy?: string;
  readonly ctaPosition?: string;
};

export const getModalDialogClassName = ({
  className = "",
  size = "md",
  variant = "primary",
}: {
  readonly className?: string;
  readonly size?: ModalSize;
  readonly variant?: ModalVariant;
}): string =>
  cx(
    MODAL_DIALOG_BASE_CLASS,
    MODAL_DIALOG_VARIANTS[variant] || MODAL_DIALOG_VARIANTS.default,
    MODAL_DIALOG_SIZES[size] || MODAL_DIALOG_SIZES.md,
    className,
  );

export const getModalDataAttributes = ({
  cta,
  ctaCopy,
  ctaPosition,
}: ModalDataOptions): Record<string, string | undefined> => ({
  "data-cta": normalizeCtaName(cta),
  "data-cta-position": normalizeCtaToken(ctaPosition),
  "data-cta-copy": normalizeCtaToken(ctaCopy),
});

export const getModalTitleId = (idBase: string | undefined, fallbackId: string): string => {
  const stableIdBase = normalizeCtaToken(idBase);
  return stableIdBase ? `${stableIdBase}-title` : `modal-title-${fallbackId}`;
};

export const getModalDialogId = (idBase: string | undefined): string | undefined => {
  const stableIdBase = normalizeCtaToken(idBase);
  return stableIdBase ? `${stableIdBase}-dialog` : undefined;
};

export const getModalUiMarker = (dataUi: string | undefined): string | undefined =>
  typeof dataUi === "string" && dataUi.trim() ? dataUi.trim() : undefined;
