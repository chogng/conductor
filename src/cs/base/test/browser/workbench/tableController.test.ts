/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	TableController,
	type TableControllerModel,
	type TableControllerProps,
} from "src/cs/workbench/contrib/table/browser/tableController";
import type {
	ColumnDisplayProfile,
} from "src/cs/workbench/services/table/common/tableDisplayProfile";
import type {
	TableSelection,
	TableState,
} from "src/cs/workbench/services/table/common/table";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type TableHighlight = ReturnType<TableControllerModel["getHighlight"]>;

suite("workbench/contrib/table/browser/tableController", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("layouts without rebuilding table DOM", async () => {
		const controller = new TableController(createTableControllerProps());
		document.body.append(controller.element);

		try {
			const content = controller.element.querySelector<HTMLElement>(".table_view_content");
			const table = controller.element.querySelector<HTMLTableElement>(".table_view_grid");
			const cell = controller.element.querySelector<HTMLTableCellElement>(".table_view_cell");
			assert.ok(content);
			assert.ok(table);
			assert.ok(cell);

			const records: MutationRecord[] = [];
			const observer = new MutationObserver((mutations) => {
				records.push(...mutations);
			});
			observer.observe(controller.element, {
				childList: true,
				subtree: true,
			});

			controller.layout();
			await timeout(120);
			observer.disconnect();

			assert.deepEqual(records, []);
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
	const tableModel = createTableModel();
	const tableState = createTableState();

	return {
		onSelect: () => true,
		tableModel,
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

function createTableModel(): TableControllerModel {
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
