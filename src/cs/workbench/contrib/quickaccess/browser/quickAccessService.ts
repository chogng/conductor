import { Disposable } from "src/cs/base/common/lifecycle";
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
  type ICommandService as ICommandServiceType,
} from "src/cs/platform/commands/common/commands";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IQuickAccessService,
  type IQuickAccessService as IQuickAccessServiceType,
} from "src/cs/workbench/contrib/quickaccess/common/quickAccess";

type QuickAccessCommand = {
  readonly id: string;
  readonly label: string;
  readonly category: string;
};

export class BrowserQuickAccessService extends Disposable implements IQuickAccessServiceType {
  public declare readonly _serviceBrand: undefined;

  private controller: AbortController | null = null;
  private overlay: HTMLElement | null = null;

  public constructor(
    @ICommandService private readonly commandService: ICommandServiceType,
  ) {
    super();
  }

  public show(): void {
    if (this.overlay) {
      this.overlay.querySelector<HTMLInputElement>(".quick-access-input")?.focus();
      return;
    }

    const commands = getQuickAccessCommands();
    const controller = new AbortController();
    const overlay = document.createElement("div");
    overlay.className = "quick-access-overlay";
    overlay.setAttribute("role", "presentation");

    const panel = document.createElement("div");
    panel.className = "quick-access-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", localize("quickAccess.commandsAriaLabel", "Command search"));

    const input = document.createElement("input");
    input.className = "quick-access-input";
    input.type = "text";
    input.placeholder = localize("quickAccess.placeholder", "Search commands");
    input.setAttribute("aria-label", localize("quickAccess.inputAriaLabel", "Search commands"));

    const list = document.createElement("div");
    list.className = "quick-access-list";
    list.setAttribute("role", "listbox");

    panel.append(input, list);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const runCommand = (commandId: string): void => {
      this.close();
      void this.commandService.executeCommand(commandId);
    };
    const render = (): void => {
      renderQuickAccessList({
        commands,
        filter: input.value,
        list,
        onRun: runCommand,
      });
    };

    overlay.addEventListener("mousedown", event => {
      if (event.target === overlay) {
        this.close();
      }
    }, { signal: controller.signal });
    input.addEventListener("input", render, { signal: controller.signal });
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
        return;
      }

      if (event.key === "Enter") {
        const firstCommandId = list.querySelector<HTMLElement>("[data-command-id]")?.dataset.commandId;
        if (firstCommandId) {
          event.preventDefault();
          runCommand(firstCommandId);
        }
      }
    }, { signal: controller.signal });

    this.controller = controller;
    this.overlay = overlay;
    render();
    input.focus();
  }

  public override dispose(): void {
    this.close();
    super.dispose();
  }

  private close(): void {
    this.controller?.abort();
    this.controller = null;
    this.overlay?.remove();
    this.overlay = null;
  }
}

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
    category: titleToString(item.command.category),
  };
};

const titleToString = (title: ICommandActionTitle | undefined): string => {
  if (!title) {
    return "";
  }

  return isLocalizedString(title) ? title.value : title;
};

const renderQuickAccessList = ({
  commands,
  filter,
  list,
  onRun,
}: {
  readonly commands: readonly QuickAccessCommand[];
  readonly filter: string;
  readonly list: HTMLElement;
  readonly onRun: (commandId: string) => void;
}): void => {
  const normalizedFilter = filter.trim().toLowerCase();
  const visibleCommands = normalizedFilter
    ? commands.filter(command =>
      `${command.label} ${command.category} ${command.id}`.toLowerCase().includes(normalizedFilter),
    )
    : commands;

  list.replaceChildren();

  if (!visibleCommands.length) {
    const empty = document.createElement("div");
    empty.className = "quick-access-empty";
    empty.textContent = localize("quickAccess.empty", "No commands found");
    list.appendChild(empty);
    return;
  }

  for (const command of visibleCommands.slice(0, 30)) {
    const button = document.createElement("button");
    button.className = "quick-access-item";
    button.type = "button";
    button.dataset.commandId = command.id;
    button.setAttribute("role", "option");

    const label = document.createElement("span");
    label.className = "quick-access-item-label";
    label.textContent = command.label;

    const hint = document.createElement("span");
    hint.className = "quick-access-item-hint";
    hint.textContent = command.category || command.id;

    button.append(label, hint);
    button.addEventListener("click", () => onRun(command.id));
    list.appendChild(button);
  }
};

registerSingleton(IQuickAccessService, BrowserQuickAccessService, InstantiationType.Delayed);
