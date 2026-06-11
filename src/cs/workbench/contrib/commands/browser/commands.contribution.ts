import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import { WorkbenchCommandsCommandId } from "src/cs/workbench/contrib/commands/common/commands";
import { IQuickAccessService } from "src/cs/workbench/contrib/quickaccess/common/quickAccess";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";

export const CommandsContributionId = "workbench.contrib.commands";

class CommandsContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    this._register(CommandsRegistry.registerCommand({
      id: WorkbenchCommandsCommandId.showCommands,
      handler: accessor => accessor.get(IQuickAccessService).show(),
      metadata: {
        description: localize("workbench.commands.showCommands", "Show available commands"),
      },
    }));
  }
}

registerWorkbenchContribution2(
  CommandsContributionId,
  CommandsContribution,
  WorkbenchPhase.BlockStartup,
);
