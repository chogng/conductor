/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  TableCommandId,
  type TableCommandId as TableCommandIdValue,
  ITableService,
} from "src/cs/workbench/services/table/common/table";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";

type TableCommandRegistration = {
  readonly id: TableCommandIdValue;
  readonly title: string;
};

const tableCommandRegistrations: readonly TableCommandRegistration[] = [
  {
    id: TableCommandId.clearSelection,
    title: localize("table.commands.clearSelection", "Clear table selection"),
  },
  {
    id: TableCommandId.copySelection,
    title: localize("table.commands.copySelection", "Copy table selection"),
  },
  {
    id: TableCommandId.resetZoom,
    title: localize("table.commands.resetZoom", "Reset table zoom"),
  },
  {
    id: TableCommandId.selectAllColumns,
    title: localize("table.commands.selectAllColumns", "Select all table columns"),
  },
  {
    id: TableCommandId.zoomIn,
    title: localize("table.commands.zoomIn", "Zoom in table"),
  },
  {
    id: TableCommandId.zoomOut,
    title: localize("table.commands.zoomOut", "Zoom out table"),
  },
];

export const registerTableCommands = (): IDisposable => {
  const disposables = new DisposableStore();

  for (const command of tableCommandRegistrations) {
    disposables.add(registerAction2(class TableCommandAction extends Action2 {
      public constructor() {
        super({
          category: localize("table.commands.category", "Table"),
          f1: true,
          id: command.id,
          title: command.title,
          metadata: {
            description: command.title,
          },
        });
      }

      public async run(accessor: ServicesAccessor): Promise<boolean> {
        return runTableServiceCommand(
          accessor.get(ITableService),
          command.id,
        );
      }
    }));
  }

  return disposables;
};

const runTableServiceCommand = (
  tableService: ITableService,
  commandId: TableCommandIdValue,
): boolean | Promise<boolean> => {
  if (commandId === TableCommandId.copySelection) {
    return copyTableSelection(tableService);
  }

  return tableService.executeCommand(commandId);
};

const copyTableSelection = async (tableService: ITableService): Promise<boolean> => {
  try {
    const result = await tableService.getSelectionText();
    if (result.kind === "empty") {
      notificationService.showToast({
        id: "table.copySelection",
        message: localize("table.copySelection.empty", "No table selection to copy."),
        type: "warning",
      });
      return false;
    }
    if (result.kind === "tooLarge") {
      notificationService.showToast({
        id: "table.copySelection",
        message: localize("table.copySelection.tooLarge", "Selection is too large to copy ({cellCount} cells).", {
          cellCount: result.cellCount,
        }),
        type: "warning",
      });
      return false;
    }

    await writeClipboardText(result.text);
    notificationService.showToast({
      id: "table.copySelection",
      message: localize("table.copySelection.success", "Table selection copied."),
      type: "success",
    });
    return true;
  } catch (error) {
    notificationService.showToast({
      id: "table.copySelection",
      message: localize("table.copySelection.failed", "Failed to copy table selection: {error}", {
        error: error instanceof Error ? error.message : String(error),
      }),
      type: "error",
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
      throw new Error(localize("table.copySelection.failedFallback", "Clipboard copy command failed."));
    }
  } finally {
    textarea.remove();
  }
};
