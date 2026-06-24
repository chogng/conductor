/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  isIMenuItem,
  MenuId,
  MenuRegistry,
} from "src/cs/platform/actions/common/actions";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import { registerTemplateCommands } from "src/cs/workbench/contrib/template/browser/templateCommands";
import { TemplateCommandId } from "src/cs/workbench/contrib/template/common/template";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/template/test/browser/templateCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("template commands register command handlers", () => {
    const registration = registerTemplateCommands();

    try {
      for (const commandId of Object.values(TemplateCommandId)) {
        assert.ok(CommandsRegistry.getCommand(commandId), commandId);
      }
    } finally {
      registration.dispose();
    }
  });

  test("template library commands are command palette actions", () => {
    const registration = registerTemplateCommands();

    try {
      const commandPaletteIds = getCommandPaletteIds();
      assert.ok(commandPaletteIds.has(TemplateCommandId.createTemplate));
      assert.ok(commandPaletteIds.has(TemplateCommandId.deleteTemplate));
      assert.ok(commandPaletteIds.has(TemplateCommandId.importTemplate));
      assert.ok(commandPaletteIds.has(TemplateCommandId.editTemplate));
      assert.ok(commandPaletteIds.has(TemplateCommandId.exportTemplate));
    } finally {
      registration.dispose();
    }
  });
});

function getCommandPaletteIds(): Set<string> {
  return new Set(MenuRegistry.getMenuItems(MenuId.CommandPalette)
    .filter(isIMenuItem)
    .map(item => item.command.id));
}
