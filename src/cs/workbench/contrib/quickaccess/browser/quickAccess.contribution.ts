import { Disposable } from "src/cs/base/common/lifecycle";
import { KeyCode, KeyMod } from "src/cs/base/common/keyCodes";
import { localize } from "src/cs/nls";
import { Registry } from "src/cs/platform/registry/common/platform";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import { KeybindingWeight } from "src/cs/platform/keybinding/common/keybindingsRegistry";
import {
  type ServicesAccessor,
} from "src/cs/platform/instantiation/common/instantiation";
import {
  QuickAccessExtensions,
  type IQuickAccessRegistry,
} from "src/cs/platform/quickinput/common/quickAccess";
import { IQuickInputService } from "src/cs/platform/quickinput/common/quickInput";
import {
  COMMANDS_QUICK_ACCESS_PREFIX,
  CommandsQuickAccessProvider,
} from "src/cs/workbench/contrib/quickaccess/browser/commandsQuickAccess";
import {
  DefaultQuickAccessProvider,
  FILES_QUICK_ACCESS_PREFIX,
  FilesQuickAccessProvider,
} from "src/cs/workbench/contrib/quickaccess/browser/quickAccessProviders";
import {
  QUICK_OPEN_COMMAND_ID,
  SHOW_COMMANDS_COMMAND_ID,
} from "src/cs/workbench/contrib/quickaccess/common/quickAccessCommands";
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
      id: QUICK_OPEN_COMMAND_ID,
      title: localize("workbench.commands.quickOpen", "Show quick access"),
      metadata: {
        description: localize("workbench.commands.quickOpen", "Show quick access"),
      },
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyCode.KeyP,
        weight: KeybindingWeight.WorkbenchContrib,
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
      id: SHOW_COMMANDS_COMMAND_ID,
      title: localize("workbench.commands.showCommands", "Show available commands"),
      metadata: {
        description: localize("workbench.commands.showCommands", "Show available commands"),
      },
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP,
        weight: KeybindingWeight.WorkbenchContrib,
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    const quickInput = accessor.get(IQuickInputService);
    quickInput.quickAccess.show(COMMANDS_QUICK_ACCESS_PREFIX);
  }
});

class QuickAccessContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    const registry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.QuickAccess);
    this._register(registry.registerQuickAccessProvider({
      ctor: DefaultQuickAccessProvider,
      prefix: "",
      placeholder: localize("quickAccess.placeholder", "Search commands/files"),
    }));
    this._register(registry.registerQuickAccessProvider({
      ctor: FilesQuickAccessProvider,
      prefix: FILES_QUICK_ACCESS_PREFIX,
      placeholder: localize("quickAccess.files.placeholder", "Search files"),
    }));
    this._register(registry.registerQuickAccessProvider({
      ctor: CommandsQuickAccessProvider,
      prefix: COMMANDS_QUICK_ACCESS_PREFIX,
      placeholder: localize("quickAccess.commands.placeholder", "Search commands"),
    }));
  }
}

registerWorkbenchContribution2(
  QuickAccessContributionId,
  QuickAccessContribution,
  WorkbenchPhase.BlockStartup,
);
