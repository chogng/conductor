import { lxPreview } from "cogicon";
import { jsx, jsxs } from "react/jsx-runtime";
import type { ReactNode } from "react";

import { getAvatarClassName, getAvatarDataAttributes } from "cs/base/browser/ui/avatar/avatar";
import { getCogIconClassName, getCogIconMarkup, getCogIconStyle, type CogIconRenderer, type CogIconStyle } from "src/cs/base/browser/ui/cogIcon/cogIcon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { PreviewFileLike } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { PreviewStatus as SessionPreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";

type PreviewStatus = Partial<SessionPreviewStatus>;

type IconProps = {
  className?: string;
};

type LocalCogIconProps = {
  className?: string;
  icon: CogIconRenderer;
  size?: number | string;
  style?: CogIconStyle;
  [key: string]: unknown;
};

const renderLocalCogIcon = ({
  className,
  icon,
  size = 16,
  style,
  ...props
}: LocalCogIconProps) =>
  jsx("span", {
    ...props,
    className: getCogIconClassName(className),
    style: getCogIconStyle({ size, style }),
    dangerouslySetInnerHTML: {
      __html: getCogIconMarkup(icon),
    },
  });

const TemplateManagerPreviewEmptyIcon = ({ className }: IconProps) =>
  renderLocalCogIcon({
    className,
    icon: lxPreview,
    size: "100%",
  });

export const TEMPLATE_MANAGER_PREVIEW_PANEL_ITEM_CLASS =
  "flex h-full min-h-0 self-stretch";

export const TEMPLATE_MANAGER_PREVIEW_PANEL_FRAME_CLASS =
  "flex flex-1 min-h-0 flex-col overflow-hidden rounded-[inherit] border border-border bg-bg-page/75 p-4";

type TemplateManagerPreviewSurfaceProps = {
  actions?: ReactNode;
  children?: ReactNode;
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
}: TemplateManagerPreviewSurfaceProps) => {
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
  const shouldRenderMeta = Boolean(statusMessage) || Boolean(actions);

  return jsx("div", {
    className: TEMPLATE_MANAGER_PREVIEW_PANEL_ITEM_CLASS,
    children: jsxs("div", {
      className: TEMPLATE_MANAGER_PREVIEW_PANEL_FRAME_CLASS,
      children: [
        jsxs("div", {
          className: "mb-3 flex shrink-0 items-center justify-between gap-3",
          children: [
            jsxs("span", {
              className: "min-w-0 truncate text-sm font-medium text-text-secondary",
              children: [t("da_preview_filename_label"), ": ", fileName],
            }),
            shouldRenderMeta
              ? jsxs("div", {
                  className: "flex shrink-0 items-center gap-2",
                  children: [
                    statusMessage
                      ? jsx("span", {
                          className: statusClassName,
                          children: statusMessage,
                        })
                      : null,
                    actions,
                  ],
                })
              : null,
          ],
        }),
        children,
      ],
    }),
  });
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
}: TemplateManagerPreviewEmptyStateProps) =>
  jsxs("div", {
    className:
      "flex flex-1 min-h-0 flex-col items-center justify-center gap-2 px-6 py-8 text-center",
    id,
    children: [
      jsx("div", {
        className: getAvatarClassName({ size: "md", variant: "empty" }),
        ...getAvatarDataAttributes({ mode: "icon" }),
        children: jsx(TemplateManagerPreviewEmptyIcon, {
          className: "w-[60%] h-[60%]",
        }),
      }),
      title
        ? jsx("p", {
            className: "text-sm font-medium text-text-primary",
            children: title,
          })
        : null,
      hint
        ? jsx("p", {
            className: "max-w-md text-sm text-text-secondary",
            children: hint,
          })
        : null,
    ],
  });

