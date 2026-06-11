/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import type { IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import {
  dropAsPreferenceConfig,
  pasteAsPreferenceConfig,
} from "src/cs/workbench/contrib/dropOrPasteInto/browser/configurationSchema";

const CONFIGURE_PREFERRED_PASTE_ACTION_ID = "workbench.action.configurePreferredPasteAction";
const CONFIGURE_PREFERRED_DROP_ACTION_ID = "workbench.action.configurePreferredDropAction";

export class DropOrPasteIntoCommands extends Disposable implements IWorkbenchContribution {
  public static readonly ID = "workbench.contrib.dropOrPasteInto";

  public constructor() {
    super();

    this._register(CommandsRegistry.registerCommand({
      id: CONFIGURE_PREFERRED_PASTE_ACTION_ID,
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
      handler: accessor => this.openSettings(accessor.get(IWorkbenchLayoutService)),
    }));

    this._register(CommandsRegistry.registerCommand({
      id: CONFIGURE_PREFERRED_DROP_ACTION_ID,
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
      handler: accessor => this.openSettings(accessor.get(IWorkbenchLayoutService)),
    }));
  }

  private openSettings(layoutService: IWorkbenchLayoutService): void {
    layoutService.navigateToView("settings");
  }
}
