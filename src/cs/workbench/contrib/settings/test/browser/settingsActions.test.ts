/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  isIMenuItem,
  MenuId,
  MenuRegistry,
} from "src/cs/platform/actions/common/actions";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import type { ServicesAccessor, ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";
import { registerSettingsActions } from "src/cs/workbench/contrib/settings/browser/settingsActions";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { SettingsCommandId } from "src/cs/workbench/services/settings/common/settings";

suite("workbench/contrib/settings/test/browser/settingsActions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("show settings action opens the settings workbench view", () => {
    const registration = registerSettingsActions();
    const calls: string[] = [];
    const accessor = createAccessor([
      [IWorkbenchLayoutService, {
        navigateToView: (view: string) => calls.push(`view:${view}`),
      }],
    ]);

    try {
      CommandsRegistry.getCommand(SettingsCommandId.showSettings)?.handler(accessor);
      const commandPaletteIds = getCommandPaletteIds();

      assert.deepEqual(calls, ["view:settings"]);
      assert.ok(commandPaletteIds.has(SettingsCommandId.showSettings));
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

function getCommandPaletteIds(): Set<string> {
  return new Set(MenuRegistry.getMenuItems(MenuId.CommandPalette)
    .filter(isIMenuItem)
    .map(item => item.command.id));
}
