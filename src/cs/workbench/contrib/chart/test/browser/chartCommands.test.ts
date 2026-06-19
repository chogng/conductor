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
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import { registerChartCommands } from "src/cs/workbench/contrib/chart/browser/chartCommands";
import { ChartTitleEditService, IChartTitleEditService } from "src/cs/workbench/contrib/chart/browser/chartTitleEditService";
import { ChartService } from "src/cs/workbench/services/chart/browser/chartService";
import {
	EDIT_CHART_X_AXIS_TITLE_COMMAND_ID,
	EDIT_CHART_Y_AXIS_TITLE_COMMAND_ID,
	IChartService,
	TOGGLE_CHART_INSPECTOR_COMMAND_ID,
	type ChartAxisTitleEditRequest,
} from "src/cs/workbench/services/chart/common/chart";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/chart/test/browser/chartCommands", () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test("inspector toggle command delegates to chart service", () => {
		const commandRegistration = registerChartCommands();
		const storageService = new TestStorageService();
		const service = new ChartService(storageService);
		const accessor = createAccessor([
			[IChartService, service],
		]);

		CommandsRegistry.getCommand(TOGGLE_CHART_INSPECTOR_COMMAND_ID)?.handler(accessor);
		assert.deepEqual(service.getState().visibleDetailPanes, ["inspector"]);

		CommandsRegistry.getCommand(TOGGLE_CHART_INSPECTOR_COMMAND_ID)?.handler(accessor);
		assert.deepEqual(service.getState().visibleDetailPanes, []);

		commandRegistration.dispose();
		service.dispose();
		storageService.dispose();
	});

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

class TestStorageService extends AbstractStorageService {
	private readonly values = new Map<string, string>();

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.values.get(this.storageKey(key, scope));
	}

	protected writeValue(key: string, scope: StorageScope, value: string): void {
		this.values.set(this.storageKey(key, scope), value);
	}

	protected deleteValue(key: string, scope: StorageScope): void {
		this.values.delete(this.storageKey(key, scope));
	}

	protected readKeys(scope: StorageScope): string[] {
		const prefix = `${scope}:`;
		return [...this.values.keys()]
			.filter(key => key.startsWith(prefix))
			.map(key => key.slice(prefix.length));
	}

	private storageKey(key: string, scope: StorageScope): string {
		return `${scope}:${key}`;
	}
}
