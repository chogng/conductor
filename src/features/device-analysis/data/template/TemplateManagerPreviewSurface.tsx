import { FileSpreadsheet } from "lucide-react";
import type { ReactNode } from "react";
import Avatar from "../../../../components/ui/Avatar";
import type { TranslateFn } from "../../../../context/language";
import type { PreviewStatus as SessionPreviewStatus } from "../../session/device-analysis-session-context";
import type { PreviewFileLike } from "../../shared/lib/sharedTypes";

type PreviewStatus = Partial<SessionPreviewStatus>;

export const TEMPLATE_MANAGER_PREVIEW_PANEL_ITEM_CLASS =
  "lg:col-span-3 self-start min-[1200px]:self-stretch flex min-h-0 h-[var(--da-template-stack-panel-h)] min-[1200px]:h-full";

export const TEMPLATE_MANAGER_PREVIEW_PANEL_FRAME_CLASS =
  "flex flex-1 min-h-0 flex-col overflow-hidden rounded-[16px] border border-border bg-bg-page/75 p-4";

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

  return (
    <div className={TEMPLATE_MANAGER_PREVIEW_PANEL_ITEM_CLASS}>
      <div className={TEMPLATE_MANAGER_PREVIEW_PANEL_FRAME_CLASS}>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium text-text-secondary">
            {t("da_preview_filename_label")}: {fileName}
          </span>

          {shouldRenderMeta ? (
            <div className="flex shrink-0 items-center gap-2">
              {statusMessage ? (
                <span className={statusClassName}>{statusMessage}</span>
              ) : null}
              {actions}
            </div>
          ) : null}
        </div>

        {children}
      </div>
    </div>
  );
};

type TemplateManagerPreviewEmptyStateProps = {
  hint?: string;
  id?: string;
  title?: string;
};

export const TemplateManagerPreviewEmptyState = ({
  hint,
  id = "device-analysis-preview-placeholder",
  title,
}: TemplateManagerPreviewEmptyStateProps) => (
  <div
    id={id}
    className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2 px-6 py-8 text-center"
  >
    <Avatar icon={FileSpreadsheet} size="lg" variant="empty" />
    {title ? <p className="text-sm font-medium text-text-primary">{title}</p> : null}
    {hint ? <p className="max-w-md text-sm text-text-secondary">{hint}</p> : null}
  </div>
);
