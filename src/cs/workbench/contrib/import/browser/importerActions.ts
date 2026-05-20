import { lxDownloadTray, lxTrash } from "cogicon";
import type { TranslateFn } from "src/cs/platform/language/common/language";

export const importerImportActionId = "analysis-import-csv-btn";
export const importerLoadedCountActionId = "analysis-import-loaded-count";
export const importerClearSessionActionId = "analysis-clear-session-btn";

export type ImporterHeaderAction = {
  readonly id: string;
  readonly title: string;
  readonly kind: "primary" | "icon" | "statusBadge";
  readonly badgeText?: string;
  readonly icon?: () => string;
  readonly isDisabled?: boolean;
  readonly isDanger?: boolean;
};

export const createImporterHeaderActions = ({
  fileCount = 0,
  hasSessionData,
  t,
}: {
  readonly fileCount?: number;
  readonly hasSessionData: boolean;
  readonly t: TranslateFn;
}): ImporterHeaderAction[] => [
  {
    id: importerImportActionId,
    title: t("da_import_csv"),
    kind: "primary",
    icon: lxDownloadTray,
  },
  ...(fileCount > 0
    ? [
        {
          id: importerLoadedCountActionId,
          title: t("da_loaded_csv_files", { count: fileCount }),
          kind: "statusBadge" as const,
          badgeText: String(fileCount),
        },
      ]
    : []),
  {
    id: importerClearSessionActionId,
    title: t("da_reset_session"),
    kind: "icon",
    icon: lxTrash,
    isDanger: true,
    isDisabled: !hasSessionData,
  },
];
