/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
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
import {
	CLEAR_TABLE_SELECTION_COMMAND_ID,
	COPY_TABLE_SELECTION_COMMAND_ID,
	DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
	INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
	RESET_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
	RESET_TABLE_ZOOM_COMMAND_ID,
	SELECT_ALL_TABLE_COLUMNS_COMMAND_ID,
	ZOOM_IN_TABLE_COMMAND_ID,
	ZOOM_OUT_TABLE_COMMAND_ID,
} from "src/cs/workbench/contrib/table/common/table";
import {
	ITableService,
	type TableSelection,
} from "src/cs/workbench/services/table/common/table";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/table/test/browser/tableCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("table commands are command palette actions", () => {
		const registration = registerTableActions();

		try {
			const commandPaletteIds = getCommandPaletteIds();
			for (const commandId of [
				CLEAR_TABLE_SELECTION_COMMAND_ID,
				COPY_TABLE_SELECTION_COMMAND_ID,
				DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
				INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
				RESET_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
				RESET_TABLE_ZOOM_COMMAND_ID,
				SELECT_ALL_TABLE_COLUMNS_COMMAND_ID,
				ZOOM_IN_TABLE_COMMAND_ID,
				ZOOM_OUT_TABLE_COMMAND_ID,
			]) {
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
			assert.equal(await CommandsRegistry.getCommand(ZOOM_IN_TABLE_COMMAND_ID)?.handler(accessor), true);
			assert.equal(await CommandsRegistry.getCommand(ZOOM_OUT_TABLE_COMMAND_ID)?.handler(accessor), true);
			assert.equal(await CommandsRegistry.getCommand(RESET_TABLE_ZOOM_COMMAND_ID)?.handler(accessor), true);
			assert.deepEqual(calls, ["zoomIn", "zoomOut", "resetZoom"]);
		} finally {
			zoomControllerRegistration.dispose();
			tableWidgetService.dispose();
			registration.dispose();
		}
	});

	test("column display scale actions use explicit or selected columns", async () => {
		const registration = registerTableActions();
		const calls: string[] = [];
		let selection: TableSelection = {
			activeCell: { colIndex: 4, rowIndex: 2 },
		};
		const tableService = {
			adjustColumnDisplayScale: (colIndex: number, deltaExponent: number) => {
				calls.push(`adjust:${colIndex}:${deltaExponent}`);
				return true;
			},
			getSelection: () => selection,
			resetColumnDisplayScale: (colIndex: number) => {
				calls.push(`reset:${colIndex}`);
				return true;
			},
		} as unknown as ITableService;
		const accessor = {
			get: (serviceId: unknown) => {
				if (serviceId === ITableService) {
					return tableService;
				}
				throw new Error("column display scale commands must resolve only ITableService");
			},
		} as unknown as ServicesAccessor;

		try {
			assert.equal(
				await CommandsRegistry.getCommand(INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID)?.handler(accessor, 2),
				true,
			);
			assert.equal(
				await CommandsRegistry.getCommand(DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID)?.handler(accessor),
				true,
			);
			selection = {
				activeCell: { colIndex: 4, rowIndex: 2 },
				selectedColumns: [1],
			};
			assert.equal(
				await CommandsRegistry.getCommand(RESET_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID)?.handler(accessor),
				true,
			);
			selection = {
				selectedColumns: [1, 2],
			};
			assert.equal(
				await CommandsRegistry.getCommand(INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID)?.handler(accessor),
				false,
			);
			assert.deepEqual(calls, [
				"adjust:2:1",
				"adjust:4:-1",
				"reset:1",
			]);
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
