/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import "src/cs/workbench/contrib/table/browser/media/tableView.css";

suite("base/browser/workbench table column selection style", () => {
	test("frames column-selected header and body cells", () => {
		const root = document.createElement("div");
		root.className = "table_view";
		root.style.setProperty("--accent", "0 0 0");
		root.innerHTML = `
			<div class="table_view_grid_header_content">
				<div class="table_view_grid_header_corner"></div>
				<div class="table_view_grid_header_cell selected column-selected"></div>
			</div>
			<table class="table_view_grid">
				<tbody>
					<tr class="table_view_virtual_spacer"></tr>
					<tr><td class="table_view_cell selected column-selected"></td></tr>
					<tr><td class="table_view_cell selected column-selected"></td></tr>
					<tr class="table_view_virtual_spacer"></tr>
				</tbody>
			</table>
		`;
		document.body.append(root);

		try {
			const header = root.querySelector<HTMLElement>(".table_view_grid_header_cell");
			const cells = root.querySelectorAll<HTMLElement>("td.column-selected");
			const firstCell = cells.item(0);
			const lastCell = cells.item(1);
			assert.ok(header);
			assert.ok(firstCell);
			assert.ok(lastCell);

			const headerFrame = getComputedStyle(header, "::after");
			const firstCellFrame = getComputedStyle(firstCell, "::after");
			const lastCellFrame = getComputedStyle(lastCell, "::after");
			assert.deepEqual({
				header: [
					headerFrame.borderTopWidth,
					headerFrame.borderRightWidth,
					headerFrame.borderBottomWidth,
					headerFrame.borderLeftWidth,
				],
				firstCell: [
					firstCellFrame.borderTopWidth,
					firstCellFrame.borderRightWidth,
					firstCellFrame.borderBottomWidth,
					firstCellFrame.borderLeftWidth,
				],
				lastCellBottom: lastCellFrame.borderBottomWidth,
			}, {
				header: ["2px", "2px", "0px", "2px"],
				firstCell: ["0px", "2px", "0px", "2px"],
				lastCellBottom: "2px",
			});
		} finally {
			root.remove();
		}
	});
});
