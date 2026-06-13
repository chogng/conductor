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
import { registerChartCommands } from "src/cs/workbench/contrib/chart/browser/chartCommands";
import { ChartTitleEditService, IChartTitleEditService } from "src/cs/workbench/contrib/chart/browser/chartTitleEditService";
import {
	EDIT_CHART_X_AXIS_TITLE_COMMAND_ID,
	EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID,
	type ChartAxisTitleEditRequest,
} from "src/cs/workbench/services/chart/common/chart";

suite("workbench/contrib/chart/test/browser/chartCommands", () => {
	test("axis title edit commands delegate to chart title edit service", () => {
		const commandRegistration = registerChartCommands();
		const service = new ChartTitleEditService();
		const requests: ChartAxisTitleEditRequest[] = [];
		const handlerRegistration = service.registerHandler({
			editAxisTitle: request => {
				requests.push(request);
			},
		});
		const accessor = createAccessor([
			[IChartTitleEditService, service],
		]);

		CommandsRegistry.getCommand(EDIT_CHART_X_AXIS_TITLE_COMMAND_ID)?.handler(accessor);
		CommandsRegistry.getCommand(EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID)?.handler(accessor, "inspector");
		const commandPaletteIds = getCommandPaletteIds();

		assert.deepEqual(requests, [
			{ axis: "x", pane: "chart" },
			{ axis: "y", pane: "inspector" },
		]);
		assert.ok(commandPaletteIds.has(EDIT_CHART_X_AXIS_TITLE_COMMAND_ID));
		assert.ok(commandPaletteIds.has(EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID));

		handlerRegistration.dispose();
		commandRegistration.dispose();
		service.dispose();
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
