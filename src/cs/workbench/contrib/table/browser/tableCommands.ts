/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  ITableService,
  resolveTableColumnDisplayScaleTarget,
} from "src/cs/workbench/services/table/common/table";
import {
  CLEAR_TABLE_SELECTION_COMMAND_ID,
  COPY_TABLE_SELECTION_COMMAND_ID,
  DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
  INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
  RESET_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
  RESET_TABLE_ZOOM_COMMAND_ID,
  SELECT_ALL_TABLE_COLUMNS_COMMAND_ID,
  ZOOM_IN_TABLE_COMMAND_ID,
  ZOOM_OUT_TABLE_COMMAND_ID,
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
  readonly run: (accessor: ServicesAccessor, ...args: unknown[]) => boolean | Promise<boolean>;
  readonly title: string;
};

const tableCommandRegistrations: readonly TableCommandRegistration[] = [
  {
    id: CLEAR_TABLE_SELECTION_COMMAND_ID,
    run: accessor => accessor.get(ITableService).clearSelection(),
    title: localize("table.commands.clearSelection", "Clear table selection"),
  },
  {
    id: COPY_TABLE_SELECTION_COMMAND_ID,
    run: accessor => copyTableSelection(
      accessor.get(ITableService),
      accessor.get(INotificationService),
    ),
    title: localize("table.commands.copySelection", "Copy table selection"),
  },
  {
    id: DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
    run: (accessor, colIndex) => adjustColumnDisplayScale(accessor, colIndex, -1),
    title: localize("table.commands.decreaseColumnDisplayScale", "Decrease Column Display Scale"),
  },
  {
    id: INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
    run: (accessor, colIndex) => adjustColumnDisplayScale(accessor, colIndex, 1),
    title: localize("table.commands.increaseColumnDisplayScale", "Increase Column Display Scale"),
  },
  {
    id: RESET_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
    run: (accessor, colIndex) => resetColumnDisplayScale(accessor, colIndex),
    title: localize("table.commands.resetColumnDisplayScale", "Reset Column Display Scale"),
  },
  {
    id: RESET_TABLE_ZOOM_COMMAND_ID,
    run: accessor => accessor.get(ITableWidgetService).activeController?.resetZoom() ?? false,
    title: localize("table.commands.resetZoom", "Reset table zoom"),
  },
  {
    id: SELECT_ALL_TABLE_COLUMNS_COMMAND_ID,
    run: accessor => accessor.get(ITableService).selectAllColumns(),
    title: localize("table.commands.selectAllColumns", "Select all table columns"),
  },
  {
    id: ZOOM_IN_TABLE_COMMAND_ID,
    run: accessor => accessor.get(ITableWidgetService).activeController?.zoomIn() ?? false,
    title: localize("table.commands.zoomIn", "Zoom in table"),
  },
  {
    id: ZOOM_OUT_TABLE_COMMAND_ID,
    run: accessor => accessor.get(ITableWidgetService).activeController?.zoomOut() ?? false,
    title: localize("table.commands.zoomOut", "Zoom out table"),
  },
];

export const getTableCommandRegistrations = (): readonly TableCommandRegistration[] =>
  tableCommandRegistrations;

const adjustColumnDisplayScale = (
  accessor: ServicesAccessor,
  rawColumnIndex: unknown,
  deltaExponent: number,
): boolean => {
  const tableService = accessor.get(ITableService);
  const columnIndex = resolveColumnDisplayScaleCommandTarget(tableService, rawColumnIndex);
  return columnIndex === null
    ? false
    : tableService.adjustColumnDisplayScale(columnIndex, deltaExponent);
};

const resetColumnDisplayScale = (
  accessor: ServicesAccessor,
  rawColumnIndex: unknown,
): boolean => {
  const tableService = accessor.get(ITableService);
  const columnIndex = resolveColumnDisplayScaleCommandTarget(tableService, rawColumnIndex);
  return columnIndex === null
    ? false
    : tableService.resetColumnDisplayScale(columnIndex);
};

const resolveColumnDisplayScaleCommandTarget = (
  tableService: ITableService,
  rawColumnIndex: unknown,
): number | null => {
  if (rawColumnIndex === undefined) {
    return resolveTableColumnDisplayScaleTarget(tableService.getSelection());
  }

  const columnIndex = Math.floor(Number(rawColumnIndex));
  return Number.isInteger(columnIndex) && columnIndex >= 0 ? columnIndex : null;
};

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
