import assert from "assert";

import {
	TableWidget,
	type TableWidgetColumnResizeEvent,
	type TableWidgetColumnResizeMode,
} from "src/cs/base/browser/ui/table/table";
import { VirtualTableGridModel } from "src/cs/base/browser/ui/table/virtualTable";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/table/tableWidget", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("commits column resize once by default", () => {
		const { events, listener, widget } = createResizableTableWidget();
		try {
			dispatchColumnResizeStart(widget, 208);
			dispatchColumnResizeMove(widget, 228);
			dispatchColumnResizeMove(widget, 248);
			dispatchColumnResizeMove(widget, 268);

			assert.deepEqual(events, []);

			dispatchColumnResizeEnd(widget, 268);

			assert.deepEqual(events, [{ colIndex: 0, width: 220 }]);
		} finally {
			listener.dispose();
			widget.dispose();
		}
	});

	test("can emit live column resize events", () => {
		const { events, listener, widget } = createResizableTableWidget("live");
		try {
			dispatchColumnResizeStart(widget, 208);
			dispatchColumnResizeMove(widget, 228);
			dispatchColumnResizeMove(widget, 248);
			dispatchColumnResizeMove(widget, 268);
			dispatchColumnResizeEnd(widget, 268);

			assert.deepEqual(events, [
				{ colIndex: 0, width: 180 },
				{ colIndex: 0, width: 200 },
				{ colIndex: 0, width: 220 },
			]);
		} finally {
			listener.dispose();
			widget.dispose();
		}
	});

	test("deduplicates body cells visited through logical ranges", () => {
		const { listener, widget } = createResizableTableWidget();
		try {
			const cells: string[] = [];
			const count = widget.forEachBodyCellInRanges([
				{ startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
				{ startRow: 1, endRow: 3, startCol: 1, endCol: 2 },
			], (_cell, descriptor) => {
				cells.push(`${descriptor.rowIndex}:${descriptor.colIndex}`);
			});

			assert.equal(count, cells.length);
			assert.deepEqual(cells, [
				"0:0",
				"0:1",
				"1:0",
				"1:1",
				"2:0",
				"2:1",
				"1:2",
				"2:2",
				"3:1",
				"3:2",
			]);
		} finally {
			listener.dispose();
			widget.dispose();
		}
	});

	test("resolves changed selection ranges without repainting unchanged interiors", () => {
		assert.deepEqual(VirtualTableGridModel.getChangedCellRanges([
			{ startRow: 0, endRow: 4, startCol: 0, endCol: 4 },
		], [
			{ startRow: 0, endRow: 4, startCol: 0, endCol: 4 },
		]), []);

		const changed = VirtualTableGridModel.getChangedCellRanges([
			{ startRow: 0, endRow: 4, startCol: 0, endCol: 0 },
		], [
			{ startRow: 0, endRow: 4, startCol: 0, endCol: 1 },
		]);
		const cells = expandCells(changed);

		assert.ok(cells.has("0:1"));
		assert.ok(cells.has("2:0"));
		assert.ok(cells.has("4:1"));
		assert.ok(cells.size < 25);
	});
});

function createResizableTableWidget(mode?: TableWidgetColumnResizeMode): {
	readonly events: TableWidgetColumnResizeEvent[];
	readonly listener: { dispose(): void };
	readonly widget: TableWidget;
} {
	const widget = new TableWidget({
		columnResize: { enabled: true, mode },
		getColumnWidth: () => 160,
		renderer: {
			renderBodyCell: (cell, descriptor) => {
				cell.textContent = `${descriptor.colIndex}:${descriptor.rowIndex}`;
			},
			renderColumnHeader: (cell, descriptor) => {
				cell.textContent = String(descriptor.colIndex);
			},
			renderRowHeader: (cell, descriptor) => {
				cell.textContent = String(descriptor.rowIndex);
			},
		},
	});
	document.body.append(widget.element);
	const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
	assert.ok(viewport);
	setElementClientSize(viewport, 500, 280);
	const body = widget.element.querySelector<HTMLElement>(".table_view_body");
	assert.ok(body);
	body.getBoundingClientRect = () => new DOMRect(0, 0, 800, 320);
	widget.attachContent();
	widget.render({ columnCount: 5, rowCount: 20 });

	const events: TableWidgetColumnResizeEvent[] = [];
	const listener = widget.onDidResizeColumn(event => events.push(event));
	return { events, listener, widget };
}

function setElementClientSize(element: HTMLElement, width: number, height: number): void {
	Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
	Object.defineProperty(element, "clientHeight", { configurable: true, value: height });
}

function dispatchColumnResizeStart(widget: TableWidget, clientX: number): void {
	const header = widget.element.querySelector<HTMLElement>(".table_view_grid_header_content");
	assert.ok(header);
	header.dispatchEvent(createPointerEvent(widget, "pointerdown", clientX, 1));
}

function dispatchColumnResizeMove(widget: TableWidget, clientX: number): void {
	const targetWindow = widget.element.ownerDocument.defaultView;
	assert.ok(targetWindow);
	targetWindow.dispatchEvent(createPointerEvent(widget, "pointermove", clientX, 1));
}

function dispatchColumnResizeEnd(widget: TableWidget, clientX: number): void {
	const targetWindow = widget.element.ownerDocument.defaultView;
	assert.ok(targetWindow);
	targetWindow.dispatchEvent(createPointerEvent(widget, "pointerup", clientX, 0));
}

function createPointerEvent(
	widget: TableWidget,
	type: string,
	clientX: number,
	buttons: number,
): PointerEvent {
	const targetWindow = widget.element.ownerDocument.defaultView;
	assert.ok(targetWindow);
	return new targetWindow.PointerEvent(type, {
		bubbles: true,
		button: 0,
		buttons,
		cancelable: true,
		clientX,
		clientY: 16,
		isPrimary: true,
		pointerId: 1,
		pointerType: "mouse",
	});
}

function expandCells(ranges: readonly { readonly startRow: number; readonly endRow: number; readonly startCol: number; readonly endCol: number }[]): Set<string> {
	const cells = new Set<string>();
	for (const range of ranges) {
		for (let row = range.startRow; row <= range.endRow; row += 1) {
			for (let col = range.startCol; col <= range.endCol; col += 1) {
				cells.add(`${row}:${col}`);
			}
		}
	}
	return cells;
}
