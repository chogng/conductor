import { CancellationToken } from "src/cs/base/common/async";
import { localize } from "src/cs/nls";
import { isLocalizedString, type ICommandActionTitle } from "src/cs/platform/action/common/action";
import {
  IMenuService,
  MenuId,
  MenuItemAction,
} from "src/cs/platform/actions/common/actions";
import {
  ICommandService,
  type ICommandService as ICommandServiceType,
} from "src/cs/platform/commands/common/commands";
import {
  IContextKeyService,
  type IContextKeyService as IContextKeyServiceType,
} from "src/cs/platform/contextkey/common/contextkey";
import {
  AbstractCommandsQuickAccessProvider,
  type ICommandQuickPick,
} from "src/cs/platform/quickinput/browser/commandsQuickAccess";

export const COMMANDS_QUICK_ACCESS_PREFIX = AbstractCommandsQuickAccessProvider.PREFIX;

export class CommandsQuickAccessProvider extends AbstractCommandsQuickAccessProvider {
  public constructor(
    @ICommandService commandService: ICommandServiceType,
    @IMenuService private readonly menuService: IMenuService,
    @IContextKeyService private readonly contextKeyService: IContextKeyServiceType,
  ) {
    super({
      noResultsPick: {
        commandId: "",
        id: "quickAccess.commands.noResults",
        label: localize("quickAccess.commands.noResults", "No matching commands"),
      },
      showAlias: false,
    }, commandService);
  }

  protected async getCommandPicks(token: CancellationToken): Promise<Array<ICommandQuickPick>> {
    if (token.isCancellationRequested) {
      return [];
    }

    return getQuickAccessCommands(
      this.menuService,
      this.contextKeyService,
    );
  }
}

const getQuickAccessCommands = (
  menuService: IMenuService,
  contextKeyService: IContextKeyServiceType,
): ICommandQuickPick[] => {
  const groups = menuService.getMenuActions(MenuId.CommandPalette, contextKeyService);
  const commands = new Map<string, ICommandQuickPick>();

  for (const [, actions] of groups) {
    for (const action of actions) {
      if (!(action instanceof MenuItemAction)) {
        continue;
      }

      const command = createQuickAccessCommand(action);
      if (command) {
        commands.set(command.commandId, command);
      }
    }
  }

  return Array.from(commands.values());
};

const createQuickAccessCommand = (
  action: MenuItemAction,
): ICommandQuickPick | null => {
  if (!action.enabled || !action.id || !action.label) {
    return null;
  }

  const commandId = action.id;
  return {
    commandCategory: titleToString(action.item.category),
    commandId,
    id: commandId,
    label: action.label,
    description: titleToString(action.item.category),
  };
};

const titleToString = (title: ICommandActionTitle | undefined): string => {
  if (!title) {
    return "";
  }

  return isLocalizedString(title) ? title.value : title;
};
