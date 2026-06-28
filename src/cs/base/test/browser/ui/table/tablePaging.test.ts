import assert from "assert";

import { DeferredPromise } from "src/cs/base/common/async";
import { PagedModel, type IPager } from "src/cs/base/common/paging";
import {
	TableWidget,
} from "src/cs/base/browser/ui/table/tableWidget";
import { PagedTableWidgetRenderer } from "src/cs/base/browser/ui/table/tablePaging";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/table/tablePaging", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("renders placeholders until paged rows resolve", async () => {
		const secondPage = new DeferredPromise<readonly string[]>();
		const pager: IPager<string> = {
			firstPage: ["row 0"],
			getPage: pageIndex => {
				assert.equal(pageIndex, 1);
				return secondPage.p;
			},
			pageSize: 1,
			total: 2,
		};
		const renderer = new PagedTableWidgetRenderer(new PagedModel(pager), {
			renderBodyCellContent: (content, descriptor) => {
				content.textContent = `${descriptor.row}:${descriptor.colIndex}`;
			},
			renderBodyCellPlaceholder: (content, descriptor) => {
				content.textContent = `loading:${descriptor.rowIndex}:${descriptor.colIndex}`;
			},
			renderColumnHeader: (cell, descriptor) => {
				cell.textContent = String(descriptor.colIndex);
			},
			renderRowHeader: (cell, descriptor) => {
				cell.textContent = String(descriptor.rowIndex);
			},
		});
		const widget = new TableWidget({
			getColumnWidth: () => 120,
			renderer,
		});
		document.body.append(widget.element);

		try {
			const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
			assert.ok(viewport);
			setElementClientSize(viewport, 400, 80);
			widget.attachContent();
			widget.render({ columnCount: 1, rowCount: 2 });

			assert.equal(widget.getBodyCellElement(0, 0)?.textContent, "row 0:0");
			assert.equal(widget.getBodyCellElement(1, 0)?.textContent, "loading:1:0");

			secondPage.complete(["row 1"]);
			await waitFor(() =>
				widget.getBodyCellElement(1, 0)?.textContent === "row 1:0",
			);

			assert.equal(widget.getBodyCellElement(1, 0)?.textContent, "row 1:0");
		} finally {
			widget.dispose();
			renderer.dispose();
		}
	});
});

function setElementClientSize(element: HTMLElement, width: number, height: number): void {
	Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
	Object.defineProperty(element, "clientHeight", { configurable: true, value: height });
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (predicate()) {
			return;
		}

		await new Promise(resolve => setTimeout(resolve, 0));
	}

	assert.equal(predicate(), true);
}
