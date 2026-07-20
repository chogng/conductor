import assert from "assert";

import type {
	IManagedHover,
	IManagedHoverContent,
	IManagedHoverContentOrFactory,
	IManagedHoverOptions,
} from "src/cs/base/browser/ui/hover/hover";
import {
	getBaseLayerHoverDelegate,
	setBaseLayerHoverDelegate,
	type IHoverDelegate,
} from "src/cs/base/browser/ui/hover/hoverDelegate";
import {
	TableWidget,
} from "src/cs/base/browser/ui/table/tableWidget";
import {
	type ITableCellEditOptions,
	type ITableColumnResizeBoundaryDoubleClickEvent,
	type ITableColumnResizeEvent,
	type ITableColumnResizeMode,
	type ITableKeyboardNavigationOptions,
} from "src/cs/base/browser/ui/table/table";
import { VirtualTableGridModel } from "src/cs/base/browser/ui/table/virtualTable";
import { KeyCode } from "src/cs/base/common/keyCodes";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type TestBodyTemplateData = {
	readonly cell: HTMLTableCellElement;
	readonly content: HTMLElement;
};

type TestTableWidget = TableWidget<TestBodyTemplateData, HTMLElement>;

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

	test("does not start column resize from button text nodes", () => {
		const { events, listener, widget } = createResizableTableWidget();
		try {
			const button = widget.element.querySelector<HTMLButtonElement>(".table_view_grid_header_cell button");
			const text = button?.firstChild;
			assert.ok(text);

			text.dispatchEvent(createPointerEvent(widget, "pointerdown", 208, 1));
			dispatchColumnResizeMove(widget, 248);
			dispatchColumnResizeEnd(widget, 248);

			assert.equal(widget.element.classList.contains("table_view--resizing_column"), false);
			assert.deepEqual(events, []);
		} finally {
			listener.dispose();
			widget.dispose();
		}
	});

	test("keeps cell editing disabled unless enabled by options", () => {
		const { listener, widget } = createResizableTableWidget();
		try {
			const cell = widget.getBodyCellElement(0, 0);
			assert.ok(cell);
			assert.equal(widget.startCellEdit(0, 0), false);
			cell.dispatchEvent(new MouseEvent("dblclick", {
				bubbles: true,
				cancelable: true,
			}));

			assert.equal(cell.querySelector(".table_view_cell_editor"), null);
		} finally {
			listener.dispose();
			widget.dispose();
		}
	});

	test("commits editable cell text as a raw base table event when enabled", () => {
		const commits: unknown[] = [];
		const { listener, widget } = createResizableTableWidget(undefined, {
			enabled: true,
			getInitialValue: cell => `raw:${cell.rowIndex}:${cell.colIndex}`,
		});
		const editListener = widget.onDidCommitCellEdit(event => commits.push(event));
		try {
			assert.equal(widget.startCellEdit(0, 0), true);
			const input = widget.getBodyCellElement(0, 0)?.querySelector<HTMLInputElement>(".table_view_cell_editor");
			assert.ok(input);
			assert.equal(input.value, "raw:0:0");

			input.value = "42";
			input.dispatchEvent(new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				key: "Enter",
			}));

			assert.deepEqual(commits, [{ rowIndex: 0, colIndex: 0, value: "42" }]);
			assert.equal(widget.getBodyCellElement(0, 0)?.querySelector(".table_view_cell_editor"), null);
		} finally {
			editListener.dispose();
			listener.dispose();
			widget.dispose();
		}
	});

	test("resolves body cell position from target and point", () => {
		const { listener, widget } = createResizableTableWidget();
		const originalElementFromPoint = document.elementFromPoint;
		try {
			const cell = widget.getBodyCellElement(2, 3);
			assert.ok(cell);
			const content = cell.querySelector(".table_view_cell_content");
			assert.ok(content);

			assert.deepEqual(widget.getBodyCellPositionFromTarget(content), { rowIndex: 2, colIndex: 3 });
			assert.equal(widget.getBodyCellPositionFromTarget(widget.element), null);

			Object.defineProperty(document, "elementFromPoint", {
				configurable: true,
				value: () => content,
			});

			assert.deepEqual(widget.getBodyCellPositionFromPoint(12, 34), { rowIndex: 2, colIndex: 3 });
			assert.equal(widget.getBodyCellPositionFromPoint(Number.NaN, 34), null);
		} finally {
			Object.defineProperty(document, "elementFromPoint", {
				configurable: true,
				value: originalElementFromPoint,
			});
			listener.dispose();
			widget.dispose();
		}
	});

	test("requests column and row selections from table headers", () => {
		const selectionRequests: unknown[] = [];
		const { listener, widget } = createResizableTableWidget();
		const selectionRequestListener = widget.onDidRequestSelection(event => {
			selectionRequests.push(event);
		});
		try {
			const headerCell = widget.getColumnHeaderCellElement(3);
			const rowHeaderCell = widget.element.querySelector<HTMLTableCellElement>(".table_view_row_header_cell");
			assert.ok(headerCell);
			assert.ok(rowHeaderCell);

			headerCell.dispatchEvent(new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
			}));
			rowHeaderCell.dispatchEvent(new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
			}));
			assert.deepEqual(selectionRequests, [
				{ reveal: false, selection: { kind: "columns", columns: [3] } },
				{
					reveal: false,
					selection: {
						kind: "range",
						anchorCell: { rowIndex: 0, colIndex: 0 },
						focusCell: { rowIndex: 0, colIndex: 4 },
						range: { startRow: 0, endRow: 0, startCol: 0, endCol: 4 },
					},
				},
			]);
		} finally {
			selectionRequestListener.dispose();
			listener.dispose();
			widget.dispose();
		}
	});

	test("does not request column selection from resize handles", () => {
		const selectionRequests: unknown[] = [];
		const { listener, widget } = createResizableTableWidget();
		const selectionRequestListener = widget.onDidRequestSelection(event => {
			selectionRequests.push(event);
		});
		try {
			const handle = widget.getColumnHeaderCellElement(0)?.querySelector(".table_view_column_resize_handle");
			assert.ok(handle);

			handle.dispatchEvent(new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
			}));

			assert.deepEqual(selectionRequests, []);
		} finally {
			selectionRequestListener.dispose();
			listener.dispose();
			widget.dispose();
		}
	});

	test("emits column resize boundary double-click events", () => {
		const { listener, widget } = createResizableTableWidget();
		const events: ITableColumnResizeBoundaryDoubleClickEvent[] = [];
		const autoFitListener = widget.onDidDoubleClickColumnResizeBoundary(event => {
			events.push(event);
		});
		try {
			dispatchColumnResizeBoundaryDoubleClick(widget, 208);

			assert.deepEqual(events, [{ colIndex: 0 }]);
		} finally {
			autoFitListener.dispose();
			listener.dispose();
			widget.dispose();
		}
	});

	test("requests selection for keyboard navigation and resolves body mouse event targets", () => {
		const selectionRequests: unknown[] = [];
		const { listener, widget } = createResizableTableWidget();
		const selectionRequestListener = widget.onDidRequestSelection(event => {
			selectionRequests.push(event);
		});
		try {
			widget.setCellState({
				activeCell: { rowIndex: 2, colIndex: 3 },
			});
			const down = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				code: "ArrowDown",
				key: "ArrowDown",
			});
			const leftExtend = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				code: "ArrowLeft",
				key: "ArrowLeft",
				shiftKey: true,
			});
			widget.element.dispatchEvent(down);
			widget.element.dispatchEvent(leftExtend);

			const bodyCell = widget.getBodyCellElement(2, 3);
			const bodyContent = bodyCell?.querySelector(".table_view_cell_content");
			assert.ok(bodyContent);

			assert.equal(down.defaultPrevented, true);
			assert.equal(leftExtend.defaultPrevented, true);
			assert.deepEqual(widget.getBodyCellPositionFromMouseEvent({
				clientX: Number.NaN,
				clientY: Number.NaN,
				target: bodyContent,
			}), { rowIndex: 2, colIndex: 3 });
			assert.deepEqual(selectionRequests, [
				{
					reveal: true,
					selection: {
						kind: "cell",
						cell: { rowIndex: 3, colIndex: 3 },
					},
				},
				{
					reveal: true,
					selection: {
						kind: "range",
						anchorCell: { rowIndex: 3, colIndex: 3 },
						focusCell: { rowIndex: 3, colIndex: 2 },
						range: {
							startRow: 3,
							endRow: 3,
							startCol: 2,
							endCol: 3,
						},
					},
				},
			]);
		} finally {
			selectionRequestListener.dispose();
			listener.dispose();
			widget.dispose();
		}
	});

	test("continues extended keyboard navigation from the internal range focus cell", () => {
		const selectionRequests: unknown[] = [];
		const { listener, widget } = createResizableTableWidget();
		const selectionRequestListener = widget.onDidRequestSelection(event => {
			selectionRequests.push(event);
		});
		try {
			widget.setCellState({
				activeCell: { rowIndex: 3, colIndex: 3 },
			});

			const firstLeftExtend = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				code: "ArrowLeft",
				key: "ArrowLeft",
				shiftKey: true,
			});
			widget.element.dispatchEvent(firstLeftExtend);

			widget.setCellState({
				activeCell: { rowIndex: 3, colIndex: 3 },
				selectedRanges: [{ startRow: 3, endRow: 3, startCol: 2, endCol: 3 }],
			});

			const secondLeftExtend = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				code: "ArrowLeft",
				key: "ArrowLeft",
				shiftKey: true,
			});
			widget.element.dispatchEvent(secondLeftExtend);

			assert.deepEqual(selectionRequests, [
				{
					reveal: true,
					selection: {
						kind: "range",
						anchorCell: { rowIndex: 3, colIndex: 3 },
						focusCell: { rowIndex: 3, colIndex: 2 },
						range: {
							startRow: 3,
							endRow: 3,
							startCol: 2,
							endCol: 3,
						},
					},
				},
				{
					reveal: true,
					selection: {
						kind: "range",
						anchorCell: { rowIndex: 3, colIndex: 3 },
						focusCell: { rowIndex: 3, colIndex: 1 },
						range: {
							startRow: 3,
							endRow: 3,
							startCol: 1,
							endCol: 3,
						},
					},
				},
			]);
		} finally {
			selectionRequestListener.dispose();
			listener.dispose();
			widget.dispose();
		}
	});

	test("renders body cell traits through the widget-owned trait state", () => {
		const { listener, widget } = createResizableTableWidget();
		try {
			const templateData = widget.getBodyCellTemplateData(0, 0);
			const cell = widget.getBodyCellElement(0, 0);
			assert.ok(templateData);
			assert.ok(cell);

			widget.setBodyCellTraits(templateData, {
				active: true,
				columnSelected: true,
				decoration: "",
				highlighted: false,
				selected: true,
				selectionFrame: {
					bottom: false,
					left: true,
					right: false,
					top: true,
				},
			});

			assert.equal(cell.dataset.active, "true");
			assert.equal(cell.classList.contains("column-selected"), true);
			assert.equal(cell.dataset.highlighted, "false");
			assert.equal(cell.classList.contains("selected"), true);
			assert.equal(cell.dataset.selectionFrame, "true");
			assert.equal(cell.style.getPropertyValue("--table-view-selection-frame-top"), "2px");
			assert.equal(cell.style.getPropertyValue("--table-view-selection-frame-right"), "0");
			assert.equal(cell.style.getPropertyValue("--table-view-selection-frame-bottom"), "0");
			assert.equal(cell.style.getPropertyValue("--table-view-selection-frame-left"), "2px");

			widget.setBodyCellTraits(templateData, {
				active: false,
				columnSelected: false,
				decoration: "",
				highlighted: false,
				selected: false,
				selectionFrame: {
					bottom: false,
					left: false,
					right: false,
					top: false,
				},
			});

			assert.equal(cell.dataset.active, "false");
			assert.equal(cell.classList.contains("column-selected"), false);
			assert.equal(cell.classList.contains("selected"), false);
			assert.equal(cell.dataset.selectionFrame, "false");
		} finally {
			listener.dispose();
			widget.dispose();
		}
	});

	test("manages body cell hover content through the base hover delegate", () => {
		const hoverDelegate = new TestHoverDelegate();
		const previousHoverDelegate = getBaseLayerHoverDelegate();
		setBaseLayerHoverDelegate(hoverDelegate);
		const { listener, widget } = createResizableTableWidget();
		try {
			const templateData = widget.getBodyCellTemplateData(0, 0);
			assert.ok(templateData);

			widget.setBodyCellHoverContent(templateData, "Before");
			assert.equal(hoverDelegate.hovers.length, 1);
			assert.equal(hoverDelegate.hovers[0]?.content, "Before");

			widget.setBodyCellHoverContent(templateData, "After");
			assert.equal(hoverDelegate.hovers.length, 1);
			assert.equal(hoverDelegate.hovers[0]?.content, "After");

			widget.setBodyCellHoverContent(templateData, undefined);
			assert.equal(hoverDelegate.hovers[0]?.disposed, true);
		} finally {
			setBaseLayerHoverDelegate(previousHoverDelegate);
			listener.dispose();
			widget.dispose();
		}
	});

	test("renders column header traits through the widget-owned trait state", () => {
		const { listener, widget } = createResizableTableWidget();
		try {
			const templateData = widget.getColumnHeaderTemplateData(0);
			const header = widget.getColumnHeaderCellElement(0);
			const button = header?.querySelector("button");
			assert.ok(templateData);
			assert.ok(header);
			assert.ok(button);

			widget.setColumnHeaderTraits(templateData, {
				columnSelected: true,
				highlighted: true,
				selected: true,
			});

			assert.equal(header.dataset.highlighted, "true");
			assert.equal(header.classList.contains("column-selected"), true);
			assert.equal(header.classList.contains("selected"), true);
			assert.equal(button.getAttribute("aria-pressed"), "true");

			widget.setColumnHeaderTraits(templateData, {
				columnSelected: false,
				highlighted: false,
				selected: false,
			});

			assert.equal(header.dataset.highlighted, "false");
			assert.equal(header.classList.contains("column-selected"), false);
			assert.equal(header.classList.contains("selected"), false);
			assert.equal(button.getAttribute("aria-pressed"), "false");
		} finally {
			listener.dispose();
			widget.dispose();
		}
	});

	test("applies table cell state through the base widget owner", () => {
		const { listener, widget } = createResizableTableWidget();
		try {
			widget.setCellState({
				activeCell: { rowIndex: 1, colIndex: 1 },
			});
			assert.equal(widget.getBodyCellElement(1, 1)?.dataset.active, "true");

			widget.setCellState({
				highlightedColumns: [3],
				selectedColumns: [2],
				selectedRanges: [{ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }],
			});
			assert.equal(widget.getBodyCellElement(1, 1)?.dataset.active, "false");
			assert.equal(widget.getBodyCellElement(1, 1)?.classList.contains("selected"), true);
			assert.equal(widget.getBodyCellElement(1, 1)?.classList.contains("column-selected"), false);
			assert.equal(widget.getBodyCellElement(0, 2)?.classList.contains("selected"), true);
			assert.equal(widget.getBodyCellElement(0, 2)?.classList.contains("column-selected"), true);
			assert.equal(widget.getBodyCellElement(0, 3)?.dataset.highlighted, "true");
			assert.equal(widget.getColumnHeaderCellElement(2)?.classList.contains("selected"), true);
			assert.equal(widget.getColumnHeaderCellElement(2)?.classList.contains("column-selected"), true);
			assert.equal(widget.getColumnHeaderCellElement(3)?.dataset.highlighted, "true");

			widget.setCellState({
				activeCell: { rowIndex: 1, colIndex: 1 },
			});
			assert.equal(widget.getBodyCellElement(0, 2)?.classList.contains("selected"), false);
			assert.equal(widget.getBodyCellElement(0, 2)?.classList.contains("column-selected"), false);
			assert.equal(widget.getColumnHeaderCellElement(2)?.classList.contains("selected"), false);
			assert.equal(widget.getColumnHeaderCellElement(2)?.classList.contains("column-selected"), false);
		} finally {
			listener.dispose();
			widget.dispose();
		}
	});

	test("tracks hovered body cell as widget-owned trait state", () => {
		const { listener, widget } = createResizableTableWidget();
		try {
			const first = widget.getBodyCellElement(0, 0);
			const second = widget.getBodyCellElement(0, 1);
			assert.ok(first);
			assert.ok(second);

			first.dispatchEvent(createPointerEvent(widget, "pointermove", 16, 0));
			assert.equal(first.dataset.hovered, "true");

			second.dispatchEvent(createPointerEvent(widget, "pointermove", 176, 0));
			assert.equal(first.dataset.hovered, "false");
			assert.equal(second.dataset.hovered, "true");

			widget.render({ columnCount: 5, rowCount: 20, renderVersion: "hover-reset" });
			assert.equal(second.dataset.hovered, "false");
		} finally {
			listener.dispose();
			widget.dispose();
		}
	});

	test("tracks hovered column header as widget-owned trait state", () => {
		const { listener, widget } = createResizableTableWidget();
		try {
			const first = widget.getColumnHeaderCellElement(0);
			const second = widget.getColumnHeaderCellElement(1);
			assert.ok(first);
			assert.ok(second);

			first.dispatchEvent(createPointerEvent(widget, "pointermove", 64, 0));
			assert.equal(first.dataset.hovered, "true");

			second.dispatchEvent(createPointerEvent(widget, "pointermove", 224, 0));
			assert.equal(first.dataset.hovered, "false");
			assert.equal(second.dataset.hovered, "true");

			widget.render({ columnCount: 5, rowCount: 20, headerRenderVersion: "hover-reset" });
			assert.equal(second.dataset.hovered, "false");
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

	test("rerenders body content without rebinding unchanged body cells", () => {
		const bodyRenders: string[] = [];
		const contentRenders: string[] = [];
		const headerRenders: string[] = [];
			const widget = new TableWidget<TestBodyTemplateData, HTMLElement>({
			getColumnWidth: () => 160,
			renderer: {
				clearBodyCell: templateData => {
					templateData.content.textContent = "";
				},
				disposeBodyCellTemplate: () => undefined,
				renderBodyCell: (templateData, descriptor) => {
					bodyRenders.push(`${descriptor.rowIndex}:${descriptor.colIndex}`);
					templateData.cell.dataset.boundCell = `${descriptor.rowIndex}:${descriptor.colIndex}`;
				},
				renderBodyCellContent: (templateData, descriptor) => {
					contentRenders.push(`${descriptor.rowIndex}:${descriptor.colIndex}`);
					templateData.content.textContent = `v:${descriptor.rowIndex}:${descriptor.colIndex}`;
				},
				renderBodyCellTemplate: (cell, content) => ({ cell, content }),
				renderColumnHeader: (cell, descriptor) => {
					headerRenders.push(String(descriptor.colIndex));
					cell.textContent = String(descriptor.colIndex);
				},
				renderColumnHeaderTemplate: cell => cell,
				renderRowHeader: (cell, descriptor) => {
					cell.textContent = String(descriptor.rowIndex);
				},
			},
		});
		document.body.append(widget.element);
		try {
			const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
			assert.ok(viewport);
			setElementClientSize(viewport, 500, 280);
			widget.attachContent();
			widget.render({ columnCount: 5, rowCount: 20, renderVersion: "a" });
			const bodyRenderCount = bodyRenders.length;
			const contentRenderCount = contentRenders.length;
			const headerRenderCount = headerRenders.length;
			const cell = widget.getBodyCellElement(0, 0);
			assert.ok(cell);
			assert.equal(cell.dataset.boundCell, "0:0");
			assert.equal(cell.textContent, "v:0:0");

			widget.render({ columnCount: 5, rowCount: 20, renderVersion: "b" });

			assert.equal(widget.getBodyCellElement(0, 0), cell);
			assert.equal(bodyRenders.length, bodyRenderCount);
			assert.equal(headerRenders.length, headerRenderCount);
			assert.ok(contentRenders.length > contentRenderCount);
			assert.equal(cell.dataset.boundCell, "0:0");
			assert.equal(cell.textContent, "v:0:0");
		} finally {
			widget.dispose();
		}
	});

	test("reuses cached body row templates when rendered row count grows again", () => {
		let createdTemplateCount = 0;
		const widget = new TableWidget<{
			readonly cell: HTMLTableCellElement;
			readonly content: HTMLElement;
			readonly id: number;
		}, HTMLElement>({
			getColumnWidth: () => 160,
			maxRenderedColumns: 2,
			maxRenderedRows: 8,
			renderer: {
				clearBodyCell: templateData => {
					templateData.content.textContent = "";
				},
				disposeBodyCellTemplate: () => undefined,
				renderBodyCell: () => undefined,
				renderBodyCellContent: (templateData, descriptor) => {
					templateData.content.textContent = `${descriptor.rowIndex}:${descriptor.colIndex}`;
				},
				renderBodyCellTemplate: (cell, content) => {
					createdTemplateCount += 1;
					return { cell, content, id: createdTemplateCount };
				},
				renderColumnHeader: (cell, descriptor) => {
					cell.textContent = String(descriptor.colIndex);
				},
				renderColumnHeaderTemplate: cell => cell,
				renderRowHeader: (cell, descriptor) => {
					cell.textContent = String(descriptor.rowIndex);
				},
			},
		});
		document.body.append(widget.element);
		try {
			const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
			assert.ok(viewport);
			setElementClientSize(viewport, 500, 280);
			widget.attachContent();
			widget.render({ columnCount: 2, rowCount: 8, renderVersion: "a" });
			const firstVisibleTemplate = widget.getBodyCellTemplateData(0, 0);
			const initialTemplates = new Set(
				Array.from({ length: 8 }, (_, rowOffset) => widget.getBodyCellTemplateData(rowOffset, 0)),
			);
			assert.equal(createdTemplateCount, 16);
			assert.equal(initialTemplates.size, 8);

			widget.render({ columnCount: 2, rowCount: 2, renderVersion: "b" });
			widget.render({ columnCount: 2, rowCount: 8, renderVersion: "c" });

			const returnedTemplate = widget.getBodyCellTemplateData(2, 0);
			assert.equal(widget.getBodyCellTemplateData(0, 0), firstVisibleTemplate);
			assert.ok(returnedTemplate);
			assert.equal(initialTemplates.has(returnedTemplate), true);
			assert.equal(createdTemplateCount, 16);
		} finally {
			widget.dispose();
		}
	});

	test("patches dirty body cells and column headers through the base table patch path", () => {
		const bodyContentRenders: string[] = [];
		const headerRenders: string[] = [];
		const widget = new TableWidget<TestBodyTemplateData, HTMLElement>({
			getColumnWidth: () => 160,
			renderer: {
				clearBodyCell: templateData => {
					templateData.content.textContent = "";
				},
				disposeBodyCellTemplate: () => undefined,
				renderBodyCell: () => undefined,
				renderBodyCellContent: (_templateData, descriptor) => {
					bodyContentRenders.push(`${descriptor.rowIndex}:${descriptor.colIndex}`);
				},
				renderBodyCellTemplate: (cell, content) => ({ cell, content }),
				renderColumnHeader: (cell, descriptor) => {
					headerRenders.push(String(descriptor.colIndex));
					cell.textContent = String(descriptor.colIndex);
				},
				renderColumnHeaderTemplate: cell => cell,
				renderRowHeader: (cell, descriptor) => {
					cell.textContent = String(descriptor.rowIndex);
				},
			},
		});
		document.body.append(widget.element);
		try {
			const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
			assert.ok(viewport);
			setElementClientSize(viewport, 500, 280);
			widget.attachContent();
			widget.render({ columnCount: 5, rowCount: 20, headerRenderVersion: "a" });
			const bodyRenderCount = bodyContentRenders.length;
			const headerRenderCount = headerRenders.length;

			const patched = widget.patchDirtyCells({
				bodyRenderVersion: "b",
				columnHeaderRenderVersion: "b",
				includeColumnHeaders: true,
				ranges: [{ startRow: 1, endRow: 3, startCol: 1, endCol: 3 }],
			});

			assert.equal(patched.outcome, "patched");
			assert.equal(patched.body, "patched");
			assert.equal(patched.columnHeaders, "patched");
			assert.deepEqual(headerRenders.slice(headerRenderCount), ["1", "2"]);
			assert.deepEqual(bodyContentRenders.slice(bodyRenderCount), ["1:1", "1:2", "2:1", "2:2"]);

			const ignored = widget.patchDirtyCells({
				bodyRenderVersion: "c",
				columnHeaderRenderVersion: "c",
				includeColumnHeaders: true,
				ranges: [{ startCol: 20, endCol: 21 }],
			});
			assert.deepEqual(ignored, {
				body: "ignored",
				columnHeaders: "ignored",
				outcome: "ignored",
			});

			assert.deepEqual(widget.patchDirtyCells({
				bodyRenderVersion: "d",
				full: true,
				ranges: [{ startCol: 1, endCol: 2 }],
			}), {
				body: "ignored",
				columnHeaders: "ignored",
				outcome: "full",
			});
		} finally {
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

function createResizableTableWidget(
	mode?: ITableColumnResizeMode,
	cellEditing?: ITableCellEditOptions,
	keyboardNavigation?: ITableKeyboardNavigationOptions,
	): {
		readonly events: ITableColumnResizeEvent[];
		readonly listener: { dispose(): void };
		readonly widget: TestTableWidget;
	} {
	const widget = new TableWidget<TestBodyTemplateData, HTMLElement>({
		cellEditing,
		columnResize: { enabled: true, mode },
		getColumnWidth: () => 160,
		keyboardNavigation,
		renderer: {
			clearBodyCell: templateData => {
				templateData.content.textContent = "";
			},
			disposeBodyCellTemplate: () => undefined,
			renderBodyCell: () => undefined,
			renderBodyCellContent: (templateData, descriptor) => {
				templateData.content.textContent = `${descriptor.colIndex}:${descriptor.rowIndex}`;
			},
			renderBodyCellTemplate: (cell, content) => ({ cell, content }),
			renderColumnHeader: (cell, descriptor) => {
				const button = document.createElement("button");
				button.type = "button";
				button.textContent = String(descriptor.colIndex);
				cell.replaceChildren(button, widget.createColumnResizeHandle());
			},
			renderColumnHeaderTemplate: cell => cell,
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

	const events: ITableColumnResizeEvent[] = [];
	const listener = widget.onDidResizeColumn(event => events.push(event));
	return { events, listener, widget };
}

function setElementClientSize(element: HTMLElement, width: number, height: number): void {
	Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
	Object.defineProperty(element, "clientHeight", { configurable: true, value: height });
}

function dispatchColumnResizeStart(widget: TestTableWidget, clientX: number): void {
	const header = widget.element.querySelector<HTMLElement>(".table_view_grid_header_content");
	assert.ok(header);
	header.dispatchEvent(createPointerEvent(widget, "pointerdown", clientX, 1));
}

function dispatchColumnResizeMove(widget: TestTableWidget, clientX: number): void {
	const targetWindow = widget.element.ownerDocument.defaultView;
	assert.ok(targetWindow);
	targetWindow.dispatchEvent(createPointerEvent(widget, "pointermove", clientX, 1));
}

function dispatchColumnResizeEnd(widget: TestTableWidget, clientX: number): void {
	const targetWindow = widget.element.ownerDocument.defaultView;
	assert.ok(targetWindow);
	targetWindow.dispatchEvent(createPointerEvent(widget, "pointerup", clientX, 0));
}

function dispatchColumnResizeBoundaryDoubleClick(widget: TestTableWidget, clientX: number): void {
	const header = widget.element.querySelector<HTMLElement>(".table_view_grid_header_content");
	assert.ok(header);
	header.dispatchEvent(new MouseEvent("dblclick", {
		bubbles: true,
		button: 0,
		cancelable: true,
		clientX,
		clientY: 16,
	}));
}

function createPointerEvent(
	widget: TestTableWidget,
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

class TestHoverDelegate implements IHoverDelegate {
	public readonly hovers: TestManagedHover[] = [];

	public setupManagedHover(
		target: HTMLElement,
		content: IManagedHoverContentOrFactory,
		_options?: IManagedHoverOptions,
	): IManagedHover {
		const hover = new TestManagedHover(target, content);
		this.hovers.push(hover);
		return hover;
	}
}

class TestManagedHover implements IManagedHover {
	public disposed = false;

	public constructor(
		public readonly target: HTMLElement,
		public content: IManagedHoverContentOrFactory,
	) {}

	public show(): void {}

	public hide(): void {}

	public update(content: IManagedHoverContent): void {
		this.content = content;
	}

	public dispose(): void {
		this.disposed = true;
	}
}
