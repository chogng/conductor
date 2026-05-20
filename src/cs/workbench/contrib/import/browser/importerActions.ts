import { lxDownloadTray, lxTrash } from "cogicon";
import { jsx } from "react/jsx-runtime";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { WorkbenchSidebarHeaderAction } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";

export const importerImportActionId = "analysis-import-csv-btn";
export const importerClearSessionActionId = "analysis-clear-session-btn";

export const createImporterHeaderActions = ({
  hasSessionData,
  t,
}: {
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
