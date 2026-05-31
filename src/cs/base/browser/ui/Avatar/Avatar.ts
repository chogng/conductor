import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";
import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/avatar/avatar.css";

export type AvatarSize = "sm" | "md" | "lg" | "xl";
export type AvatarVariant = "default" | "empty";
export type AvatarMode = "image" | "icon" | "fallback";

export type AvatarOptions = {
  readonly className?: string;
  readonly cta?: string;
  readonly ctaCopy?: string;
  readonly ctaPosition?: string;
  readonly fallback?: string;
  readonly imageClassName?: string;
  readonly mode?: AvatarMode;
  readonly size?: AvatarSize;
  readonly src?: string;
  readonly variant?: AvatarVariant;
};

export const getAvatarClassName = ({
  className = "",
  size = "md",
  src,
  variant = "default",
}: Pick<AvatarOptions, "className" | "size" | "src" | "variant"> = {}): string =>
  cx(
    "avatar",
    getAvatarSizeClassName(size),
    variant === "empty" && "avatar--empty",
    src && "avatar--image",
    className,
  );

export const getAvatarMode = ({
  mode,
  src,
  fallback,
}: Pick<AvatarOptions, "fallback" | "mode" | "src">): AvatarMode => {
  if (mode) return mode;
  if (src) return "image";
  if (fallback) return "fallback";
  return "icon";
};

export const getAvatarDataAttributes = ({
  cta,
  ctaCopy,
  ctaPosition,
  fallback,
  mode,
  src,
}: Pick<AvatarOptions, "cta" | "ctaCopy" | "ctaPosition" | "fallback" | "mode" | "src">): Record<string, string | undefined> => ({
  "data-mode": getAvatarMode({ fallback, mode, src }),
  "data-cta": normalizeCtaName(cta),
  "data-cta-position": normalizeCtaToken(ctaPosition),
  "data-cta-copy": normalizeCtaToken(ctaCopy),
});

export const createAvatar = (options: AvatarOptions = {}): HTMLDivElement => {
  const avatar = document.createElement("div");
  updateAvatar(avatar, options);
  return avatar;
};

export const updateAvatar = (
  avatar: HTMLDivElement,
  options: AvatarOptions = {},
): void => {
  avatar.className = getAvatarClassName(options);

  for (const [name, value] of Object.entries(getAvatarDataAttributes(options))) {
    if (value === undefined) {
      avatar.removeAttribute(name);
    } else {
      avatar.setAttribute(name, value);
    }
  }
};

const getAvatarSizeClassName = (size: AvatarSize): string => {
  if (size === "sm") return "avatar--sm";
  if (size === "lg") return "avatar--lg";
  if (size === "xl") return "avatar--xl";
  return "avatar--md";
};
