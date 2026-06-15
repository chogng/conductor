/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  ITableService,
} from "src/cs/workbench/services/table/common/table";
import {
  TableCommandId,
  type TableCommandId as TableCommandIdValue,
} from "src/cs/workbench/contrib/table/common/table";
import { DisposableStore, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  notificationService,
} from "src/cs/workbench/services/notification/common/notificationService";

type TableCommandRegistration = {
  readonly id: TableCommandIdValue;
  readonly run: (accessor: ServicesAccessor) => boolean | Promise<boolean>;
  readonly title: string;
};

type TableZoomController = {
  resetZoom(): boolean;
  zoomIn(): boolean;
  zoomOut(): boolean;
};

let activeTableZoomController: TableZoomController | null = null;

export const setActiveTableZoomController = (controller: TableZoomController): IDisposable => {
  activeTableZoomController = controller;
  return toDisposable(() => {
    if (activeTableZoomController === controller) {
      activeTableZoomController = null;
    }
  });
};

const tableCommandRegistrations: readonly TableCommandRegistration[] = [
  {
    id: TableCommandId.clearSelection,
    run: accessor => accessor.get(ITableService).clearSelection(),
    title: localize("table.commands.clearSelection", "Clear table selection"),
  },
  {
    id: TableCommandId.copySelection,
    run: accessor => copyTableSelection(accessor.get(ITableService)),
    title: localize("table.commands.copySelection", "Copy table selection"),
  },
  {
    id: TableCommandId.resetZoom,
    run: () => activeTableZoomController?.resetZoom() ?? false,
    title: localize("table.commands.resetZoom", "Reset table zoom"),
  },
  {
    id: TableCommandId.selectAllColumns,
    run: accessor => accessor.get(ITableService).selectAllColumns(),
    title: localize("table.commands.selectAllColumns", "Select all table columns"),
  },
  {
    id: TableCommandId.zoomIn,
    run: () => activeTableZoomController?.zoomIn() ?? false,
    title: localize("table.commands.zoomIn", "Zoom in table"),
  },
  {
    id: TableCommandId.zoomOut,
    run: () => activeTableZoomController?.zoomOut() ?? false,
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
        return command.run(accessor);
      }
    }));
  }

  return disposables;
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
        message: localize(
          "table.copySelection.tooLarge",
          "Selection is too large to copy ({cellCount} cells).",
          { cellCount: result.cellCount },
        ),
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
      throw new Error(localize(
        "table.copySelection.failedFallback",
        "Clipboard copy command failed.",
      ));
    }
  } finally {
    textarea.remove();
  }
};
