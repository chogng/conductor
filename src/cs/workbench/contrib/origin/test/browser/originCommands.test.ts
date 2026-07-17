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
import { SHOW_ORIGIN_EXPORT_SETTINGS_COMMAND_ID } from "src/cs/workbench/services/origin/common/origin";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/origin/test/browser/originCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("show origin settings command opens chart settings auxiliary view", () => {
		const registration = registerOriginCommands();
		const calls: string[] = [];
		const accessor = createAccessor([
			[IWorkbenchLayoutService, {
				selectAuxiliaryBarView: (view: string) => calls.push(`aux:${view}`),
			}],
			[IViewsService, {
				openViewContainer: async (id: string) => {
					calls.push(`container:${id}`);
					return null;
				},
			}],
		]);

		try {
			CommandsRegistry.getCommand(SHOW_ORIGIN_EXPORT_SETTINGS_COMMAND_ID)?.handler(accessor);
			const commandPaletteIds = getCommandPaletteIds();

			assert.deepEqual(calls, [
				`container:${ChartViewContainerId}`,
				"aux:settings",
			]);
			assert.ok(commandPaletteIds.has(SHOW_ORIGIN_EXPORT_SETTINGS_COMMAND_ID));
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
