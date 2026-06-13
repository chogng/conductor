import { PickerQuickAccessProvider } from "src/cs/platform/quickinput/browser/pickerQuickAccess";
import { isLocalizedString, type ICommandActionTitle } from "src/cs/platform/action/common/action";
import {
  isIMenuItem,
  MenuId,
  MenuRegistry,
  type IMenuItem,
} from "src/cs/platform/actions/common/actions";
import {
  ICommandService,
} from "src/cs/platform/commands/common/commands";
import {
  type QuickAccessItem,
} from "src/cs/platform/quickinput/common/quickAccess";

export const COMMANDS_QUICK_ACCESS_PREFIX = ">";

type QuickAccessCommand = QuickAccessItem & {
  readonly id: string;
  readonly label: string;
  readonly description: string;
};

export class CommandsQuickAccessProvider extends PickerQuickAccessProvider<QuickAccessCommand> {
  public constructor(
    @ICommandService private readonly commandService: ICommandService,
  ) {
    super();
  }

  protected getPicks(filter: string): readonly QuickAccessCommand[] {
    const normalizedFilter = filter.trim().toLowerCase();
    const commands = getQuickAccessCommands(commandId => {
      void this.commandService.executeCommand(commandId);
    });
    if (!normalizedFilter) {
      return commands;
    }

    return commands.filter(command =>
      `${command.label} ${command.description} ${command.id}`.toLowerCase().includes(normalizedFilter),
    );
  }
}

const getQuickAccessCommands = (
  runCommand: (commandId: string) => void,
): readonly QuickAccessCommand[] => {
  const items = MenuRegistry.getMenuItems(MenuId.CommandPalette);
  const commands = new Map<string, QuickAccessCommand>();

  for (const item of items) {
    if (!isIMenuItem(item)) {
      continue;
    }

    const command = createQuickAccessCommand(item, runCommand);
    if (command) {
      commands.set(command.id, command);
    }
  }

  return Array.from(commands.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
};

const createQuickAccessCommand = (
  item: IMenuItem,
  runCommand: (commandId: string) => void,
): QuickAccessCommand | null => {
  const label = titleToString(item.command.title);
  if (!item.command.id || !label) {
    return null;
  }

  const commandId = item.command.id;
  return {
    accept: () => runCommand(commandId),
    id: commandId,
    label,
    description: titleToString(item.command.category),
  };
};

const titleToString = (title: ICommandActionTitle | undefined): string => {
  if (!title) {
    return "";
  }

  return isLocalizedString(title) ? title.value : title;
};
