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
import { registerParametersCommands } from "src/cs/workbench/contrib/parameters/browser/parametersCommands";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { ParametersCommandId } from "src/cs/workbench/services/parameters/common/parameters";

suite("workbench/contrib/parameters/test/browser/parametersCommands", () => {
	test("show parameters command opens chart parameters auxiliary view", () => {
		const registration = registerParametersCommands();
		const calls: string[] = [];
		const accessor = createAccessor([
			[IWorkbenchLayoutService, {
				navigateToView: (view: string) => calls.push(`view:${view}`),
				selectAuxiliaryBarView: (view: string) => calls.push(`aux:${view}`),
			}],
		]);

		try {
			CommandsRegistry.getCommand(ParametersCommandId.showParameters)?.handler(accessor);
			const commandPaletteIds = getCommandPaletteIds();

			assert.deepEqual(calls, ["view:chart", "aux:parameters"]);
			assert.ok(commandPaletteIds.has(ParametersCommandId.showParameters));
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
