/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  TableCommandId,
  type TableCommandId as TableCommandIdValue,
  ITableService,
  type ITableService as ITableServiceType,
} from "src/cs/workbench/services/table/common/table";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";

type TableCommandRegistration = {
  readonly id: TableCommandIdValue;
  readonly description: string;
};

const tableCommandRegistrations: readonly TableCommandRegistration[] = [
  {
    id: TableCommandId.clearSelection,
    description: localize("table.commands.clearSelection", "Clear table selection"),
  },
  {
    id: TableCommandId.resetZoom,
    description: localize("table.commands.resetZoom", "Reset table zoom"),
  },
  {
    id: TableCommandId.selectAllColumns,
    description: localize("table.commands.selectAllColumns", "Select all table columns"),
  },
  {
    id: TableCommandId.zoomIn,
    description: localize("table.commands.zoomIn", "Zoom in table"),
  },
  {
    id: TableCommandId.zoomOut,
    description: localize("table.commands.zoomOut", "Zoom out table"),
  },
];

export const registerTableCommands = (): IDisposable => {
  const disposables = new DisposableStore();

  for (const command of tableCommandRegistrations) {
    disposables.add(CommandsRegistry.registerCommand({
      id: command.id,
      handler: accessor => runTableServiceCommand(
        accessor.get(ITableService),
        command.id,
      ),
      metadata: {
        description: command.description,
      },
    }));
  }

  return disposables;
};

const runTableServiceCommand = (
  tableService: ITableServiceType,
  commandId: TableCommandIdValue,
): boolean => tableService.executeCommand(commandId);
