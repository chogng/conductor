/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { SettingsCommandId } from "src/cs/workbench/services/settings/common/settings";

export const registerSettingsActions = (): IDisposable => {
  const disposables = new DisposableStore();

  disposables.add(registerAction2(class ShowSettingsAction extends Action2 {
    public constructor() {
      super({
        category: localize("settings.commands.category", "Settings"),
        f1: true,
        id: SettingsCommandId.showSettings,
        title: localize("settings.commands.showSettings", "Show Settings"),
        metadata: {
          description: localize("settings.commands.showSettings.description", "Show the settings workbench view."),
        },
      });
    }

    public run(accessor: ServicesAccessor): void {
      accessor.get(IWorkbenchLayoutService).navigateToView("settings");
    }
  }));

  return disposables;
};
