/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import {
	TableController,
	type TableControllerViewModel,
	type TableControllerProps,
} from "src/cs/workbench/contrib/table/browser/tableController";
import type {
	ColumnDisplayProfile,
} from "src/cs/workbench/services/table/common/tableDisplayProfile";
import type {
	ITableService,
	TableSelection,
	TableState,
} from "src/cs/workbench/services/table/common/table";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type TableHighlight = ReturnType<TableControllerViewModel["getHighlight"]>;

suite("workbench/contrib/table/browser/tableController", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("layouts without rebuilding table DOM", async () => {
		const controller = new TableController(createTableControllerProps());
		document.body.append(controller.element);

		try {
			await timeout(120);
			const content = controller.element.querySelector<HTMLElement>(".table_view_content");
			const table = controller.element.querySelector<HTMLTableElement>(".table_view_grid");
			const cell = controller.element.querySelector<HTMLTableCellElement>(".table_view_cell");
			assert.ok(content);
			assert.ok(table);
			assert.ok(cell);

			controller.layout();
			await timeout(120);

			assert.equal(
				controller.element.querySelector(".table_view_content"),
				content,
			);
			assert.equal(
				controller.element.querySelector(".table_view_grid"),
				table,
			);
			assert.equal(
				controller.element.querySelector(".table_view_cell"),
				cell,
			);
		} finally {
			controller.dispose();
		}
	});
});

function createTableControllerProps(): TableControllerProps {
	const tableViewModel = createTableViewModel();
	const tableState = createTableState();

	return {
		onSelect: () => true,
		tableViewModel,
		tableService: createTableService(),
		tableState,
	};
}

function createTableState(): TableState {
	return {
		dimensions: "3 x 3",
		file: {
			columnCount: 3,
			fileId: "file-a",
			fileName: "sample.csv",
			maxCellLengths: [1, 1, 1],
			rowCount: 3,
			sourceKey: "file-a:1",
		},
		fileName: "sample.csv",
		loadState: {
			message: "",
			state: "ready",
		},
		selectedFileId: "file-a",
		sourceKey: "file-a:1",
	};
}

function createTableViewModel(): TableControllerViewModel {
	return {
		ensureRows: async () => undefined,
		getColumnDisplayProfile: colIndex => createRawColumnDisplayProfile(colIndex),
		getHighlight: (): TableHighlight => ({}),
		getRow: rowIndex => [
			`A${rowIndex + 1}`,
			`B${rowIndex + 1}`,
			`C${rowIndex + 1}`,
		],
		getRowsVersion: () => 1,
		getSelection: (): TableSelection => ({}),
		getState: createTableState,
		onDidChangeHighlight: () => noopDisposable,
		onDidChangeRevealCell: () => noopDisposable,
		onDidChangeSelection: () => noopDisposable,
		onDidChangeState: () => noopDisposable,
		subscribeRowsVersion: () => noopDisposable,
	};
}

function createTableService(): ITableService {
	return {
		_serviceBrand: undefined,
		onDidChangeSelection: Event.None as Event<TableSelection>,
		onDidChangeTableViewInput: Event.None as Event<void>,
		adjustColumnDisplayScale: () => false,
		clearHighlight: () => undefined,
		clearSelection: () => false,
		getColumnWidths: () => [],
		getPreviewRow: () => null,
		getSelection: (): TableSelection => ({}),
		getSelectionText: async () => ({ kind: "empty" }),
		getViewInput: () => null,
		highlightColumns: () => undefined,
		open: () => undefined,
		reveal: () => false,
		resetColumnDisplayScale: () => false,
		select: () => false,
		selectAllColumns: () => false,
		storeColumnWidths: () => undefined,
	};
}

function createRawColumnDisplayProfile(colIndex: number): ColumnDisplayProfile {
	return {
		rawTableId: "file-a",
		columnId: String(colIndex),
		mode: "raw",
		isNumericColumn: false,
		scaleExponent: 0,
		significantDigits: 6,
		sourceVersion: 0,
		settingsVersion: 0,
	};
}

const noopDisposable = (): void => undefined;

function timeout(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
