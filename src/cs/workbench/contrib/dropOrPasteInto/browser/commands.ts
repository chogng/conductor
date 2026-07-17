/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import type { IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { SettingsViewContainerId } from "src/cs/workbench/contrib/settings/common/settings";
import {
  dropAsPreferenceConfig,
  pasteAsPreferenceConfig,
} from "src/cs/workbench/contrib/dropOrPasteInto/browser/configurationSchema";
import {
  IViewsService,
  type IViewsService as IViewsServiceType,
} from "src/cs/workbench/services/views/common/viewsService";

export const CONFIGURE_PREFERRED_PASTE_COMMAND_ID = "workbench.action.configurePreferredPasteAction";
export const CONFIGURE_PREFERRED_DROP_COMMAND_ID = "workbench.action.configurePreferredDropAction";

export class DropOrPasteIntoCommands extends Disposable implements IWorkbenchContribution {
  public static readonly ID = "workbench.contrib.dropOrPasteInto";

  public constructor() {
    super();

    this._register(CommandsRegistry.registerCommand({
      id: CONFIGURE_PREFERRED_PASTE_COMMAND_ID,
      metadata: {
        description: localize(
          "configureDefaultPaste.description",
          "Open settings for the preferred paste action.",
        ),
        args: [{
          name: "setting",
          isOptional: true,
          description: pasteAsPreferenceConfig,
        }],
      },
      handler: accessor => this.openSettings(accessor.get(IViewsService)),
    }));

    this._register(CommandsRegistry.registerCommand({
      id: CONFIGURE_PREFERRED_DROP_COMMAND_ID,
      metadata: {
        description: localize(
          "configureDefaultDrop.description",
          "Open settings for the preferred drop action.",
        ),
        args: [{
          name: "setting",
          isOptional: true,
          description: dropAsPreferenceConfig,
        }],
      },
      handler: accessor => this.openSettings(accessor.get(IViewsService)),
    }));
  }

  private openSettings(viewsService: IViewsServiceType): void {
    void viewsService.openViewContainer(SettingsViewContainerId);
  }
}
