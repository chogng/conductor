/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ITableService } from "src/cs/workbench/services/table/common/table";
import {
  TableCommandId,
  type TableCommandId as TableCommandIdValue,
} from "src/cs/workbench/contrib/table/common/table";
import { localize } from "src/cs/nls";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  INotificationService,
  Severity,
} from "src/cs/workbench/services/notification/common/notificationService";
import { ITableWidgetService } from "src/cs/workbench/contrib/table/browser/tableWidgetService";

export type TableCommandRegistration = {
  readonly id: TableCommandIdValue;
  readonly run: (accessor: ServicesAccessor) => boolean | Promise<boolean>;
  readonly title: string;
};

const tableCommandRegistrations: readonly TableCommandRegistration[] = [
  {
    id: TableCommandId.clearSelection,
    run: accessor => accessor.get(ITableService).clearSelection(),
    title: localize("table.commands.clearSelection", "Clear table selection"),
  },
  {
    id: TableCommandId.copySelection,
    run: accessor => copyTableSelection(
      accessor.get(ITableService),
      accessor.get(INotificationService),
    ),
    title: localize("table.commands.copySelection", "Copy table selection"),
  },
  {
    id: TableCommandId.resetZoom,
    run: accessor => accessor.get(ITableWidgetService).activeController?.resetZoom() ?? false,
    title: localize("table.commands.resetZoom", "Reset table zoom"),
  },
  {
    id: TableCommandId.selectAllColumns,
    run: accessor => accessor.get(ITableService).selectAllColumns(),
    title: localize("table.commands.selectAllColumns", "Select all table columns"),
  },
  {
    id: TableCommandId.zoomIn,
    run: accessor => accessor.get(ITableWidgetService).activeController?.zoomIn() ?? false,
    title: localize("table.commands.zoomIn", "Zoom in table"),
  },
  {
    id: TableCommandId.zoomOut,
    run: accessor => accessor.get(ITableWidgetService).activeController?.zoomOut() ?? false,
    title: localize("table.commands.zoomOut", "Zoom out table"),
  },
];

export const getTableCommandRegistrations = (): readonly TableCommandRegistration[] =>
  tableCommandRegistrations;

const copyTableSelection = async (
  tableService: ITableService,
  notificationService: INotificationService,
): Promise<boolean> => {
  try {
    const result = await tableService.getSelectionText();
    if (result.kind === "empty") {
      notificationService.notify({
        id: "table.copySelection",
        message: localize("table.copySelection.empty", "No table selection to copy."),
        severity: Severity.Warning,
      });
      return false;
    }
    if (result.kind === "tooLarge") {
      notificationService.notify({
        id: "table.copySelection",
        message: localize(
          "table.copySelection.tooLarge",
          "Selection is too large to copy ({cellCount} cells).",
          { cellCount: result.cellCount },
        ),
        severity: Severity.Warning,
      });
      return false;
    }

    await writeClipboardText(result.text);
    notificationService.notify({
      id: "table.copySelection",
      message: localize("table.copySelection.success", "Table selection copied."),
      presentation: { type: "success" },
      severity: Severity.Info,
    });
    return true;
  } catch (error) {
    notificationService.notify({
      id: "table.copySelection",
      message: localize("table.copySelection.failed", "Failed to copy table selection: {error}", {
        error: error instanceof Error ? error.message : String(error),
      }),
      severity: Severity.Error,
    });
    return false;
  }
};

const writeClipboardText = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error(localize(
        "table.copySelection.failedFallback",
        "Clipboard copy command failed.",
      ));
    }
  } finally {
    textarea.remove();
  }
};
