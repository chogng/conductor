/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { getTableCommandRegistrations } from "src/cs/workbench/contrib/table/browser/tableCommands";

export const registerTableActions = (): IDisposable => {
  const disposables = new DisposableStore();

  for (const command of getTableCommandRegistrations()) {
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
