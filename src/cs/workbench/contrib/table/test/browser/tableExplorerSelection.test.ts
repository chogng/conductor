/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	ViewContainerLocation,
} from "src/cs/workbench/common/views";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import { TableExplorerSelectionContribution } from "src/cs/workbench/contrib/table/browser/tableExplorerSelection";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import type { ITableService, TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	IViewContainerNavigationState,
	IViewsService,
} from "src/cs/workbench/services/views/common/viewsService";

suite("workbench/contrib/table/browser/tableExplorerSelection", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("opens the selected Explorer resource through Table owner API", () => {
		const resourceA = URI.file("/workspace/a.csv");
		const resourceB = URI.file("/workspace/book.xlsx");
		const explorerService = store.add(new ExplorerService());
		explorerService.replaceFiles([
			{ fileId: "a", fileName: "A.csv", resource: resourceA },
			{
				fileId: "b",
				fileName: "Book.xlsx",
				resource: resourceB,
				sheetId: "sheet-b",
				sourcePath: resourceB.fsPath,
			},
		]);
		const opened: Array<TableSource | null> = [];
		const navigation = store.add(new Emitter<IViewContainerNavigationState>());
		let activePanel = TableViewContainerId;
		const contribution = store.add(new TableExplorerSelectionContribution(
			explorerService,
			{
				open: (source: TableSource | null) => opened.push(source),
			} as unknown as ITableService,
			{
				onDidChangeViewContainerNavigation: navigation.event,
				getViewContainerNavigationState: (location: ViewContainerLocation) =>
					createNavigationState(location, activePanel),
			} as unknown as IViewsService,
		));

		assert.deepEqual(toComparableSource(opened.at(-1)), {
			resource: resourceA.toString(),
			sheetId: null,
		});

		explorerService.setImportingSources(true);
		explorerService.select(resourceB, "force", "sheet-b");
		assert.equal(opened.length, 1);

		explorerService.setImportingSources(false);
		assert.deepEqual(toComparableSource(opened.at(-1)), {
			resource: resourceB.toString(),
			sheetId: "sheet-b",
		});

		activePanel = ChartViewContainerId;
		navigation.fire(createNavigationState(ViewContainerLocation.Panel, activePanel));
		const openCountInChart = opened.length;
		explorerService.select(resourceA);
		assert.equal(opened.length, openCountInChart);

		activePanel = TableViewContainerId;
		navigation.fire(createNavigationState(ViewContainerLocation.Panel, activePanel));
		assert.equal(opened.at(-1)?.resource.toString(), resourceA.toString());

		explorerService.select(null);
		assert.equal(opened.at(-1), null);
		contribution.dispose();
	});
});

function toComparableSource(source: TableSource | null | undefined): object | null {
	return source
		? {
			resource: source.resource.toString(),
			sheetId: source.sheetId ?? null,
		}
		: null;
}

function createNavigationState(
	location: ViewContainerLocation,
	activeViewContainerId: string,
): IViewContainerNavigationState {
	return {
		activeViewContainerId,
		historyIndex: 0,
		historyLength: 1,
		location,
	};
}
