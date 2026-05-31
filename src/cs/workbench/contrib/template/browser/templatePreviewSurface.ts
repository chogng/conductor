import { lxPreview } from "cogicon";

import {
  getAvatarClassName,
  getAvatarDataAttributes,
} from "cs/base/browser/ui/avatar/avatar";
import {
  getCogIconClassName,
  getCogIconMarkup,
  getCogIconStyle,
} from "src/cs/base/browser/ui/cogIcon/cogIcon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { PreviewFileLike } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { PreviewStatus as SessionPreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";

type PreviewStatus = Partial<SessionPreviewStatus>;

export const TEMPLATE_MANAGER_PREVIEW_PANEL_ITEM_CLASS =
  "flex h-full min-h-0 self-stretch";

export const TEMPLATE_MANAGER_PREVIEW_PANEL_FRAME_CLASS =
  "flex flex-1 min-h-0 flex-col overflow-hidden rounded-[inherit] border border-border bg-bg-page/75 p-4";

type TemplateManagerPreviewSurfaceProps = {
  actions?: Node | null;
  children?: Node | null;
  previewFile?: PreviewFileLike | null;
  previewStatus?: PreviewStatus | null;
  t: TranslateFn;
};

export const TemplateManagerPreviewSurface = ({
  actions,
  children,
  previewFile,
  previewStatus,
  t,
}: TemplateManagerPreviewSurfaceProps): any => {
  const fileName = previewFile
    ? String(previewFile.fileName || "").replace(/\.csv$/i, "")
    : "";
  const statusMessage =
    previewStatus?.state === "loading"
      ? previewStatus.message || t("da_preview_loading")
      : previewStatus?.state === "error"
        ? previewStatus.message || t("da_preview_error")
        : "";
  const statusClassName =
    previewStatus?.state === "error"
      ? "text-xs text-red-500"
      : "text-xs text-text-secondary";

  const root = document.createElement("div");
  root.className = TEMPLATE_MANAGER_PREVIEW_PANEL_ITEM_CLASS;
  const frame = document.createElement("div");
  frame.className = TEMPLATE_MANAGER_PREVIEW_PANEL_FRAME_CLASS;

  const header = document.createElement("div");
  header.className = "mb-3 flex shrink-0 items-center justify-between gap-3";
  const title = document.createElement("span");
  title.className = "min-w-0 truncate text-sm font-medium text-text-secondary";
  title.textContent = `${t("da_preview_filename_label")}: ${fileName}`;
  header.append(title);

  if (statusMessage || actions) {
    const meta = document.createElement("div");
    meta.className = "flex shrink-0 items-center gap-2";
    if (statusMessage) {
      const status = document.createElement("span");
      status.className = statusClassName;
      status.textContent = statusMessage;
      meta.append(status);
    }
    if (actions) {
      meta.append(actions);
    }
    header.append(meta);
  }

  frame.append(header);
  if (children) {
    frame.append(children);
  }
  root.append(frame);
  return root;
};

type TemplateManagerPreviewEmptyStateProps = {
  hint?: string;
  id?: string;
  title?: string;
};

export const TemplateManagerPreviewEmptyState = ({
  hint,
  id = "analysis-preview-placeholder",
  title,
}: TemplateManagerPreviewEmptyStateProps): any => {
  const root = document.createElement("div");
  root.className =
    "flex flex-1 min-h-0 flex-col items-center justify-center gap-2 px-6 py-8 text-center";
  root.id = id;

  const avatar = document.createElement("div");
  avatar.className = getAvatarClassName({ size: "md", variant: "empty" });
  for (const [name, value] of Object.entries(
    getAvatarDataAttributes({ mode: "icon" }),
  )) {
    if (value !== undefined) {
      avatar.setAttribute(name, String(value));
    }
  }
  const icon = document.createElement("span");
  icon.className = getCogIconClassName("w-[60%] h-[60%]");
  Object.assign(icon.style, getCogIconStyle({ size: "100%" }));
  icon.innerHTML = getCogIconMarkup(lxPreview);
  avatar.append(icon);
  root.append(avatar);

  if (title) {
    const titleElement = document.createElement("p");
    titleElement.className = "text-sm font-medium text-text-primary";
    titleElement.textContent = title;
    root.append(titleElement);
  }
  if (hint) {
    const hintElement = document.createElement("p");
    hintElement.className = "max-w-md text-sm text-text-secondary";
    hintElement.textContent = hint;
    root.append(hintElement);
  }
  return root;
};
