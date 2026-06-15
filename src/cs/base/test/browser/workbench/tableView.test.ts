/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	TableView,
	type TableViewProps,
} from "src/cs/workbench/contrib/table/browser/tableView";
import type {
	TableHighlight,
	TableModel,
	TableSelection,
	TableState,
} from "src/cs/workbench/services/table/common/table";

suite("workbench/contrib/table/browser/tableView", () => {
	test("layouts without rebuilding table DOM", async () => {
		const view = new TableView(createTableViewProps());
		document.body.append(view.element);

		try {
			const content = view.element.querySelector<HTMLElement>(".table_view_content");
			const table = view.element.querySelector<HTMLTableElement>(".table_view_grid");
			const cell = view.element.querySelector<HTMLTableCellElement>(".table_view_cell");
			assert.ok(content);
			assert.ok(table);
			assert.ok(cell);

			const records: MutationRecord[] = [];
			const observer = new MutationObserver((mutations) => {
				records.push(...mutations);
			});
			observer.observe(view.element, {
				childList: true,
				subtree: true,
			});

			view.layout();
			await timeout(120);
			observer.disconnect();

			assert.deepEqual(records, []);
			assert.equal(
				view.element.querySelector(".table_view_content"),
				content,
			);
			assert.equal(
				view.element.querySelector(".table_view_grid"),
				table,
			);
			assert.equal(
				view.element.querySelector(".table_view_cell"),
				cell,
			);
		} finally {
			view.dispose();
		}
	});
});

function createTableViewProps(): TableViewProps {
	const tableModel = createTableModel();
	const tableState = createTableState();

	return {
		tableModel,
		tableService: {
			select: () => true,
		},
		tableState,
		zoomPercent: tableState.zoomPercent,
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
		zoomPercent: 100,
	};
}

function createTableModel(): TableModel {
	return {
		cancelPendingRowRequests: () => undefined,
		clearHighlight: () => undefined,
		clearSelection: () => false,
		clearState: () => undefined,
		disposeFileCache: () => undefined,
		ensureCells: async () => undefined,
		ensureRows: async () => undefined,
		getHighlight: (): TableHighlight => ({}),
		getRevealCell: () => null,
		getRow: rowIndex => [
			`A${rowIndex + 1}`,
			`B${rowIndex + 1}`,
			`C${rowIndex + 1}`,
		],
		getRowsVersion: () => 1,
		getSelection: (): TableSelection => ({}),
		getState: createTableState,
		hasSourceFile: fileId => fileId === "file-a",
		highlightColumns: () => undefined,
		invalidateRequests: () => undefined,
		onDidChangeSelection: () => noopDisposable,
		onDidChangeState: () => noopDisposable,
		resetWorker: () => undefined,
		resetZoom: () => false,
		revealCell: () => undefined,
		selectAllColumns: () => false,
		setSelection: () => undefined,
		setZoomPercent: () => false,
		subscribeRowsVersion: () => noopDisposable,
		zoomIn: () => false,
		zoomOut: () => false,
	};
}

const noopDisposable = (): void => undefined;

function timeout(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
