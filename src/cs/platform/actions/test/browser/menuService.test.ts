import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import {
  cleanGroupedActions,
  MenuId,
  MenuRegistry,
  type IMenuChangeEvent,
} from "src/cs/platform/actions/common/actions";
import { MenuService } from "src/cs/platform/actions/common/menuService";
import { type ICommandEvent, type ICommandService } from "src/cs/platform/commands/common/commands";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

let testMenuCounter = 0;

suite("platform/actions/common/menuService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("filters menu structure from when clauses", () => {
    const disposables = store.add(new DisposableStore());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    const menuId = newTestMenuId();
    disposables.add(MenuRegistry.appendMenuItem(menuId, {
      command: { id: "visible.command", title: "Visible" },
      when: ContextKeyExpr.equals("activeWorkbenchMainPart", "chart"),
    }));
    const menu = disposables.add(menuService.createMenu(menuId, contextKeyService));
    const events: IMenuChangeEvent[] = [];
    disposables.add(menu.onDidChange(event => events.push(event)));

    assert.deepEqual(cleanGroupedActions(menu.getActions()).map(action => action.id), []);

    contextKeyService.setContext("activeWorkbenchMainPart", "chart");

    assert.deepEqual(cleanGroupedActions(menu.getActions()).map(action => action.id), ["visible.command"]);
    assert.equal(events.at(-1)?.isStructuralChange, true);
  });

  test("evaluates command preconditions as enablement", () => {
    const disposables = store.add(new DisposableStore());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    const menuId = newTestMenuId();
    disposables.add(MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: "enabled.command",
        precondition: ContextKeyExpr.has("canRun"),
        title: "Enabled",
      },
    }));
    const menu = disposables.add(menuService.createMenu(menuId, contextKeyService));
    const events: IMenuChangeEvent[] = [];
    disposables.add(menu.onDidChange(event => events.push(event)));

    assert.equal(cleanGroupedActions(menu.getActions())[0].enabled, false);

    contextKeyService.setContext("canRun", true);

    assert.equal(cleanGroupedActions(menu.getActions())[0].enabled, true);
    assert.equal(events.at(-1)?.isEnablementChange, true);
    assert.equal(events.at(-1)?.isStructuralChange, false);
  });

  test("evaluates toggled commands as checked actions", () => {
    const disposables = store.add(new DisposableStore());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    const menuId = newTestMenuId();
    disposables.add(MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: "toggle.command",
        title: "Off",
        toggled: {
          condition: ContextKeyExpr.has("toggleOn"),
          title: "On",
          tooltip: "Enabled toggle",
        },
      },
    }));
    const menu = disposables.add(menuService.createMenu(menuId, contextKeyService));
    const events: IMenuChangeEvent[] = [];
    disposables.add(menu.onDidChange(event => events.push(event)));

    assert.deepEqual(cleanGroupedActions(menu.getActions()).map(action => ({
      checked: action.checked,
      label: action.label,
      tooltip: action.tooltip,
    })), [{ checked: false, label: "Off", tooltip: "" }]);

    contextKeyService.setContext("toggleOn", true);

    assert.deepEqual(cleanGroupedActions(menu.getActions()).map(action => ({
      checked: action.checked,
      label: action.label,
      tooltip: action.tooltip,
    })), [{ checked: true, label: "On", tooltip: "Enabled toggle" }]);
    assert.equal(events.at(-1)?.isToggleChange, true);
  });

  test("sorts groups and filters submenu actions", () => {
    const disposables = store.add(new DisposableStore());
    const contextKeyService = disposables.add(new ContextKeyService());
    const menuService = disposables.add(new MenuService(createCommandService()));
    const menuId = newTestMenuId();
    const submenuId = newTestMenuId();
    disposables.add(MenuRegistry.appendMenuItem(menuId, {
      command: { id: "default.command", title: "Default" },
    }));
    disposables.add(MenuRegistry.appendMenuItem(menuId, {
      command: { id: "navigation.command", title: "Navigation" },
      group: "navigation",
    }));
    disposables.add(MenuRegistry.appendMenuItem(menuId, {
      submenu: submenuId,
      title: "Submenu",
      group: "z",
    }));
    disposables.add(MenuRegistry.appendMenuItem(submenuId, {
      command: { id: "submenu.command", title: "Submenu Command" },
      when: ContextKeyExpr.has("showSubmenu"),
    }));

    const menu = disposables.add(menuService.createMenu(menuId, contextKeyService));

    assert.deepEqual(menu.getActions().map(([group]) => group), ["navigation", ""]);

    contextKeyService.setContext("showSubmenu", true);

    const groups = menu.getActions();
    assert.deepEqual(groups.map(([group]) => group), ["navigation", "z", ""]);
    assert.deepEqual(groups.map(([, actions]) => actions.map(action => action.id)), [
      ["navigation.command"],
      [`submenuitem.${submenuId.id}`],
      ["default.command"],
    ]);
    assert.deepEqual(groups.map(([, actions]) => actions.map(action => action.label)), [
      ["Navigation"],
      ["Submenu"],
      ["Default"],
    ]);
  });
});

function newTestMenuId(): MenuId {
  testMenuCounter += 1;
  return new MenuId(`test.menu.${testMenuCounter}`);
}

function createCommandService(): ICommandService {
  return {
    _serviceBrand: undefined,
    onDidExecuteCommand: Event.None as Event<ICommandEvent>,
    onWillExecuteCommand: Event.None as Event<ICommandEvent>,
    executeCommand: async <R = unknown>(): Promise<R | undefined> => undefined,
  };
}
