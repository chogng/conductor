/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
	ExplorerViewPane,
	resolveExplorerSourceReplaceRemovedFileIds,
	resolveExplorerImportOpenEntry,
	shouldSelectExplorerImportTableTarget,
} from "src/cs/workbench/contrib/files/browser/explorerViewlet";

suite("workbench/contrib/files/browser/explorerViewlet", () => {
	test("resolves source replacement removals without treating fileId as source identity", () => {
		const removedFileIds = resolveExplorerSourceReplaceRemovedFileIds({
			previousFiles: [
				{
					fileId: "old-a",
					fileName: "old-a.csv",
					itemKey: "source-a-v1",
					resource: URI.file("/workspace/a.csv"),
				},
				{
					fileId: "old-b",
					fileName: "old-b.csv",
					itemKey: "source-old-b",
					resource: URI.file("/workspace/b.csv"),
				},
			],
			nextFiles: [
				{
					fileId: "new-a",
					fileName: "new-a.csv",
					itemKey: "source-a-v2",
					resource: URI.file("/workspace/a.csv"),
				},
			],
		});

		assert.deepStrictEqual(removedFileIds, ["old-b"]);
	});

	test("opens the selected URI import after pending source replacement", () => {
		const resourceEntry = createExplorerFileEntry({
			fileId: "file-b",
			itemKey: "source-b",
			resource: URI.file("/workspace/transfer/3.csv"),
		});
		const result = resolveExplorerImportOpenEntry({
			files: [resourceEntry],
			importedEntries: [resourceEntry],
			selectedResource: resourceEntry.resource ?? null,
			selectedSheetId: resourceEntry.sheetId ?? null,
		});

		assert.deepStrictEqual({
			resource: result.entry?.resource?.toString(),
			shouldSelect: result.shouldSelect,
		}, {
			resource: resourceEntry.resource?.toString(),
			shouldSelect: false,
		});
	});

	test("selects and opens the first import when there is no valid current selection", () => {
		const resourceEntry = createExplorerFileEntry({
			fileId: "file-b",
			itemKey: "source-b",
			resource: URI.file("/workspace/transfer/3.csv"),
		});
		const result = resolveExplorerImportOpenEntry({
			files: [resourceEntry],
			importedEntries: [resourceEntry],
			selectedResource: URI.file("/workspace/missing.csv"),
			selectedSheetId: null,
		});

		assert.deepStrictEqual({
			resource: result.entry?.resource?.toString(),
			shouldSelect: result.shouldSelect,
		}, {
			resource: resourceEntry.resource?.toString(),
			shouldSelect: true,
		});
	});

	test("forces table selection handoff when import starts outside the table pane", () => {
		const resourceEntry = createExplorerFileEntry({
			fileId: "file-b",
			itemKey: "source-b",
			resource: URI.file("/workspace/transfer/3.csv"),
		});
		const result = resolveExplorerImportOpenEntry({
			files: [resourceEntry],
			importedEntries: [resourceEntry],
			selectedResource: resourceEntry.resource ?? null,
			selectedSheetId: resourceEntry.sheetId ?? null,
		});

		assert.equal(result.shouldSelect, false);
		assert.equal(shouldSelectExplorerImportTableTarget(result, "chart"), true);
		assert.equal(shouldSelectExplorerImportTableTarget(result, "table"), false);
	});

	test("starts every review immediately when append targets committed Explorer rows", () => {
		const resources = [
			URI.file("/workspace/transfer/3.csv"),
			URI.file("/workspace/transfer/4.csv"),
		];
		const existingEntries = resources.map((resource, index) => createExplorerFileEntry({
			fileId: `file-existing-${index}`,
			itemKey: `source-existing-${index}`,
			resource,
		}));
		const reviewTargets: Array<{ readonly resource: URI; readonly sheetId?: string | null }> = [];
		let didSync = false;
		const pane = Object.create(ExplorerViewPane.prototype) as ExplorerViewPaneImportHarness & Record<string, unknown>;
		Object.assign(pane, {
			explorerService: {
				appendFiles: () => [],
				files: existingEntries,
				selectedResource: null,
				selectedSheetId: null,
			},
			input: {
				mode: "table",
				selectedResource: null,
				selectedSheetId: null,
				selectionKind: "table",
			},
			removePendingSourceFiles: () => undefined,
			reviewService: {
				resolveReviewSummary: (target: { readonly resource: URI; readonly sheetId?: string | null }) => {
					reviewTargets.push(target);
					return Promise.resolve(null);
				},
			},
			syncView: () => {
				didSync = true;
			},
		});
		const entries: ExplorerFileEntry[] = resources.map((resource, index) => ({
			file: new File(["A,B\n1,2"], `${index + 3}.csv`, {
				lastModified: 1,
				type: "text/csv",
			}),
			fileId: `file-existing-${index}`,
			fileName: `${index + 3}.csv`,
			itemKey: `source-existing-${index}`,
			localImport: true,
			relativePath: `transfer/${index + 3}.csv`,
			resource,
			sourcePath: resource.fsPath,
		}));

		pane.appendExplorerFiles(entries);

		assert.equal(didSync, true);
		assert.deepStrictEqual(reviewTargets.map(target => ({
			resource: target.resource.toString(),
			sheetId: target.sheetId ?? null,
		})), resources.map(resource => ({
			resource: resource.toString(),
			sheetId: null,
		})));
	});

	test("reads Slice owner state when rendering chart thumbnails", () => {
		const queuedResource = URI.file("/workspace/queued.csv");
		const readyResource = URI.file("/workspace/ready.csv");
		const noneResource = URI.file("/workspace/none.csv");
		const files: ExplorerFileEntry[] = [
			createExplorerFileEntry({
				fileId: "queued",
				itemKey: "queued",
				resource: queuedResource,
			}),
			createExplorerFileEntry({
				fileId: "ready",
				itemKey: "ready",
				resource: readyResource,
			}),
			createExplorerFileEntry({
				fileId: "none",
				itemKey: "none",
				resource: noneResource,
			}),
		];
		const pane = Object.create(ExplorerViewPane.prototype) as ExplorerViewPaneVisibleEntriesHarness & Record<string, unknown>;
		Object.assign(pane, {
			explorerService: {
				files,
				viewLayout: "thumbnail",
			},
			surfaceViewLayout: "thumbnail",
			input: {
				mode: "chart",
				selectedResource: null,
				selectedSheetId: null,
				selectionKind: "chart",
			},
			pendingSourceEntries: [],
			replaceItemKeys: null,
			sliceService: {
				getResourceResult: (resource: URI) => resource.toString() === readyResource.toString()
					? { resource: readyResource, sheetId: null }
					: null,
				getResourceState: (resource: URI) => resource.toString() === queuedResource.toString()
					? { state: "queued" }
					: undefined,
			},
		});

		const visibleEntries = pane.visibleEntries;

		assert.deepStrictEqual(visibleEntries.map(entry => ({
			fileId: entry.fileId,
			chartState: entry.chartState,
			hasChartData: entry.hasChartData,
		})), [{
			fileId: "queued",
			chartState: "queued",
			hasChartData: false,
		}, {
			fileId: "ready",
			chartState: "ready",
			hasChartData: true,
		}]);
	});
});

type ExplorerViewPaneImportHarness = {
	appendExplorerFiles(entries: readonly ExplorerFileEntry[]): void;
};

type ExplorerViewPaneVisibleEntriesHarness = {
	readonly visibleEntries: readonly ExplorerFileEntry[];
};

function createExplorerFileEntry({
	fileId,
	itemKey,
	resource,
}: {
	readonly fileId: string;
	readonly itemKey: string;
	readonly resource: URI;
}): ExplorerFileEntry {
	return {
		file: new File(["A,B\n1,2"], "3.csv", {
			lastModified: 1,
			type: "text/csv",
		}),
		fileId,
		fileName: "3.csv",
		itemKey,
		localImport: true,
		relativePath: "transfer/3.csv",
		resource,
		sourcePath: resource.fsPath,
	};
}
