/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
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

	test("opens the selected prepared URI import after pending source replacement", () => {
		const preparedEntry = createExplorerFileEntry({
			fileId: "file-b",
			itemKey: "source-b",
			resource: URI.file("/workspace/transfer/3.csv"),
		});
		const result = resolveExplorerImportOpenEntry({
			files: [preparedEntry],
			importedEntries: [preparedEntry],
			selectedResource: preparedEntry.resource ?? null,
			selectedSheetId: preparedEntry.sheetId ?? null,
		});

		assert.deepStrictEqual({
			resource: result.entry?.resource?.toString(),
			shouldSelect: result.shouldSelect,
		}, {
			resource: preparedEntry.resource?.toString(),
			shouldSelect: false,
		});
	});

	test("selects and opens the first import when there is no valid current selection", () => {
		const preparedEntry = createExplorerFileEntry({
			fileId: "file-b",
			itemKey: "source-b",
			resource: URI.file("/workspace/transfer/3.csv"),
		});
		const result = resolveExplorerImportOpenEntry({
			files: [preparedEntry],
			importedEntries: [preparedEntry],
			selectedResource: URI.file("/workspace/missing.csv"),
			selectedSheetId: null,
		});

		assert.deepStrictEqual({
			resource: result.entry?.resource?.toString(),
			shouldSelect: result.shouldSelect,
		}, {
			resource: preparedEntry.resource?.toString(),
			shouldSelect: true,
		});
	});

	test("forces table selection handoff when import starts outside the table pane", () => {
		const preparedEntry = createExplorerFileEntry({
			fileId: "file-b",
			itemKey: "source-b",
			resource: URI.file("/workspace/transfer/3.csv"),
		});
		const result = resolveExplorerImportOpenEntry({
			files: [preparedEntry],
			importedEntries: [preparedEntry],
			selectedResource: preparedEntry.resource ?? null,
			selectedSheetId: preparedEntry.sheetId ?? null,
		});

		assert.equal(result.shouldSelect, false);
		assert.equal(shouldSelectExplorerImportTableTarget(result, "chart"), true);
		assert.equal(shouldSelectExplorerImportTableTarget(result, "table"), false);
	});
});

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
