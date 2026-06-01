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
import { getCardClassName } from "src/cs/base/browser/ui/card/card";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { PreviewFileLike } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { PreviewStatus as SessionPreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";

type PreviewStatus = Partial<SessionPreviewStatus>;

export const TEMPLATE_MANAGER_PREVIEW_PANEL_ITEM_CLASS =
  "template_preview_item";

export const TEMPLATE_MANAGER_PREVIEW_PANEL_FRAME_CLASS =
  "template_preview_frame";

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
      ? "template_preview_status--error"
      : "template_preview_status--muted";

  const root = document.createElement("div");
  root.className = TEMPLATE_MANAGER_PREVIEW_PANEL_ITEM_CLASS;
  const frame = document.createElement("div");
  frame.className = getCardClassName({
    className: TEMPLATE_MANAGER_PREVIEW_PANEL_FRAME_CLASS,
    variant: "default",
  });

  const header = document.createElement("div");
  header.className = "template_preview_header";
  const title = document.createElement("span");
  title.className = "template_preview_title";
  title.textContent = `${t("da_preview_filename_label")}: ${fileName}`;
  header.append(title);

  if (statusMessage || actions) {
    const meta = document.createElement("div");
    meta.className = "template_preview_meta";
    if (statusMessage) {
      const status = document.createElement("span");
      status.className = `template_preview_status ${statusClassName}`;
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
  root.className = "template_preview_empty";
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
  icon.className = getCogIconClassName("template_preview_empty_icon");
  Object.assign(icon.style, getCogIconStyle({ size: "100%" }));
  icon.innerHTML = getCogIconMarkup(lxPreview);
  avatar.append(icon);
  root.append(avatar);

  if (title) {
    const titleElement = document.createElement("p");
    titleElement.className = "template_preview_empty_title";
    titleElement.textContent = title;
    root.append(titleElement);
  }
  if (hint) {
    const hintElement = document.createElement("p");
    hintElement.className = "template_preview_empty_hint";
    hintElement.textContent = hint;
    root.append(hintElement);
  }
  return root;
};
