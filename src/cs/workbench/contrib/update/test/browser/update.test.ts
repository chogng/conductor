/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  isIMenuItem,
  MenuId,
  MenuRegistry,
} from "src/cs/platform/actions/common/actions";
import {
  CommandsRegistry,
  ICommandService,
  type ICommandEvent,
  type ICommandService as ICommandServiceType,
} from "src/cs/platform/commands/common/commands";
import type {
  ServicesAccessor,
  ServiceIdentifier,
} from "src/cs/platform/instantiation/common/instantiation";
import {
  appendUpdateMenuItems,
  registerUpdateCommands,
} from "src/cs/workbench/contrib/update/browser/update";
import {
  IWorkbenchUpdateService,
  UpdateCommandId,
  type DesktopUpdateStatus,
  type IWorkbenchUpdateService as IWorkbenchUpdateServiceType,
} from "src/cs/workbench/contrib/update/common/update";

suite("workbench/contrib/update/test/browser/update", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("registers update commands against the update service owner", async () => {
    const registration = registerUpdateCommands();
    const calls: string[] = [];
    const status: DesktopUpdateStatus = {
      status: "downloaded",
      version: "1.2.3",
      channel: "github",
      isStoreManaged: false,
      message: null,
    };
    let accessor!: ServicesAccessor;
    const commandService: ICommandServiceType = {
      _serviceBrand: undefined,
      onDidExecuteCommand: Event.None as Event<ICommandEvent>,
      onWillExecuteCommand: Event.None as Event<ICommandEvent>,
      executeCommand: async <R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> => {
        const result = await CommandsRegistry.getCommand(id)?.handler(accessor, ...args);
        return result as R | undefined;
      },
    };
    accessor = createAccessor([
      [ICommandService, commandService],
      [IWorkbenchUpdateService, createUpdateService({
        checkForUpdates: async () => {
          calls.push("check");
          return "checked";
        },
        getStatus: () => status,
        installDownloadedUpdate: async () => {
          calls.push("install");
          return true;
        },
      })],
    ]);

    try {
      await CommandsRegistry.getCommand(UpdateCommandId.check)?.handler(accessor);
      await CommandsRegistry.getCommand(UpdateCommandId.downloadNow)?.handler(accessor);
      await CommandsRegistry.getCommand(UpdateCommandId.install)?.handler(accessor);
      await CommandsRegistry.getCommand(UpdateCommandId.restart)?.handler(accessor);
      const commandState = await CommandsRegistry.getCommand(UpdateCommandId.state)?.handler(accessor);

      assert.deepStrictEqual({
        calls,
        commandPaletteHasUpdateCheck: getCommandPaletteIds().has(UpdateCommandId.check),
        commandState,
      }, {
        calls: ["check", "check", "install", "install"],
        commandPaletteHasUpdateCheck: true,
        commandState: status,
      });
    } finally {
      registration.dispose();
    }
  });

  test("appends update menu items for update states", () => {
    const menuId = MenuId.for("test.update.menu");
    const registration = appendUpdateMenuItems(menuId, "test_update");

    try {
      const items = MenuRegistry.getMenuItems(menuId).filter(isIMenuItem);
      assert.deepStrictEqual(items.map(item => item.command.id), [
        UpdateCommandId.check,
        UpdateCommandId.checking,
        UpdateCommandId.downloadNow,
        UpdateCommandId.downloading,
        UpdateCommandId.install,
        UpdateCommandId.updating,
      ]);
      assert.deepStrictEqual(items.map(item => item.group), [
        "test_update",
        "test_update",
        "test_update",
        "test_update",
        "test_update",
        "test_update",
      ]);
    } finally {
      registration.dispose();
    }
  });
});

function createAccessor(
  services: readonly (readonly [ServiceIdentifier<unknown>, unknown])[],
): ServicesAccessor {
  const values = new Map<ServiceIdentifier<unknown>, unknown>(services);
  return {
    get: <T>(id: ServiceIdentifier<T>): T =>
      values.get(id as ServiceIdentifier<unknown>) as T,
  };
}

function createUpdateService(
  overrides: Partial<IWorkbenchUpdateServiceType>,
): IWorkbenchUpdateServiceType {
  return {
    _serviceBrand: undefined,
    canCheckForUpdates: () => true,
    checkForUpdates: async () => undefined,
    checkForUpdatesAndInstall: async () => undefined,
    getStatus: () => ({
      status: "idle",
      version: null,
      channel: "none",
      isStoreManaged: false,
      message: null,
    }),
    installDownloadedUpdate: async () => undefined,
    onDidChangeStatus: Event.None as Event<DesktopUpdateStatus>,
    ...overrides,
  };
}

function getCommandPaletteIds(): Set<string> {
  return new Set(MenuRegistry.getMenuItems(MenuId.CommandPalette)
    .filter(isIMenuItem)
    .map(item => item.command.id));
}
