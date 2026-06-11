import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import { showCommandsQuickAccess } from "src/cs/workbench/contrib/quickaccess/browser/commandsQuickAccess";
import { QuickAccessCommandId } from "src/cs/workbench/contrib/quickaccess/common/quickAccessCommands";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";

export const QuickAccessContributionId = "workbench.contrib.quickAccess";

class QuickAccessContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    this._register(CommandsRegistry.registerCommand({
      id: QuickAccessCommandId.showCommands,
      handler: accessor => showCommandsQuickAccess(accessor),
      metadata: {
        description: localize("workbench.commands.showCommands", "Show available commands"),
      },
    }));
  }
}

registerWorkbenchContribution2(
  QuickAccessContributionId,
  QuickAccessContribution,
  WorkbenchPhase.BlockStartup,
);
