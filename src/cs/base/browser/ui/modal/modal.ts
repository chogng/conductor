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

export const getModalDialogClassName = ({
  className = "",
  size = "md",
  variant = "primary",
}: {
  readonly className?: string;
  readonly size?: ModalSize;
  readonly variant?: ModalVariant;
}): string => {
  const classNames = [
    MODAL_DIALOG_BASE_CLASS,
    MODAL_DIALOG_VARIANTS[variant] || MODAL_DIALOG_VARIANTS.default,
    MODAL_DIALOG_SIZES[size] || MODAL_DIALOG_SIZES.md,
  ];
  if (className) {
    classNames.push(className);
  }
  return classNames.join(" ");
};

export const getModalTitleId = (idBase: string | undefined, fallbackId: string): string => {
  const stableIdBase = slugifyModalToken(idBase);
  return stableIdBase ? `${stableIdBase}-title` : `modal-title-${fallbackId}`;
};

export const getModalDialogId = (idBase: string | undefined): string | undefined => {
  const stableIdBase = slugifyModalToken(idBase);
  return stableIdBase ? `${stableIdBase}-dialog` : undefined;
};

export const getModalUiMarker = (dataUi: string | undefined): string | undefined =>
  typeof dataUi === "string" && dataUi.trim() ? dataUi.trim() : undefined;

const slugifyModalToken = (input: unknown): string =>
  String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
