/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	FileChangeType,
	FileType,
	type IFileChange,
	type IFileService,
} from "src/cs/platform/files/common/files";
import type { IFileConverterBackendService } from "src/cs/workbench/services/files/common/fileConverterBackend";
import { TableFileEditorModelManager } from "src/cs/workbench/services/table/browser/tableFileEditorModelManager";
import { TableModelResolverService } from "src/cs/workbench/services/table/browser/tableModelResolverService";
import type { ITableModelContentProvider } from "src/cs/workbench/services/table/common/resolverService";

suite("workbench/services/table/test/browser/tableModel", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("creates a URI-backed model reference from the file service", async () => {
		const resource = URI.file("/workspace/data/transfer.csv");
		const service = store.add(new TableModelResolverService(createFileServiceStub({
			readFile: async () => ({ encoding: "utf8", value: "Vg,Id\n0,1" }),
			stat: async () => ({
				ctime: 1,
				mtime: 42,
				path: resource.path,
				size: 10,
				type: FileType.File,
			}),
		}), createFileConverterBackendStub()));

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
	});

	test("reuses the cached model for repeated references", async () => {
		let readCount = 0;
		const resource = URI.file("/workspace/data/reuse.tsv");
		const service = store.add(new TableModelResolverService(createFileServiceStub({
			readFile: async () => {
				readCount += 1;
				return { encoding: "utf8", value: "A\tB\n1\t2" };
			},
		}), createFileConverterBackendStub()));

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
		}), createFileConverterBackendStub()));

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
			createFileConverterBackendStub(),
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
		}), createFileConverterBackendStub()));
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
		}), createFileConverterBackendStub()));
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
		}), createFileConverterBackendStub()));
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
		}), createFileConverterBackendStub()));
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
		}), createFileConverterBackendStub()));
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
		}), createFileConverterBackendStub()));
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
			createFileConverterBackendStub(),
		));

		assert.equal(service.canHandleResource(URI.file("/workspace/readme.md")), false);
	});

	test("rejects unsupported resources at the resolver boundary", async () => {
		const service = store.add(new TableModelResolverService(
			createFileServiceStub(),
			createFileConverterBackendStub(),
		));

		await assert.rejects(
			() => service.createModelReference(URI.file("/workspace/readme.md")),
			/Unsupported table file/,
		);
	});

	test("creates sheet snapshots for Excel resources through the converter backend", async () => {
		const resource = URI.file("/workspace/data/workbook.xlsx");
		const service = store.add(new TableModelResolverService(createFileServiceStub({
			readFile: async () => ({ encoding: "base64", value: "AA==" }),
			stat: async () => ({
				ctime: 1,
				mtime: 42,
				path: resource.path,
				size: 10,
				type: FileType.File,
			}),
		}), createFileConverterBackendStub({
			canPrepareFile: () => true,
			prepareFile: async () => ({
				sheets: [{
					csvText: "Vg,Id\n0,1",
					sheetIndex: 0,
					sheetName: "Forward",
				}, {
					csvText: "Vd,Id\n1,2",
					sheetIndex: 1,
					sheetName: "Reverse",
				}],
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
			sheetId: "0:Forward",
			sheetName: "Forward",
			sourceKey: `${resource.toString()}::0%3AForward`,
		}, {
			columnCount: 2,
			rowCount: 2,
			sheetId: "1:Reverse",
			sheetName: "Reverse",
			sourceKey: `${resource.toString()}::1%3AReverse`,
		}]);
		assert.equal(
			service.getPreviewInput({ resource, sheetId: "1:Reverse" })?.sheetName,
			"Reverse",
		);
	});
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

const createFileConverterBackendStub = (
	overrides: Partial<IFileConverterBackendService> = {},
): IFileConverterBackendService => ({
	_serviceBrand: undefined,
	canPrepareFile: () => false,
	canReadConvertedCsv: () => false,
	prepareFile: async () => ({ ok: false }),
	readConvertedCsv: async () => ({ ok: false }),
	...overrides,
} as IFileConverterBackendService);
