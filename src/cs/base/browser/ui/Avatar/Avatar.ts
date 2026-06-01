import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";

import "src/cs/base/browser/ui/avatar/avatar.css";

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
  readonly src?: string;
  readonly variant?: AvatarVariant;
};

const AVATAR_CONTENT_CLASS_NAME = "avatar__content";
const AVATAR_ICON_CLASS_NAME = "avatar__icon";

export const getAvatarClassName = ({
  className = "",
  src,
  variant = "default",
}: Pick<AvatarOptions, "className" | "src" | "variant"> = {}): string =>
  [
    "avatar",
    variant === "empty" ? "avatar--empty" : "",
    src ? "avatar--image" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

export const getAvatarContentClassName = (): string => AVATAR_CONTENT_CLASS_NAME;

export const getAvatarIconClassName = (): string => AVATAR_ICON_CLASS_NAME;

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
  getAvatarContentElement(avatar);

  for (const [name, value] of Object.entries(getAvatarDataAttributes(options))) {
    if (value === undefined) {
      avatar.removeAttribute(name);
    } else {
      avatar.setAttribute(name, value);
    }
  }
};

export const getAvatarContentElement = (
  avatar: HTMLDivElement,
): HTMLSpanElement => {
  const existingContent = avatar.querySelector(`:scope > .${AVATAR_CONTENT_CLASS_NAME}`);
  if (existingContent instanceof HTMLSpanElement) {
    return existingContent;
  }

  const content = document.createElement("span");
  content.className = AVATAR_CONTENT_CLASS_NAME;
  avatar.append(content);
  return content;
};
