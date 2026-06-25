/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import JSZip from "jszip";
import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	FileChangeType,
	FileType,
	type IFileChange,
	type IFileService,
} from "src/cs/platform/files/common/files";
import { TableFileEditorModelManager } from "src/cs/workbench/services/tablefile/common/tableFileEditorModelManager";
import { TableModelResolverService } from "src/cs/workbench/services/tablemodeResolver/common/tableModelResolverService";
import {
	TableModel,
	TableModelRange,
	TableModelSelection,
	TableModelSelectionDirection,
	type TableModelDecorationsChangedEvent,
} from "src/cs/workbench/services/table/common/model";
import type { ITableModelContentProvider } from "src/cs/workbench/services/table/common/resolverService";

suite("workbench/services/table/test/browser/tableModel", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("exposes core content, version, range, and selection helpers", async () => {
		const resource = URI.file("/workspace/data/core.csv");
		const model = store.add(new TableModel(resource, resource.toString()));
		const contentEvents: { readonly sourceVersion: number; readonly version: number }[] = [];
		store.add(model.onDidChangeContent(event => {
			contentEvents.push({
				sourceVersion: event.sourceVersion,
				version: event.version,
			});
		}));

		await model.resolve({
			resolveContent: async () => ({
				content: {
					columnCount: 3,
					maxCellLengths: [1, 1, 1],
					rowCount: 2,
					rows: [["A", "B", "C"], ["1", "2", "3"]],
				},
				previewInput: null,
				sourceVersion: 12,
			}),
		});

		const validatedRange = model.validateRange(new TableModelRange(0, 1, 5, 5));
		const validatedSelection = model.validateSelection(new TableModelSelection(5, 5, 0, 1));

		assert.deepStrictEqual({
			cell: model.getCellValue(1, 2),
			contentEvents,
			fullRange: toRangeLiteral(model.getFullModelRange()),
			range: toRangeLiteral(validatedRange),
			rows: model.getValueInRange(new TableModelRange(0, 1, 2, 3)),
			selection: {
				direction: validatedSelection.getDirection(),
				position: toPositionLiteral(validatedSelection.getPosition()),
				range: toRangeLiteral(validatedSelection),
				start: toPositionLiteral(validatedSelection.getSelectionStart()),
			},
			sourceVersion: model.getSourceVersionId(),
			version: model.getVersionId(),
		}, {
			cell: "3",
			contentEvents: [{
				sourceVersion: 12,
				version: 1,
			}],
			fullRange: {
				endColumnIndexExclusive: 3,
				endRowIndexExclusive: 2,
				startColumnIndex: 0,
				startRowIndex: 0,
			},
			range: {
				endColumnIndexExclusive: 3,
				endRowIndexExclusive: 2,
				startColumnIndex: 1,
				startRowIndex: 0,
			},
			rows: [["B", "C"], ["2", "3"]],
			selection: {
				direction: TableModelSelectionDirection.BottomRightToTopLeft,
				position: {
					columnIndex: 1,
					rowIndex: 0,
				},
				range: {
					endColumnIndexExclusive: 3,
					endRowIndexExclusive: 2,
					startColumnIndex: 1,
					startRowIndex: 0,
				},
				start: {
					columnIndex: 2,
					rowIndex: 1,
				},
			},
			sourceVersion: 12,
			version: 1,
		});
	});

	test("tracks table model decorations through owner-scoped deltas", async () => {
		const resource = URI.file("/workspace/data/decorations.csv");
		const model = store.add(new TableModel(resource, resource.toString()));
		await model.resolve({
			resolveContent: async () => ({
				content: {
					columnCount: 3,
					maxCellLengths: [1, 1, 1],
					rowCount: 2,
					rows: [["A", "B", "C"], ["1", "2", "3"]],
				},
				previewInput: null,
				sourceVersion: 12,
			}),
		});
		const decorationEvents: TableModelDecorationsChangedEvent[] = [];
		store.add(model.onDidChangeDecorations(event => {
			decorationEvents.push(event);
		}));

		const firstIds = model.deltaDecorations([], [{
			options: {
				className: "table-cell-warning",
				description: "warning",
				zIndex: 2,
			},
			range: new TableModelRange(0, 0, 1, 1),
		}], 7);
		const secondIds = model.changeDecorations(accessor => {
			accessor.changeDecoration(firstIds[0]!, new TableModelRange(0, 1, 2, 3));
			accessor.changeDecorationOptions(firstIds[0]!, {
				className: "table-cell-info",
				description: "info",
				zIndex: 1,
			});
			return accessor.deltaDecorations([], [{
				options: {
					description: "row",
					isWholeRow: true,
					zIndex: 3,
				},
				range: new TableModelRange(1, 0, 2, 3),
			}]);
		}, 7) ?? [];
		const wrongOwnerResult = model.deltaDecorations(firstIds, [], 8);
		const decorationsBeforeRemove = model.getAllDecorations(7).map(decoration => ({
			description: decoration.options.description,
			id: decoration.id,
			range: toRangeLiteral(decoration.range),
		}));
		const intersectingDecorationIds = model
			.getDecorationsInRange(new TableModelRange(1, 2, 2, 3), 7)
			.map(decoration => decoration.id);
		model.removeAllDecorationsWithOwnerId(7);

		assert.deepStrictEqual({
			afterRemove: model.getAllDecorations(7),
			decorationsBeforeRemove,
			eventCount: decorationEvents.length,
			intersectingDecorationIds,
			secondIds,
			wrongOwnerResult,
		}, {
			afterRemove: [],
			decorationsBeforeRemove: [{
				description: "info",
				id: firstIds[0],
				range: {
					endColumnIndexExclusive: 3,
					endRowIndexExclusive: 2,
					startColumnIndex: 1,
					startRowIndex: 0,
				},
			}, {
				description: "row",
				id: secondIds[0],
				range: {
					endColumnIndexExclusive: 3,
					endRowIndexExclusive: 2,
					startColumnIndex: 0,
					startRowIndex: 1,
				},
			}],
			eventCount: 3,
			intersectingDecorationIds: [firstIds[0], secondIds[0]],
			secondIds,
			wrongOwnerResult: [],
		});
	});

	test("creates a URI-backed model reference from the file service", async () => {
		const resource = URI.file("/workspace/data/transfer.csv");
		let readEncoding: unknown = null;
		const service = store.add(new TableModelResolverService(createFileServiceStub({
			readFile: async (_resource, options) => {
				readEncoding = options?.encoding;
				return { encoding: "utf8", value: "Vg,Id\n0,1" };
			},
			stat: async () => ({
				ctime: 1,
				mtime: 42,
				path: resource.path,
				size: 10,
				type: FileType.File,
			}),
		})));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		assert.deepStrictEqual(reference.object.getSnapshot(), {
			content: {
				columnCount: 2,
				maxCellLengths: [2, 2],
				rowCount: 2,
				rows: [["Vg", "Id"], ["0", "1"]],
			},
			format: "csv",
			loadState: {
				message: "",
				state: "ready",
			},
			resource,
			previewInput: {
				file: reference.object.getSnapshot().previewInput?.file,
				columnCount: 2,
				fileName: "transfer.csv",
				maxCellLengths: [2, 2],
				relativePath: "transfer.csv",
				resource,
				rowCount: 2,
				sourcePath: resource.fsPath,
				sourceVersion: 42,
				tableModelContent: {
					columnCount: 2,
					maxCellLengths: [2, 2],
					rowCount: 2,
					rows: [["Vg", "Id"], ["0", "1"]],
				},
			},
			sheets: [{
				content: {
					columnCount: 2,
					maxCellLengths: [2, 2],
					rowCount: 2,
					rows: [["Vg", "Id"], ["0", "1"]],
				},
				sheetId: resource.toString(),
				sheetName: null,
				sourceKey: resource.toString(),
			}],
			sourceKey: resource.toString(),
			sourceVersion: 42,
			version: 1,
		});
		assert.equal(readEncoding, "utf8");
	});

	test("reuses the cached model for repeated references", async () => {
		let readCount = 0;
		const resource = URI.file("/workspace/data/reuse.tsv");
		const service = store.add(new TableModelResolverService(createFileServiceStub({
			readFile: async () => {
				readCount += 1;
				return { encoding: "utf8", value: "A\tB\n1\t2" };
			},
		})));

		const first = await service.createModelReference(resource);
		const second = await service.createModelReference(resource);
		store.add(first);
		store.add(second);

		assert.deepStrictEqual({
			canHandle: service.canHandleResource(resource),
			isSameModel: first.object === second.object,
			readCount,
			sourceKey: first.object.sourceKey,
		}, {
			canHandle: true,
			isSameModel: true,
			readCount: 1,
			sourceKey: resource.toString(),
		});
	});

	test("releases file-backed model cache after the last reference is disposed", async () => {
		let readCount = 0;
		const resource = URI.file("/workspace/data/release.csv");
		const service = store.add(new TableModelResolverService(createFileServiceStub({
			readFile: async () => {
				readCount += 1;
				return { encoding: "utf8", value: "A,B\n1,2" };
			},
		})));

		const reference = await service.createModelReference(resource);
		assert.equal(service.get(resource), reference.object);
		reference.dispose();

		assert.equal(service.get(resource), undefined);
		const nextReference = await service.createModelReference(resource);
		nextReference.dispose();

		assert.deepStrictEqual({
			hasModel: service.get(resource) !== undefined,
			readCount,
		}, {
			hasModel: false,
			readCount: 2,
		});
	});

	test("resolves provider-backed virtual table resources", async () => {
		let disposeCount = 0;
		let resolveCount = 0;
		const resource = URI.from({
			path: "/generated/report",
			scheme: "table-memory",
		});
		const service = store.add(new TableModelResolverService(
			createFileServiceStub(),
		));
		const registration = service.registerContentProvider({
			canHandleResource: candidate => candidate.scheme === "table-memory",
			dispose: () => {
				disposeCount += 1;
			},
			resolveTableModel: async () => {
				resolveCount += 1;
				return {
					content: {
						columnCount: 2,
						maxCellLengths: [4, 5],
						rowCount: 2,
						rows: [["Name", "Value"], ["A", "1"]],
					},
					format: "csv",
					sourceVersion: 7,
				};
			},
		} satisfies ITableModelContentProvider);

		const reference = await service.createModelReference(resource);

		assert.deepStrictEqual({
			canHandle: service.canHandleResource(resource),
			content: reference.object.getSnapshot().content,
			isCached: service.get(resource) === reference.object,
			resolveCount,
			sourceKey: reference.object.sourceKey,
			sourceVersion: reference.object.getSnapshot().sourceVersion,
		}, {
			canHandle: true,
			content: {
				columnCount: 2,
				maxCellLengths: [4, 5],
				rowCount: 2,
				rows: [["Name", "Value"], ["A", "1"]],
			},
			isCached: true,
			resolveCount: 1,
			sourceKey: resource.toString(),
			sourceVersion: 7,
		});

		reference.dispose();
		assert.equal(service.get(resource), undefined);
		registration.dispose();
		assert.equal(disposeCount, 1);
	});

	test("reloads file-backed models with a new source version", async () => {
		let text = "A,B\n1,2";
		let mtime = 10;
		const resource = URI.file("/workspace/data/reload.csv");
		const manager = store.add(new TableFileEditorModelManager(createFileServiceStub({
			readFile: async () => ({ encoding: "utf8", value: text }),
			stat: async () => ({
				ctime: 1,
				mtime,
				path: resource.path,
				size: text.length,
				type: FileType.File,
			}),
		})));
		const fileEditorModel = manager.getOrCreateFileEditorModel(resource);

		await manager.resolveModel(fileEditorModel);
		text = "A,B\n3,4\n5,6";
		mtime = 20;
		await manager.reload(resource);

		assert.deepStrictEqual({
			rows: fileEditorModel.model.getSnapshot().content?.rows,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
			version: fileEditorModel.model.getSnapshot().version,
			workbenchSourceVersion: fileEditorModel.getSourceVersion(),
		}, {
			rows: [["A", "B"], ["3", "4"], ["5", "6"]],
			sourceVersion: 20,
			version: 2,
			workbenchSourceVersion: 20,
		});
	});

	test("reloads file-backed models after file change events", async () => {
		let text = "A,B\n1,2";
		let mtime = 10;
		const fileChanges = store.add(new Emitter<readonly IFileChange[]>());
		const resource = URI.file("/workspace/data/watch.csv");
		const manager = store.add(new TableFileEditorModelManager(createFileServiceStub({
			onDidFilesChange: fileChanges.event,
			readFile: async () => ({ encoding: "utf8", value: text }),
			stat: async () => ({
				ctime: 1,
				mtime,
				path: resource.path,
				size: text.length,
				type: FileType.File,
			}),
		})));
		const fileEditorModel = manager.getOrCreateFileEditorModel(resource);

		await manager.resolveModel(fileEditorModel);
		const didReload = new Promise<void>(resolve => {
			let listener: { dispose(): void } | undefined;
			listener = manager.onDidChangeModel(model => {
				const snapshot = model.getSnapshot();
				if (snapshot.loadState.state === "ready" && snapshot.sourceVersion === 20) {
					listener?.dispose();
					resolve();
				}
			});
		});

		text = "A,B\n7,8";
		mtime = 20;
		fileChanges.fire([{ resource, type: FileChangeType.UPDATED }]);
		await didReload;

		assert.deepStrictEqual({
			rows: fileEditorModel.model.getSnapshot().content?.rows,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
		}, {
			rows: [["A", "B"], ["7", "8"]],
			sourceVersion: 20,
		});
	});

	test("marks dirty file-backed models conflicted on external updates", async () => {
		let text = "A,B\n1,2";
		let mtime = 10;
		const fileChanges = store.add(new Emitter<readonly IFileChange[]>());
		const resource = URI.file("/workspace/data/conflict.csv");
		const manager = store.add(new TableFileEditorModelManager(createFileServiceStub({
			onDidFilesChange: fileChanges.event,
			readFile: async () => ({ encoding: "utf8", value: text }),
			stat: async () => ({
				ctime: 1,
				mtime,
				path: resource.path,
				size: text.length,
				type: FileType.File,
			}),
		})));
		const fileEditorModel = manager.getOrCreateFileEditorModel(resource);

		await manager.resolveModel(fileEditorModel);
		fileEditorModel.markDirty("A,B\n9,9");
		text = "A,B\n7,8";
		mtime = 20;
		fileChanges.fire([{ resource, type: FileChangeType.UPDATED }]);

		assert.deepStrictEqual({
			conflict: fileEditorModel.getSnapshot().conflict,
			dirty: fileEditorModel.getSnapshot().dirty,
			rows: fileEditorModel.model.getSnapshot().content?.rows,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
		}, {
			conflict: true,
			dirty: true,
			rows: [["A", "B"], ["1", "2"]],
			sourceVersion: 10,
		});
	});

	test("saves dirty file-backed models and refreshes source version", async () => {
		let text = "A,B\n1,2";
		let mtime = 10;
		let writtenContent = "";
		const resource = URI.file("/workspace/data/save.csv");
		const manager = store.add(new TableFileEditorModelManager(createFileServiceStub({
			readFile: async () => ({ encoding: "utf8", value: text }),
			stat: async () => ({
				ctime: 1,
				mtime,
				path: resource.path,
				size: text.length,
				type: FileType.File,
			}),
			writeFile: async (_resource, content) => {
				writtenContent = content;
				text = content;
				mtime = 30;
			},
		})));
		const fileEditorModel = manager.getOrCreateFileEditorModel(resource);

		await manager.resolveModel(fileEditorModel);
		fileEditorModel.markDirty("A,B\n9,9");
		await fileEditorModel.save();

		assert.deepStrictEqual({
			conflict: fileEditorModel.getSnapshot().conflict,
			dirty: fileEditorModel.getSnapshot().dirty,
			rows: fileEditorModel.model.getSnapshot().content?.rows,
			saving: fileEditorModel.getSnapshot().saving,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
			writtenContent,
		}, {
			conflict: false,
			dirty: false,
			rows: [["A", "B"], ["9", "9"]],
			saving: false,
			sourceVersion: 30,
			writtenContent: "A,B\n9,9",
		});
	});

	test("reverts dirty file-backed models from disk", async () => {
		let text = "A,B\n1,2";
		let mtime = 10;
		const resource = URI.file("/workspace/data/revert.csv");
		const manager = store.add(new TableFileEditorModelManager(createFileServiceStub({
			readFile: async () => ({ encoding: "utf8", value: text }),
			stat: async () => ({
				ctime: 1,
				mtime,
				path: resource.path,
				size: text.length,
				type: FileType.File,
			}),
		})));
		const fileEditorModel = manager.getOrCreateFileEditorModel(resource);

		await manager.resolveModel(fileEditorModel);
		fileEditorModel.markDirty("A,B\n9,9");
		text = "A,B\n3,4";
		mtime = 20;
		await fileEditorModel.revert();

		assert.deepStrictEqual({
			conflict: fileEditorModel.getSnapshot().conflict,
			dirty: fileEditorModel.getSnapshot().dirty,
			rows: fileEditorModel.model.getSnapshot().content?.rows,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
		}, {
			conflict: false,
			dirty: false,
			rows: [["A", "B"], ["3", "4"]],
			sourceVersion: 20,
		});
	});

	test("tracks orphan state from file delete and add events", async () => {
		let text = "A,B\n1,2";
		let mtime = 10;
		const fileChanges = store.add(new Emitter<readonly IFileChange[]>());
		const resource = URI.file("/workspace/data/orphan.csv");
		const manager = store.add(new TableFileEditorModelManager(createFileServiceStub({
			onDidFilesChange: fileChanges.event,
			readFile: async () => ({ encoding: "utf8", value: text }),
			stat: async () => ({
				ctime: 1,
				mtime,
				path: resource.path,
				size: text.length,
				type: FileType.File,
			}),
		})));
		const fileEditorModel = manager.getOrCreateFileEditorModel(resource);

		await manager.resolveModel(fileEditorModel);
		fileChanges.fire([{ resource, type: FileChangeType.DELETED }]);
		assert.equal(fileEditorModel.getSnapshot().orphaned, true);

		const didReload = new Promise<void>(resolve => {
			let listener: { dispose(): void } | undefined;
			listener = manager.onDidChangeModel(model => {
				const snapshot = model.getSnapshot();
				if (snapshot.loadState.state === "ready" && snapshot.sourceVersion === 20) {
					listener?.dispose();
					resolve();
				}
			});
		});
		text = "A,B\n5,6";
		mtime = 20;
		fileChanges.fire([{ resource, type: FileChangeType.ADDED }]);
		await didReload;

		assert.deepStrictEqual({
			orphaned: fileEditorModel.getSnapshot().orphaned,
			rows: fileEditorModel.model.getSnapshot().content?.rows,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
		}, {
			orphaned: false,
			rows: [["A", "B"], ["5", "6"]],
			sourceVersion: 20,
		});
	});

	test("keeps unsupported resources out of the table model support set", () => {
		const service = store.add(new TableModelResolverService(
			createFileServiceStub(),
		));

		assert.equal(service.canHandleResource(URI.file("/workspace/readme.md")), false);
	});

	test("rejects unsupported resources at the resolver boundary", async () => {
		const service = store.add(new TableModelResolverService(
			createFileServiceStub(),
		));

		await assert.rejects(
			() => service.createModelReference(URI.file("/workspace/readme.md")),
			/Unsupported table file/,
		);
	});

	test("creates sheet snapshots for xlsx resources without the import converter", async () => {
		const resource = URI.file("/workspace/data/workbook.xlsx");
		let readEncoding: unknown = null;
		const workbookBase64 = await createXlsxBase64([{
			name: "Forward",
			rows: [["Vg", "Id"], ["0", "1"]],
		}, {
			name: "Reverse",
			rows: [["Vd", "Id"], ["1", "2"]],
		}]);
		const service = store.add(new TableModelResolverService(createFileServiceStub({
			readFile: async (_resource, options) => {
				readEncoding = options?.encoding;
				return { encoding: "base64", value: workbookBase64 };
			},
			stat: async () => ({
				ctime: 1,
				mtime: 42,
				path: resource.path,
				size: 10,
				type: FileType.File,
			}),
		})));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		assert.deepStrictEqual(reference.object.getSnapshot().sheets.map(sheet => ({
			columnCount: sheet.content?.columnCount,
			rowCount: sheet.content?.rowCount,
			sheetId: sheet.sheetId,
			sheetName: sheet.sheetName,
			sourceKey: sheet.sourceKey,
		})), [{
			columnCount: 2,
			rowCount: 2,
			sheetId: "1:Forward",
			sheetName: "Forward",
			sourceKey: `${resource.toString()}::1%3AForward`,
		}, {
			columnCount: 2,
			rowCount: 2,
			sheetId: "2:Reverse",
			sheetName: "Reverse",
			sourceKey: `${resource.toString()}::2%3AReverse`,
		}]);
		assert.equal(
			service.getPreviewInput({ resource, sheetId: "2:Reverse" })?.sheetName,
			"Reverse",
		);
		assert.equal(readEncoding, "base64");
	});
});

const toRangeLiteral = (range: TableModelRange): {
	readonly endColumnIndexExclusive: number;
	readonly endRowIndexExclusive: number;
	readonly startColumnIndex: number;
	readonly startRowIndex: number;
} => ({
	endColumnIndexExclusive: range.endColumnIndexExclusive,
	endRowIndexExclusive: range.endRowIndexExclusive,
	startColumnIndex: range.startColumnIndex,
	startRowIndex: range.startRowIndex,
});

const toPositionLiteral = (position: {
	readonly columnIndex: number;
	readonly rowIndex: number;
}): {
	readonly columnIndex: number;
	readonly rowIndex: number;
} => ({
	columnIndex: position.columnIndex,
	rowIndex: position.rowIndex,
});

const createFileServiceStub = (
	overrides: Partial<IFileService> = {},
): IFileService => ({
	_serviceBrand: undefined,
	deleteFile: async () => undefined,
	exists: async () => true,
	getProvider: () => undefined,
	moveFileToTrash: async () => undefined,
	onDidFilesChange: Event.None,
	readDir: async () => [],
	readFile: async () => ({ encoding: "utf8", value: "A,B\n1,2" }),
	realpath: async resource => resource,
	registerProvider: () => ({ dispose: () => undefined }),
	stat: async resource => ({
		ctime: 1,
		mtime: 2,
		path: resource.path,
		size: 7,
		type: FileType.File,
	}),
	watch: () => ({ dispose: () => undefined }),
	writeFile: async () => undefined,
	...overrides,
} as IFileService);

const createXlsxBase64 = async (
	sheets: readonly { readonly name: string; readonly rows: readonly (readonly string[])[] }[],
): Promise<string> => {
	const zip = new JSZip();
	zip.file("xl/workbook.xml", [
		'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
		"<sheets>",
		...sheets.map((sheet, index) =>
			`<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
		),
		"</sheets>",
		"</workbook>",
	].join(""));
	zip.file("xl/_rels/workbook.xml.rels", [
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
		...sheets.map((_, index) =>
			`<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
		),
		"</Relationships>",
	].join(""));
	for (let index = 0; index < sheets.length; index += 1) {
		zip.file(`xl/worksheets/sheet${index + 1}.xml`, createXlsxSheetXml(sheets[index]!.rows));
	}
	const buffer = await zip.generateAsync({ type: "arraybuffer" });
	return arrayBufferToBase64(buffer);
};

const createXlsxSheetXml = (
	rows: readonly (readonly string[])[],
): string => [
	'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
	"<sheetData>",
	...rows.map((row, rowIndex) => [
		`<row r="${rowIndex + 1}">`,
		...row.map((value, columnIndex) =>
			`<c r="${getCellReference(rowIndex, columnIndex)}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
		),
		"</row>",
	].join("")),
	"</sheetData>",
	"</worksheet>",
].join("");

const getCellReference = (rowIndex: number, columnIndex: number): string =>
	`${getColumnLabel(columnIndex)}${rowIndex + 1}`;

const getColumnLabel = (columnIndex: number): string => {
	let value = columnIndex + 1;
	let label = "";
	while (value > 0) {
		const remainder = (value - 1) % 26;
		label = String.fromCharCode(65 + remainder) + label;
		value = Math.floor((value - 1) / 26);
	}
	return label;
};

const escapeXml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
	let binary = "";
	for (const byte of new Uint8Array(buffer)) {
		binary += String.fromCharCode(byte);
	}
	return globalThis.btoa(binary);
};
