import { lxDownloadTray, lxTrash } from "cogicon";
import { jsx } from "react/jsx-runtime";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { WorkbenchSidebarHeaderAction } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";

export const importerImportActionId = "analysis-import-csv-btn";
export const importerLoadedCountActionId = "analysis-import-loaded-count";
export const importerClearSessionActionId = "analysis-clear-session-btn";

export const createImporterHeaderActions = ({
  fileCount = 0,
  hasSessionData,
  t,
}: {
  readonly fileCount?: number;
  readonly hasSessionData: boolean;
  readonly t: TranslateFn;
}): WorkbenchSidebarHeaderAction[] => [
  {
    id: importerImportActionId,
    title: t("da_import_csv"),
    kind: "primary",
    icon: jsx(CogIcon, {
      icon: lxDownloadTray,
      size: 16,
    }),
  },
  ...(fileCount > 0
    ? [
        {
          id: importerLoadedCountActionId,
          title: t("da_loaded_csv_files", { count: fileCount }),
          kind: "statusBadge" as const,
          badge: {
            text: String(fileCount),
            tone: "accent" as const,
          },
        },
      ]
    : []),
  {
    id: importerClearSessionActionId,
    title: t("da_reset_session"),
    kind: "icon",
    icon: jsx(CogIcon, {
      icon: lxTrash,
      size: 16,
    }),
    isDanger: true,
    isDisabled: !hasSessionData,
  },
];
