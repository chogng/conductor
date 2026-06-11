import { localize } from "src/cs/nls";
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
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  IQuickInputService,
  type QuickPickItem,
} from "src/cs/platform/quickinput/common/quickInput";

type QuickAccessCommand = QuickPickItem & {
  readonly id: string;
  readonly label: string;
  readonly description: string;
};

export const showCommandsQuickAccess = async (accessor: ServicesAccessor): Promise<void> => {
  const quickInputService = accessor.get(IQuickInputService);
  const commandService = accessor.get(ICommandService);
  const command = await quickInputService.pick({
    ariaLabel: localize("quickAccess.commandsAriaLabel", "Command search"),
    emptyText: localize("quickAccess.empty", "No commands found"),
    items: getQuickAccessCommands(),
    placeholder: localize("quickAccess.placeholder", "Search commands"),
  });
  if (!command) {
    return;
  }

  await commandService.executeCommand(command.id);
};

const getQuickAccessCommands = (): readonly QuickAccessCommand[] => {
  const items = MenuRegistry.getMenuItems(MenuId.CommandPalette);
  const commands = new Map<string, QuickAccessCommand>();

  for (const item of items) {
    if (!isIMenuItem(item)) {
      continue;
    }

    const command = createQuickAccessCommand(item);
    if (command) {
      commands.set(command.id, command);
    }
  }

  return Array.from(commands.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
};

const createQuickAccessCommand = (item: IMenuItem): QuickAccessCommand | null => {
  const label = titleToString(item.command.title);
  if (!item.command.id || !label) {
    return null;
  }

  return {
    id: item.command.id,
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
