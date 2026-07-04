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
import {
  registerSettingsActions,
  SHOW_SETTINGS_COMMAND_ID,
} from "src/cs/workbench/contrib/settings/browser/settingsActions";
import { SettingsViewContainerId } from "src/cs/workbench/contrib/settings/common/settings";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";

suite("workbench/contrib/settings/test/browser/settingsActions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("show settings action opens the settings workbench view", () => {
    const actionRegistration = registerSettingsActions();
    const calls: string[] = [];
    const accessor = createAccessor([
      [IViewsService, {
        openViewContainer: async (id: string) => {
          calls.push(`container:${id}`);
          return null;
        },
      }],
    ]);

    try {
      CommandsRegistry.getCommand(SHOW_SETTINGS_COMMAND_ID)?.handler(accessor);
      const commandPaletteIds = getCommandPaletteIds();

      assert.deepEqual(calls, [
        `container:${SettingsViewContainerId}`,
      ]);
      assert.ok(commandPaletteIds.has(SHOW_SETTINGS_COMMAND_ID));
    } finally {
      actionRegistration.dispose();
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
