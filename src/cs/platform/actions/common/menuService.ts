import { Emitter } from "src/cs/base/common/event";
import { Separator } from "src/cs/base/common/actions";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import {
  IMenuService,
  isIMenuItem,
  isISubmenuItem,
  MenuId,
  MenuItemAction,
  MenuRegistry,
  SubmenuItemAction,
  type IMenu,
  type IMenuActionOptions,
  type IMenuChangeEvent,
  type IMenuCreateOptions,
  type IMenuItem,
  type ISubmenuItem,
} from "src/cs/platform/actions/common/actions";
import type { ICommandAction, ICommandActionTitle } from "src/cs/platform/action/common/action";
import { ICommandService, type ICommandService as ICommandServiceType } from "src/cs/platform/commands/common/commands";
import {
  getContextKeyRulesKeys,
  type ContextKeyExpression,
  type IContextKeyChangeEvent,
  type IContextKeyService,
} from "src/cs/platform/contextkey/common/contextkey";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";

type MenuItemGroup = [string, Array<IMenuItem | ISubmenuItem>];

export class MenuService extends Disposable implements IMenuService {
  public declare readonly _serviceBrand: undefined;

  public constructor(
    @ICommandService private readonly commandService: ICommandServiceType,
  ) {
    super();
  }

  public createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions): IMenu {
    return new MenuImpl(id, this.commandService, contextKeyService, options);
  }

  public getMenuActions(
    id: MenuId,
    contextKeyService: IContextKeyService,
    options?: IMenuActionOptions,
  ): [string, Array<MenuItemAction | SubmenuItemAction>][] {
    const menu = this.createMenu(id, contextKeyService);
    try {
      return menu.getActions(options);
    } finally {
      menu.dispose();
    }
  }

  public getMenuContexts(id: MenuId): ReadonlySet<string> {
    const snapshot = new MenuInfoSnapshot(id, false);
    return new Set([
      ...snapshot.structureContextKeys,
      ...snapshot.preconditionContextKeys,
      ...snapshot.toggledContextKeys,
    ]);
  }

  public resetHiddenStates(_ids?: readonly MenuId[]): void {}
}

class MenuInfoSnapshot {
  protected readonly menuGroups: MenuItemGroup[] = [];
  protected readonly allMenuIds = new Set<MenuId>();
  protected readonly structureKeys = new Set<string>();
  protected readonly preconditionKeys = new Set<string>();
  protected readonly toggledKeys = new Set<string>();

  public constructor(
    protected readonly id: MenuId,
    protected readonly collectContextKeysForSubmenus: boolean,
  ) {
    this.refresh();
  }

  public get structureContextKeys(): ReadonlySet<string> {
    return this.structureKeys;
  }

  public get preconditionContextKeys(): ReadonlySet<string> {
    return this.preconditionKeys;
  }

  public get toggledContextKeys(): ReadonlySet<string> {
    return this.toggledKeys;
  }

  public get menuIds(): ReadonlySet<MenuId> {
    return this.allMenuIds;
  }

  public refresh(): void {
    this.menuGroups.length = 0;
    this.allMenuIds.clear();
    this.structureKeys.clear();
    this.preconditionKeys.clear();
    this.toggledKeys.clear();

    let currentGroup: MenuItemGroup | undefined;
    for (const item of this.sort(MenuRegistry.getMenuItems(this.id))) {
      const groupName = item.group ?? "";
      if (!currentGroup || currentGroup[0] !== groupName) {
        currentGroup = [groupName, []];
        this.menuGroups.push(currentGroup);
      }

      currentGroup[1].push(item);
      this.collectContextKeysAndSubmenuIds(item);
    }

    this.allMenuIds.add(this.id);
  }

  protected sort(menuItems: Array<IMenuItem | ISubmenuItem>): Array<IMenuItem | ISubmenuItem> {
    return menuItems;
  }

  private collectContextKeysAndSubmenuIds(item: IMenuItem | ISubmenuItem): void {
    fillContextKeys(item.when, this.structureKeys);

    if (isIMenuItem(item)) {
      fillContextKeys(item.command.precondition, this.preconditionKeys);
      fillContextKeys(getToggledExpression(item.command), this.toggledKeys);
      return;
    }

    if (!this.collectContextKeysForSubmenus) {
      return;
    }

    this.allMenuIds.add(item.submenu);
    for (const submenuItem of MenuRegistry.getMenuItems(item.submenu)) {
      this.collectContextKeysAndSubmenuIds(submenuItem);
    }
  }
}

class MenuInfo extends MenuInfoSnapshot {
  public constructor(
    id: MenuId,
    collectContextKeysForSubmenus: boolean,
    private readonly commandService: ICommandServiceType,
    private readonly contextKeyService: IContextKeyService,
  ) {
    super(id, collectContextKeysForSubmenus);
  }

  public createActionGroups(options?: IMenuActionOptions): [string, Array<MenuItemAction | SubmenuItemAction>][] {
    const result: [string, Array<MenuItemAction | SubmenuItemAction>][] = [];

    for (const [groupId, items] of this.menuGroups) {
      const actions: Array<MenuItemAction | SubmenuItemAction> = [];
      for (const item of items) {
        if (!this.contextKeyService.contextMatchesRules(item.when)) {
          continue;
        }

        if (isIMenuItem(item)) {
          actions.push(new MenuItemAction(
            item.command,
            item.alt,
            options,
            this.contextKeyService,
            this.commandService,
          ));
          continue;
        }

        const submenuGroups = new MenuInfo(
          item.submenu,
          this.collectContextKeysForSubmenus,
          this.commandService,
          this.contextKeyService,
        ).createActionGroups(options);
        const submenuActions = Separator.join(...submenuGroups.map(([, groupActions]) => groupActions));
        if (submenuActions.length) {
          actions.push(new SubmenuItemAction(item, submenuActions));
        }
      }

      if (actions.length) {
        result.push([groupId, actions]);
      }
    }

    return result;
  }

  protected override sort(menuItems: Array<IMenuItem | ISubmenuItem>): Array<IMenuItem | ISubmenuItem> {
    return menuItems.sort(compareMenuItems);
  }
}

class MenuImpl extends Disposable implements IMenu {
  private readonly onDidChangeEmitter = this._register(new Emitter<IMenuChangeEvent>());
  private readonly menuInfo: MenuInfo;
  private readonly listeners = this._register(new DisposableStore());

  public readonly onDidChange = this.onDidChangeEmitter.event;

  public constructor(
    id: MenuId,
    commandService: ICommandServiceType,
    private readonly contextKeyService: IContextKeyService,
    options: IMenuCreateOptions = {},
  ) {
    super();
    this.menuInfo = new MenuInfo(
      id,
      Boolean(options.emitEventsForSubmenuChanges),
      commandService,
      contextKeyService,
    );

    this.listeners.add(MenuRegistry.onDidChangeMenu(event => {
      if (!affectsSomeMenu(event, this.menuInfo.menuIds)) {
        return;
      }

      this.menuInfo.refresh();
      this.onDidChangeEmitter.fire({
        menu: this,
        isEnablementChange: true,
        isStructuralChange: true,
        isToggleChange: true,
      });
    }));

    this.listeners.add(this.contextKeyService.onDidChangeContext(event => {
      const change = getMenuContextChange(event, this.menuInfo);
      if (!change) {
        return;
      }

      this.onDidChangeEmitter.fire({
        menu: this,
        ...change,
      });
    }));
  }

  public getActions(options?: IMenuActionOptions): [string, Array<MenuItemAction | SubmenuItemAction>][] {
    return this.menuInfo.createActionGroups(options);
  }
}

function affectsSomeMenu(event: { has(id: MenuId): boolean }, menuIds: Iterable<MenuId>): boolean {
  for (const menuId of menuIds) {
    if (event.has(menuId)) {
      return true;
    }
  }

  return false;
}

function getMenuContextChange(
  event: IContextKeyChangeEvent,
  menuInfo: MenuInfoSnapshot,
): Omit<IMenuChangeEvent, "menu"> | null {
  const isStructuralChange = event.affectsSome(menuInfo.structureContextKeys);
  const isEnablementChange = event.affectsSome(menuInfo.preconditionContextKeys);
  const isToggleChange = event.affectsSome(menuInfo.toggledContextKeys);
  if (!isStructuralChange && !isEnablementChange && !isToggleChange) {
    return null;
  }

  return { isStructuralChange, isEnablementChange, isToggleChange };
}

function compareMenuItems(first: IMenuItem | ISubmenuItem, second: IMenuItem | ISubmenuItem): number {
  const firstGroup = first.group;
  const secondGroup = second.group;
  if (firstGroup !== secondGroup) {
    if (!firstGroup) {
      return 1;
    }

    if (!secondGroup) {
      return -1;
    }

    if (firstGroup === "navigation") {
      return -1;
    }

    if (secondGroup === "navigation") {
      return 1;
    }

    const groupOrder = firstGroup.localeCompare(secondGroup);
    if (groupOrder !== 0) {
      return groupOrder;
    }
  }

  const firstOrder = first.order ?? 0;
  const secondOrder = second.order ?? 0;
  if (firstOrder !== secondOrder) {
    return firstOrder - secondOrder;
  }

  return titleToString(isIMenuItem(first) ? first.command.title : first.title)
    .localeCompare(titleToString(isIMenuItem(second) ? second.command.title : second.title));
}

function fillContextKeys(expression: ContextKeyExpression | undefined, target: Set<string>): void {
  for (const key of getContextKeyRulesKeys(expression)) {
    target.add(key);
  }
}

function getToggledExpression(command: ICommandAction): ContextKeyExpression | undefined {
  if (!command.toggled) {
    return undefined;
  }

  return "condition" in command.toggled ? command.toggled.condition : command.toggled;
}

function titleToString(title: ICommandActionTitle | undefined): string {
  if (!title) {
    return "";
  }

  return typeof title === "string" ? title : title.value;
}

registerSingleton(IMenuService, MenuService, InstantiationType.Delayed);
