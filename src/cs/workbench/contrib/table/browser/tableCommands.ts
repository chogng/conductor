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

      public run(accessor: ServicesAccessor): boolean {
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
): boolean => tableService.executeCommand(commandId);
