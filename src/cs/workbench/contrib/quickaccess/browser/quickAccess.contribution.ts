import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Registry } from "src/cs/platform/registry/common/platform";
import {
  CommandsRegistry,
  ICommandService,
} from "src/cs/platform/commands/common/commands";
import {
  QuickAccessExtensions,
  type IQuickAccessRegistry,
} from "src/cs/platform/quickinput/common/quickAccess";
import { IQuickInputService } from "src/cs/platform/quickinput/common/quickInput";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import {
  COMMANDS_QUICK_ACCESS_PREFIX,
  CommandsQuickAccessProvider,
} from "src/cs/workbench/contrib/quickaccess/browser/commandsQuickAccess";
import {
  DefaultQuickAccessProvider,
  FILES_QUICK_ACCESS_PREFIX,
  FilesQuickAccessProvider,
} from "src/cs/workbench/contrib/quickaccess/browser/quickAccessProviders";
import { QuickAccessCommandId } from "src/cs/workbench/contrib/quickaccess/common/quickAccessCommands";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";

export const QuickAccessContributionId = "workbench.contrib.quickAccess";

class QuickAccessContribution extends Disposable implements IWorkbenchContribution {
  public constructor(
    @IQuickInputService quickInputService: IQuickInputService,
    @ICommandService commandService: ICommandService,
    @IExplorerService explorerService: IExplorerService,
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
  ) {
    super();

    const registry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.QuickAccess);
    this._register(registry.registerQuickAccessProvider({
      prefix: "",
      placeholder: localize("quickAccess.placeholder", "Quick access"),
      provider: new DefaultQuickAccessProvider(quickInputService),
    }));
    this._register(registry.registerQuickAccessProvider({
      prefix: FILES_QUICK_ACCESS_PREFIX,
      placeholder: localize("quickAccess.files.placeholder", "Search files"),
      provider: new FilesQuickAccessProvider(explorerService, layoutService),
    }));
    this._register(registry.registerQuickAccessProvider({
      prefix: COMMANDS_QUICK_ACCESS_PREFIX,
      placeholder: localize("quickAccess.commands.placeholder", "Search commands"),
      provider: new CommandsQuickAccessProvider(commandService),
    }));

    this._register(CommandsRegistry.registerCommand({
      id: QuickAccessCommandId.quickOpen,
      handler: (accessor, value?: unknown) => {
        const quickInput = accessor.get(IQuickInputService);
        quickInput.quickAccess.show(typeof value === "string" ? value : undefined);
      },
      metadata: {
        description: localize("workbench.commands.quickOpen", "Show quick access"),
      },
    }));
    this._register(CommandsRegistry.registerCommand({
      id: QuickAccessCommandId.showCommands,
      handler: accessor => {
        const quickInput = accessor.get(IQuickInputService);
        quickInput.quickAccess.show(COMMANDS_QUICK_ACCESS_PREFIX);
      },
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
