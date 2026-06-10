/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { combinedDisposable, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { LinkedList } from "src/cs/base/common/linkedList";
import type {
  ICommandAction,
  ICommandActionTitle,
  ILocalizedString,
} from "src/cs/platform/action/common/action";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import type { ContextKeyExpression } from "src/cs/platform/contextkey/common/contextkey";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";

export interface IMenuItem {
  readonly command: ICommandAction;
  readonly alt?: ICommandAction;
  readonly when?: ContextKeyExpression;
  readonly group?: "navigation" | string;
  readonly order?: number;
  readonly isHiddenByDefault?: boolean;
}

export interface ISubmenuItem {
  readonly title: string | ICommandActionTitle;
  readonly submenu: MenuId;
  readonly icon?: ICommandAction["icon"];
  readonly when?: ContextKeyExpression;
  readonly group?: "navigation" | string;
  readonly order?: number;
  readonly isSelection?: boolean;
  readonly isSplitButton?: boolean | { readonly togglePrimaryAction: true };
}

export function isIMenuItem(item: unknown): item is IMenuItem {
  return typeof item === "object" && item !== null && "command" in item;
}

export function isISubmenuItem(item: unknown): item is ISubmenuItem {
  return typeof item === "object" && item !== null && "submenu" in item;
}

export class MenuId {
  private static readonly instances = new Map<string, MenuId>();

  public static readonly CommandPalette = new MenuId("CommandPalette");

  public static for(identifier: string): MenuId {
    return MenuId.instances.get(identifier) ?? new MenuId(identifier);
  }

  public constructor(public readonly id: string) {
    if (MenuId.instances.has(id)) {
      throw new TypeError(`MenuId with identifier '${id}' already exists. Use MenuId.for(ident) or a unique identifier`);
    }
    MenuId.instances.set(id, this);
  }
}

export interface IMenuRegistryChangeEvent {
  has(id: MenuId): boolean;
}

class MenuRegistryChangeEvent implements IMenuRegistryChangeEvent {
  private static readonly events = new Map<MenuId, MenuRegistryChangeEvent>();

  public static for(id: MenuId): MenuRegistryChangeEvent {
    const existing = MenuRegistryChangeEvent.events.get(id);
    if (existing) {
      return existing;
    }

    const event = new MenuRegistryChangeEvent(id);
    MenuRegistryChangeEvent.events.set(id, event);
    return event;
  }

  private constructor(private readonly id: MenuId) {}

  public has(id: MenuId): boolean {
    return id === this.id;
  }
}

export type ICommandsMap = Map<string, ICommandAction>;

export interface IMenuRegistry {
  readonly onDidChangeMenu: Event<IMenuRegistryChangeEvent>;
  addCommand(userCommand: ICommandAction): IDisposable;
  getCommand(id: string): ICommandAction | undefined;
  getCommands(): ICommandsMap;
  appendMenuItems(items: Iterable<{ id: MenuId; item: IMenuItem | ISubmenuItem }>): IDisposable;
  appendMenuItem(menu: MenuId, item: IMenuItem | ISubmenuItem): IDisposable;
  getMenuItems(loc: MenuId): Array<IMenuItem | ISubmenuItem>;
}

export const MenuRegistry: IMenuRegistry = new class implements IMenuRegistry {
  private readonly commands = new Map<string, ICommandAction>();
  private readonly menuItems = new Map<MenuId, LinkedList<IMenuItem | ISubmenuItem>>();
  private readonly onDidChangeMenuEmitter = new Emitter<IMenuRegistryChangeEvent>();

  public readonly onDidChangeMenu = this.onDidChangeMenuEmitter.event;

  public addCommand(command: ICommandAction): IDisposable {
    this.commands.set(command.id, command);
    this.onDidChangeMenuEmitter.fire(MenuRegistryChangeEvent.for(MenuId.CommandPalette));

    return toDisposable(() => {
      if (this.commands.delete(command.id)) {
        this.onDidChangeMenuEmitter.fire(MenuRegistryChangeEvent.for(MenuId.CommandPalette));
      }
    });
  }

  public getCommand(id: string): ICommandAction | undefined {
    return this.commands.get(id);
  }

  public getCommands(): ICommandsMap {
    return new Map(this.commands);
  }

  public appendMenuItem(id: MenuId, item: IMenuItem | ISubmenuItem): IDisposable {
    let list = this.menuItems.get(id);
    if (!list) {
      list = new LinkedList<IMenuItem | ISubmenuItem>();
      this.menuItems.set(id, list);
    }

    const removeItem = list.push(item);
    this.onDidChangeMenuEmitter.fire(MenuRegistryChangeEvent.for(id));
    return toDisposable(() => {
      removeItem();
      this.onDidChangeMenuEmitter.fire(MenuRegistryChangeEvent.for(id));
    });
  }

  public appendMenuItems(items: Iterable<{ id: MenuId; item: IMenuItem | ISubmenuItem }>): IDisposable {
    const disposables: IDisposable[] = [];
    for (const { id, item } of items) {
      disposables.push(this.appendMenuItem(id, item));
    }
    return combinedDisposable(...disposables);
  }

  public getMenuItems(id: MenuId): Array<IMenuItem | ISubmenuItem> {
    const result = this.menuItems.has(id)
      ? [...this.menuItems.get(id)!]
      : [];

    if (id === MenuId.CommandPalette) {
      this.appendImplicitItems(result);
    }

    return result;
  }

  private appendImplicitItems(result: Array<IMenuItem | ISubmenuItem>): void {
    const ids = new Set<string>();
    for (const item of result) {
      if (isIMenuItem(item)) {
        ids.add(item.command.id);
        if (item.alt) {
          ids.add(item.alt.id);
        }
      }
    }

    for (const [id, command] of this.commands) {
      if (!ids.has(id)) {
        result.push({ command });
      }
    }
  }
};

type OneOrN<T> = T | T[];

interface IKeybindingRuleOptions {
  readonly when?: ContextKeyExpression;
  readonly weight?: number;
  readonly primary?: number;
  readonly secondary?: readonly number[];
  readonly mac?: { readonly primary?: number; readonly secondary?: readonly number[] };
  readonly win?: { readonly primary?: number; readonly secondary?: readonly number[] };
  readonly linux?: { readonly primary?: number; readonly secondary?: readonly number[] };
}

interface IAction2CommonOptions extends ICommandAction {
  readonly menu?: OneOrN<{ readonly id: MenuId; readonly precondition?: null } & Omit<IMenuItem, "command">>;
  readonly keybinding?: OneOrN<IKeybindingRuleOptions>;
}

interface IBaseAction2Options extends IAction2CommonOptions {
  readonly f1?: false;
}

export interface ICommandPaletteOptions extends IAction2CommonOptions {
  readonly title: string | ILocalizedString;
  readonly category?: string | ILocalizedString;
  readonly f1: true;
}

export type IAction2Options = ICommandPaletteOptions | IBaseAction2Options;

export interface IAction2F1RequiredOptions {
  readonly title: string | ILocalizedString;
  readonly category?: string | ILocalizedString;
}

export abstract class Action2 {
  public constructor(readonly desc: Readonly<IAction2Options>) {}

  public abstract run(accessor: ServicesAccessor, ...args: unknown[]): void;
}

export function registerAction2(ctor: { new(): Action2 }): IDisposable {
  const disposables: IDisposable[] = [];
  const action = new ctor();

  const { f1, menu, keybinding: _keybinding, ...command } = action.desc;

  if (CommandsRegistry.getCommand(command.id)) {
    throw new Error(`Cannot register two commands with the same id: ${command.id}`);
  }

  disposables.push(CommandsRegistry.registerCommand({
    id: command.id,
    handler: (accessor, ...args) => action.run(accessor, ...args),
    metadata: command.metadata ?? { description: action.desc.title },
  }));

  if (Array.isArray(menu)) {
    for (const item of menu) {
      disposables.push(MenuRegistry.appendMenuItem(item.id, {
        command: {
          ...command,
          precondition: item.precondition === null ? undefined : command.precondition,
        },
        ...item,
      }));
    }
  } else if (menu) {
    disposables.push(MenuRegistry.appendMenuItem(menu.id, {
      command: {
        ...command,
        precondition: menu.precondition === null ? undefined : command.precondition,
      },
      ...menu,
    }));
  }

  if (f1) {
    disposables.push(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command,
      when: command.precondition,
    }));
    disposables.push(MenuRegistry.addCommand(command));
  }

  return combinedDisposable(...disposables);
}
