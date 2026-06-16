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
import type { ServicesAccessor, ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";
import { registerOriginCommands } from "src/cs/workbench/contrib/origin/browser/originCommands";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { OriginCommandId } from "src/cs/workbench/services/origin/common/origin";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/origin/test/browser/originCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("show origin settings command opens chart settings auxiliary view", () => {
		const registration = registerOriginCommands();
		const calls: string[] = [];
		const accessor = createAccessor([
			[IWorkbenchLayoutService, {
				navigateToView: (view: string) => calls.push(`view:${view}`),
				selectAuxiliaryBarView: (view: string) => calls.push(`aux:${view}`),
			}],
		]);

		try {
			CommandsRegistry.getCommand(OriginCommandId.showExportSettings)?.handler(accessor);
			const commandPaletteIds = getCommandPaletteIds();

			assert.deepEqual(calls, ["view:chart", "aux:settings"]);
			assert.ok(commandPaletteIds.has(OriginCommandId.showExportSettings));
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
