/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
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
	TableSource,
	TableState,
} from "src/cs/workbench/services/table/common/table";
import type { TableColumnWidth } from "src/cs/workbench/services/table/common/tableColumnLayout";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type TableHighlight = ReturnType<TableControllerViewModel["getHighlight"]>;

type TableControllerTestOptions = {
	readonly getColumnWidths?: TableControllerProps["getColumnWidths"];
	readonly storeColumnWidths?: TableControllerProps["storeColumnWidths"];
	readonly tableState?: TableState;
	readonly tableViewModel?: TableControllerViewModel;
};

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

	test("stores pending column widths against the source that owned the resize", async () => {
		const sourceA = { resource: URI.file("/workspace/file-a.csv") };
		const sourceB = { resource: URI.file("/workspace/file-b.csv") };
		const stored: Array<{
			readonly owner: string;
			readonly source: string | null;
			readonly widths: readonly TableColumnWidth[];
		}> = [];
		const restoredSources: Array<string | null> = [];
		let tableState = createTableState(sourceA, 1);
		const tableViewModel = createTableViewModel(() => tableState);
		const createProps = (owner: string): TableControllerProps => createTableControllerProps({
			getColumnWidths: source => {
				restoredSources.push(source?.resource.toString() ?? null);
				return source?.resource.toString() === sourceA.resource.toString()
					? [{ colIndex: 0, width: 111 }]
					: [];
			},
			storeColumnWidths: (source, widths) => {
				stored.push({
					owner,
					source: source?.resource.toString() ?? null,
					widths,
				});
			},
			tableState,
			tableViewModel,
		});
		const controller = new TableController(createProps("source-a"));
		document.body.append(controller.element);

		try {
			await timeout(120);
			assert.deepEqual(restoredSources, [sourceA.resource.toString()]);
			assert.equal(controller.setColumnWidth({ colIndex: 0, width: 222 }), true);

			tableState = createTableState(sourceB, 2);
			controller.update(createProps("source-b"));

			assert.deepEqual(stored, [{
				owner: "source-a",
				source: sourceA.resource.toString(),
				widths: [{ colIndex: 0, width: 222 }],
			}]);
			assert.deepEqual(restoredSources, [
				sourceA.resource.toString(),
				sourceB.resource.toString(),
			]);
		} finally {
			controller.dispose();
		}
	});
});

function createTableControllerProps(options: TableControllerTestOptions = {}): TableControllerProps {
	const tableState = options.tableState ?? createTableState();
	const tableViewModel = options.tableViewModel ?? createTableViewModel(() => tableState);

	return {
		columnSizingMode: "fixed",
		getColumnWidths: options.getColumnWidths,
		onSelect: () => true,
		storeColumnWidths: options.storeColumnWidths,
		tableViewModel,
		tableService: createTableService(),
		tableState,
	};
}

function createTableState(
	source: TableSource = { resource: URI.file("/workspace/file-a.csv") },
	sourceVersion = 0,
): TableState {
	return {
		dimensions: "3 x 3",
		file: {
			columnCount: 3,
			fileName: "sample.csv",
			maxCellLengths: [1, 1, 1],
			rowCount: 3,
			source,
			sourceVersion,
		},
		fileName: "sample.csv",
		loadState: {
			message: "",
			state: "ready",
		},
		sheets: [{
			columnCount: 3,
			label: "sample.csv",
			rowCount: 3,
			source,
		}],
		source,
	};
}

function createTableViewModel(
	getState: () => TableState = () => createTableState(),
): TableControllerViewModel {
	return {
		get: rowIndex => [
			`A${rowIndex + 1}`,
			`B${rowIndex + 1}`,
			`C${rowIndex + 1}`,
		],
		getColumnDisplayProfile: colIndex => createRawColumnDisplayProfile(colIndex),
		getHighlight: (): TableHighlight => ({}),
		getRangeDecorations: () => [],
		getRowsVersion: () => 1,
		getSelection: (): TableSelection => ({}),
		getState,
		isResolved: () => true,
		onDidChangeHighlight: () => noopDisposable,
		onDidChangeRangeDecorations: () => noopDisposable,
		onDidChangeRevealCell: () => noopDisposable,
		onDidChangeSelection: () => noopDisposable,
		onDidChangeState: () => noopDisposable,
		resolve: async rowIndex => [
			`A${rowIndex + 1}`,
			`B${rowIndex + 1}`,
			`C${rowIndex + 1}`,
		],
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
		findCell: async () => ({ kind: "empty" }),
		getCellValue: async () => ({ kind: "empty" }),
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
