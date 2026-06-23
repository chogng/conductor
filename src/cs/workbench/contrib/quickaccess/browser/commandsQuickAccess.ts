import { PickerQuickAccessProvider } from "src/cs/platform/quickinput/browser/pickerQuickAccess";
import { isLocalizedString, type ICommandActionTitle } from "src/cs/platform/action/common/action";
import {
  IMenuService,
  MenuId,
  MenuItemAction,
} from "src/cs/platform/actions/common/actions";
import {
  ICommandService,
} from "src/cs/platform/commands/common/commands";
import {
  IContextKeyService,
  type IContextKeyService as IContextKeyServiceType,
} from "src/cs/platform/contextkey/common/contextkey";
import {
  type QuickAccessItem,
} from "src/cs/platform/quickinput/common/quickAccess";

export const COMMANDS_QUICK_ACCESS_PREFIX = ">";

type QuickAccessCommand = QuickAccessItem & {
  readonly id: string;
  readonly label: string;
  readonly description: string;
};

type ServiceOrResolver<T> = T | (() => T);

const resolveService = <T>(serviceOrResolver: ServiceOrResolver<T>): T =>
  typeof serviceOrResolver === "function"
    ? (serviceOrResolver as () => T)()
    : serviceOrResolver;

export class CommandsQuickAccessProvider extends PickerQuickAccessProvider<QuickAccessCommand> {
  public constructor(
    @ICommandService private readonly commandService: ServiceOrResolver<ICommandService>,
    @IMenuService private readonly menuService: ServiceOrResolver<IMenuService>,
    @IContextKeyService private readonly contextKeyService: ServiceOrResolver<IContextKeyServiceType>,
  ) {
    super();
  }

  protected getPicks(filter: string): readonly QuickAccessCommand[] {
    const normalizedFilter = filter.trim().toLowerCase();
    const commandService = resolveService(this.commandService);
    const commands = getQuickAccessCommands(
      resolveService(this.menuService),
      resolveService(this.contextKeyService),
      commandId => {
        void commandService.executeCommand(commandId);
      },
    );
    if (!normalizedFilter) {
      return commands;
    }

    return commands.filter(command =>
      `${command.label} ${command.description} ${command.id}`.toLowerCase().includes(normalizedFilter),
    );
  }
}

const getQuickAccessCommands = (
  menuService: IMenuService,
  contextKeyService: IContextKeyServiceType,
  runCommand: (commandId: string) => void,
): readonly QuickAccessCommand[] => {
  const groups = menuService.getMenuActions(MenuId.CommandPalette, contextKeyService);
  const commands = new Map<string, QuickAccessCommand>();

  for (const [, actions] of groups) {
    for (const action of actions) {
      if (!(action instanceof MenuItemAction)) {
        continue;
      }

      const command = createQuickAccessCommand(action, runCommand);
      if (command) {
        commands.set(command.id, command);
      }
    }
  }

  return Array.from(commands.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
};

const createQuickAccessCommand = (
  action: MenuItemAction,
  runCommand: (commandId: string) => void,
): QuickAccessCommand | null => {
  if (!action.enabled || !action.id || !action.label) {
    return null;
  }

  const commandId = action.id;
  return {
    accept: () => runCommand(commandId),
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
