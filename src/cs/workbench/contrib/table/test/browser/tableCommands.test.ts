/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import {
	isIMenuItem,
	MenuId,
	MenuRegistry,
} from "src/cs/platform/actions/common/actions";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { registerTableActions } from "src/cs/workbench/contrib/table/browser/tableActions";
import {
	ITableWidgetService,
	TableWidgetService,
	type ITableWidgetController,
} from "src/cs/workbench/contrib/table/browser/tableWidgetService";
import { TableCommandId } from "src/cs/workbench/contrib/table/common/table";
import { ITableService, type TableSource } from "src/cs/workbench/services/table/common/table";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/table/test/browser/tableCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("table commands are command palette actions", () => {
		const registration = registerTableActions();

		try {
			const commandPaletteIds = getCommandPaletteIds();
			for (const commandId of Object.values(TableCommandId)) {
				assert.ok(CommandsRegistry.getCommand(commandId), commandId);
				assert.ok(commandPaletteIds.has(commandId), commandId);
			}
		} finally {
			registration.dispose();
		}
	});

	test("zoom commands dispatch to the active table zoom controller", async () => {
		const registration = registerTableActions();
		const calls: string[] = [];
		const tableWidgetService = new TableWidgetService();
		const zoomControllerRegistration = tableWidgetService.registerController(createTableWidgetController(calls));
		const accessor = {
			get: (serviceId: unknown) => {
				if (serviceId === ITableWidgetService) {
					return tableWidgetService;
				}
				throw new Error("zoom commands must resolve only ITableWidgetService");
			},
		} as unknown as ServicesAccessor;

		try {
			assert.equal(await CommandsRegistry.getCommand(TableCommandId.zoomIn)?.handler(accessor), true);
			assert.equal(await CommandsRegistry.getCommand(TableCommandId.zoomOut)?.handler(accessor), true);
			assert.equal(await CommandsRegistry.getCommand(TableCommandId.resetZoom)?.handler(accessor), true);
			assert.deepEqual(calls, ["zoomIn", "zoomOut", "resetZoom"]);
		} finally {
			zoomControllerRegistration.dispose();
			tableWidgetService.dispose();
			registration.dispose();
		}
	});

	test("column auto-fit command delegates to the table service active source", async () => {
		const registration = registerTableActions();
		const source = { resource: URI.file("/workspace/table.csv") };
		const calls: Array<TableSource | null | undefined> = [];
		const tableService = {
			getViewInput: () => ({
				columnSizingMode: "fixed" as const,
				tableState: {
					file: { source },
					source,
				},
			}),
			toggleColumnSizingMode: (target: TableSource | null | undefined) => {
				calls.push(target);
				return true;
			},
		};
		const accessor = {
			get: (serviceId: unknown) => {
				if (serviceId === ITableService) {
					return tableService;
				}
				throw new Error("column auto-fit command must resolve only ITableService");
			},
		} as unknown as ServicesAccessor;

		try {
			assert.equal(await CommandsRegistry.getCommand(TableCommandId.toggleColumnAutoFit)?.handler(accessor), true);
			assert.deepEqual(calls, [source]);
		} finally {
			registration.dispose();
		}
	});

	test("table widget service exposes the last registered active controller", () => {
		const tableWidgetService = new TableWidgetService();
		const first = createTableWidgetController([]);
		const second = createTableWidgetController([]);

		const firstRegistration = tableWidgetService.registerController(first);
		assert.equal(tableWidgetService.activeController, first);

		const duplicateRegistration = tableWidgetService.registerController(first);
		duplicateRegistration.dispose();
		assert.equal(tableWidgetService.activeController, first);

		const secondRegistration = tableWidgetService.registerController(second);
		assert.equal(tableWidgetService.activeController, second);

		secondRegistration.dispose();
		assert.equal(tableWidgetService.activeController, first);

		firstRegistration.dispose();
		assert.equal(tableWidgetService.activeController, null);
		tableWidgetService.dispose();
	});
});

function createTableWidgetController(calls: string[]): ITableWidgetController {
	return {
		onDidChangeZoom: Event.None as Event<number>,
		focus: () => undefined,
		getZoomPercent: () => 100,
		resetZoom: () => calls.push("resetZoom") > 0,
		zoomIn: () => calls.push("zoomIn") > 0,
		zoomOut: () => calls.push("zoomOut") > 0,
	};
}

function getCommandPaletteIds(): Set<string> {
	return new Set(MenuRegistry.getMenuItems(MenuId.CommandPalette)
		.filter(isIMenuItem)
		.map(item => item.command.id));
}
