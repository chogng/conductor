import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Registry } from "src/cs/platform/registry/common/platform";
import { Action2, IMenuService, registerAction2 } from "src/cs/platform/actions/common/actions";
import {
  ICommandService,
} from "src/cs/platform/commands/common/commands";
import {
  IContextKeyService,
  type IContextKeyService as IContextKeyServiceType,
} from "src/cs/platform/contextkey/common/contextkey";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
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

registerAction2(class QuickOpenAction extends Action2 {
  public constructor() {
    super({
      category: localize("quickAccess.commands.category", "Quick Access"),
      f1: true,
      id: QuickAccessCommandId.quickOpen,
      title: localize("workbench.commands.quickOpen", "Show quick access"),
      metadata: {
        description: localize("workbench.commands.quickOpen", "Show quick access"),
      },
    });
  }

  public run(accessor: ServicesAccessor, value?: unknown): void {
    const quickInput = accessor.get(IQuickInputService);
    quickInput.quickAccess.show(typeof value === "string" ? value : undefined);
  }
});

registerAction2(class ShowCommandsAction extends Action2 {
  public constructor() {
    super({
      category: localize("quickAccess.commands.category", "Quick Access"),
      f1: true,
      id: QuickAccessCommandId.showCommands,
      title: localize("workbench.commands.showCommands", "Show available commands"),
      metadata: {
        description: localize("workbench.commands.showCommands", "Show available commands"),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    const quickInput = accessor.get(IQuickInputService);
    quickInput.quickAccess.show(COMMANDS_QUICK_ACCESS_PREFIX);
  }
});

class QuickAccessContribution extends Disposable implements IWorkbenchContribution {
  public constructor(
    @IQuickInputService quickInputService: IQuickInputService,
    @ICommandService commandService: ICommandService,
    @IMenuService menuService: IMenuService,
    @IContextKeyService contextKeyService: IContextKeyServiceType,
    @IExplorerService explorerService: IExplorerService,
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
  ) {
    super();

    const registry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.QuickAccess);
    this._register(registry.registerQuickAccessProvider({
      prefix: "",
      placeholder: localize("quickAccess.placeholder", "Search commands/files"),
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
      provider: new CommandsQuickAccessProvider(commandService, menuService, contextKeyService),
    }));
  }
}

registerWorkbenchContribution2(
  QuickAccessContributionId,
  QuickAccessContribution,
  WorkbenchPhase.BlockStartup,
);
