import "src/cs/base/browser/ui/modal/modal.css";

import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { Action } from "src/cs/base/common/actions";
import { LxIcon } from "src/cs/base/common/lxicon";

export const MODAL_OVERLAY_CLASS = "modal-overlay";
export const MODAL_BACKDROP_CLASS = "modal-backdrop";
export const MODAL_DIALOG_BASE_CLASS = "modal";
export const MODAL_BODY_SCROLL_CLASS = "modal_body--scroll";

export type ModalVariant = "default" | "primary" | "glass" | "solid" | "flat";
export type ModalSize = "sm" | "md" | "lg" | "xl";
export type ModalInitialFocus = "dialog" | "first";

export type ModalCloseActionBarOptions = {
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly id?: string;
  readonly label: string;
  readonly run: () => void;
};

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

export class ModalCloseActionBar extends ActionBar {
  constructor(options: ModalCloseActionBarOptions) {
    super({
      ariaLabel: options.ariaLabel ?? options.label,
      className: ["modal_headerActions", options.className].filter(Boolean).join(" "),
    });

    const action = this._register(new Action(
      options.id ?? "modal.close",
      options.label,
      "",
      true,
      options.run,
    ));
    action.tooltip = options.label;
    action.icon = LxIcon.close;
    this.push(action, {
      className: "modal_headerAction",
      icon: true,
      label: false,
    });
  }
}

export const createModalCloseActionBar = (options: ModalCloseActionBarOptions): ModalCloseActionBar =>
  new ModalCloseActionBar(options);

const slugifyModalToken = (input: unknown): string =>
  String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
