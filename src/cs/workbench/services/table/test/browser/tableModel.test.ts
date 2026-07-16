/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { createZipBuffer, type ZipEntry } from "src/cs/base/common/zip";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	FileChangeType,
	FileSystemProviderCapabilities,
	FileType,
	type IFileChange,
	type IFileService,
} from "src/cs/platform/files/common/files";
import { DataResourceContentService } from "src/cs/workbench/services/dataResource/browser/dataResourceContentService";
import { DataResourceContentMemoryGate } from "src/cs/workbench/services/dataResource/browser/dataResourceContentMemoryGate";
import type { IDataResourceContentProvider } from "src/cs/workbench/services/dataResource/common/dataResourceContentService";
import { TableFileService } from "src/cs/workbench/services/tableFile/browser/tableFileService";
import { TableFileEditorModelManager } from "src/cs/workbench/services/tableFile/common/tableFileEditorModelManager";
import { TableModelResolverService } from "src/cs/workbench/services/table/common/tableModelResolverService";
import {
	readTableModelContentRows,
	TableModel,
	TableModelRange,
	TableModelSelection,
	TableModelSelectionDirection,
	type TableModelDecorationsChangedEvent,
} from "src/cs/workbench/services/table/common/model";
import { PARSED_TABLE_ROW_WINDOW_SIZE, parseTableStructure } from "src/cs/workbench/services/table/common/tableStructureParser";
import type { ITableStructureParserService } from "src/cs/workbench/services/table/common/tableStructureParserService";

const directTableStructureParserService: ITableStructureParserService = {
	_serviceBrand: undefined,
	dispose: () => undefined,
	parse: parseTableStructure,
};

suite("workbench/services/table/test/browser/tableModel", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const createResolverFixture = (
		fileService: IFileService = createFileServiceStub(),
		memoryGate?: DataResourceContentMemoryGate,
	) => {
		const tableFileService = store.add(new TableFileService(
			fileService,
			directTableStructureParserService,
		));
		const contentService = store.add(new DataResourceContentService(
			tableFileService,
			memoryGate,
		));
		return {
			contentService,
			service: store.add(new TableModelResolverService(contentService, tableFileService)),
		};
	};
	const createResolverService = (fileService: IFileService = createFileServiceStub()) =>
		createResolverFixture(fileService).service;

	test("takes format from resolved content instead of inferring it on construction", async () => {
		const resource = URI.file("/workspace/data/core.csv");
		const model = store.add(new TableModel(resource));

		assert.equal(model.getSnapshot().format, null);

		await model.resolve({
			resolveContent: async () => ({
				content: null,
				format: "csv",
				resource,
				sourceVersion: 12,
			}),
		});

		assert.equal(model.getSnapshot().format, "csv");
	});

	test("exposes core content, version, range, and selection helpers", async () => {
		const resource = URI.file("/workspace/data/core.csv");
		const model = store.add(new TableModel(resource));
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
				format: "csv",
				resource,
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

	test("reads model cells and ranges from content row windows", async () => {
		const resource = URI.file("/workspace/data/windowed.csv");
		const model = store.add(new TableModel(resource));

		await model.resolve({
			resolveContent: async () => ({
				content: {
					columnCount: 3,
					maxCellLengths: [1, 1, 1],
					rowCount: 4,
					rows: [],
					rowWindows: [{
						startRowIndex: 1,
						rows: [
							["1", "2", "3"],
							["4", "5", "6"],
						],
					}],
				},
				format: "csv",
				resource,
				sourceVersion: 12,
			}),
		});

		assert.equal(model.getCellValue(2, 1), "5");
		assert.deepStrictEqual(model.getRows(1, 3), [
			["1", "2", "3"],
			["4", "5", "6"],
		]);
		assert.deepStrictEqual(model.getValueInRange(new TableModelRange(1, 1, 3, 3)), [
			["2", "3"],
			["5", "6"],
		]);
		assert.deepStrictEqual(model.getRows(0, 2), []);
	});

	test("rejects resolved content for a different resource", async () => {
		const resource = URI.file("/workspace/data/core.csv");
		const model = store.add(new TableModel(resource));

		await model.resolve({
			resolveContent: async () => ({
				content: null,
				format: "csv",
				resource: URI.file("/workspace/data/other.csv"),
				sourceVersion: 12,
			}),
		});

		assert.equal(model.getSnapshot().loadState.state, "error");
		assert.equal(model.getSnapshot().content, null);
		assert.equal(model.getSnapshot().diagnostics[0]?.code, "table.resolve.failed");
	});

	test("tracks table model decorations through owner-scoped deltas", async () => {
		const resource = URI.file("/workspace/data/decorations.csv");
		const model = store.add(new TableModel(resource));
		await model.resolve({
			resolveContent: async () => ({
				content: {
					columnCount: 3,
					maxCellLengths: [1, 1, 1],
					rowCount: 2,
					rows: [["A", "B", "C"], ["1", "2", "3"]],
				},
				format: "csv",
				resource,
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
		let readOptions: unknown = null;
		const service = createResolverService(createFileServiceStub({
			readFile: async (_resource, options) => {
				readOptions = options;
				return textFileContent("Vg,Id\n0,1");
			},
			stat: async () => ({
				ctime: 1,
				mtime: 42,
				path: resource.path,
				size: 10,
				type: FileType.File,
			}),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		const expectedContent = {
			columnCount: 2,
			columnFacts: [{
				column: 0,
				kind: "mixed",
				longestNumericRun: { startRow: 1, endRow: 1, pointCount: 1 },
				longestValueRun: { startRow: 0, endRow: 1, pointCount: 2 },
				numericRuns: [{ startRow: 1, endRow: 1, pointCount: 1, values: new Float64Array([0]) }],
			}, {
				column: 1,
				kind: "mixed",
				longestNumericRun: { startRow: 1, endRow: 1, pointCount: 1 },
				longestValueRun: { startRow: 0, endRow: 1, pointCount: 2 },
				numericRuns: [{ startRow: 1, endRow: 1, pointCount: 1, values: new Float64Array([1]) }],
			}],
			contentFingerprint: "structured-content:1c1h5sa",
			maxCellLengths: [2, 2],
			rowCount: 2,
			rows: [["Vg", "Id"], ["0", "1"]],
		};
		assert.deepStrictEqual(reference.object.getSnapshot(), {
			content: expectedContent,
			defaultSheetId: resource.toString(),
			diagnostics: [],
			format: "csv",
			loadState: {
				message: "",
				state: "ready",
			},
			resource,
			sheets: [{
				content: expectedContent,
				diagnostics: [],
				sheetId: resource.toString(),
				sheetName: null,
			}],
			sourceVersion: 42,
			version: 1,
		});
		assert.deepStrictEqual(readOptions, undefined);
	});

	test("returns an error model reference when file content cannot be read", async () => {
		const resource = URI.file("/workspace/data/unreadable.csv");
		const service = createResolverService(createFileServiceStub({
			stat: async () => {
				throw new Error("permission denied");
			},
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);
		const snapshot = reference.object.getSnapshot();

		assert.deepStrictEqual({
			content: snapshot.content,
			diagnosticCode: snapshot.diagnostics[0]?.code,
			loadState: snapshot.loadState,
		}, {
			content: null,
			diagnosticCode: "table.resolve.failed",
			loadState: {
				message: "permission denied",
				state: "error",
			},
		});
	});

	test("keeps large file-backed table content in row windows", async () => {
		const resource = URI.file("/workspace/data/large.csv");
		const rowCount = PARSED_TABLE_ROW_WINDOW_SIZE + 3;
		const service = createResolverService(createFileServiceStub({
			readFile: async () =>
				textFileContent(Array.from({ length: rowCount }, (_, index) => `r${index},${index}`).join("\n")),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		const content = reference.object.getSnapshot().content;
		assert.equal(content?.rowCount, rowCount);
		assert.equal(content?.rows.length, PARSED_TABLE_ROW_WINDOW_SIZE);
		assert.equal(content?.rowWindows?.length, 2);
		assert.deepStrictEqual(readTableModelContentRows(content, rowCount - 1, rowCount), [[
			`r${rowCount - 1}`,
			String(rowCount - 1),
		]]);
	});

	test("carries parser diagnostics on URI-backed model snapshots", async () => {
		const resource = URI.file("/workspace/data/malformed.csv");
		const service = createResolverService(createFileServiceStub({
			readFile: async () => textFileContent("A,B\n\"unterminated,1"),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		const snapshot = reference.object.getSnapshot();
		assert.deepStrictEqual(snapshot.diagnostics, []);
		assert.deepStrictEqual(snapshot.sheets[0]?.diagnostics?.map(diagnostic => ({
			code: diagnostic.code,
			rowIndex: diagnostic.rowIndex,
			severity: diagnostic.severity,
		})), [{
			code: "table.parser.MissingQuotes",
			rowIndex: 1,
			severity: "error",
		}]);
	});

	test("carries empty delimited parser diagnostics as file-level diagnostics", async () => {
		const resource = URI.file("/workspace/data/empty.csv");
		const service = createResolverService(createFileServiceStub({
			readFile: async () => textFileContent(" \n\t "),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		const snapshot = reference.object.getSnapshot();
		assert.equal(snapshot.content, null);
		assert.deepStrictEqual(snapshot.diagnostics.map(diagnostic => ({
			code: diagnostic.code,
			severity: diagnostic.severity,
		})), [{
			code: "table.parser.empty",
			severity: "fatal",
		}]);
		assert.deepStrictEqual(snapshot.sheets, []);
	});

	test("reuses the cached model for repeated references", async () => {
		let readCount = 0;
		const resource = URI.file("/workspace/data/reuse.tsv");
		const service = createResolverService(createFileServiceStub({
			readFile: async () => {
				readCount += 1;
				return textFileContent("A\tB\n1\t2");
			},
		}));

		const first = await service.createModelReference(resource);
		const second = await service.createModelReference(resource);
		store.add(first);
		store.add(second);

		assert.deepStrictEqual({
			canHandle: service.canHandleResource(resource),
			isSameModel: first.object === second.object,
			readCount,
		}, {
			canHandle: true,
			isSameModel: true,
			readCount: 1,
		});
	});

	test("resolves shared file content before table-model materialization", async () => {
		let readCount = 0;
		const resource = URI.file("/workspace/data/review-first.csv");
		const { contentService, service } = createResolverFixture(createFileServiceStub({
			readFile: async () => {
				readCount += 1;
				return textFileContent("Vg,Id\n0,1");
			},
		}));

		const contentReference = await contentService.createContentReference(resource);
		assert.deepStrictEqual({
			contentRows: contentReference.object.content?.rows,
			modelState: service.get(resource)?.getSnapshot().loadState.state,
			readCount,
		}, {
			contentRows: [["Vg", "Id"], ["0", "1"]],
			modelState: "idle",
			readCount: 1,
		});

		const modelReference = await service.createModelReference(resource);
		assert.deepStrictEqual({
			modelRows: modelReference.object.getSnapshot().content?.rows,
			modelState: modelReference.object.getSnapshot().loadState.state,
			readCount,
		}, {
			modelRows: [["Vg", "Id"], ["0", "1"]],
			modelState: "ready",
			readCount: 1,
		});

		modelReference.dispose();
		contentReference.dispose();
	});

	test("starts every physical content read immediately when memory metrics are unavailable", async () => {
		const pendingReads: Array<(content: ReturnType<typeof textFileContent>) => void> = [];
		const fileService = createFileServiceStub({
			readFile: async () => new Promise(resolve => {
				pendingReads.push(resolve);
			}),
		});
		const memoryGate = new DataResourceContentMemoryGate({
			retryDelayMs: 0,
			sample: () => ({}),
		});
		const { contentService } = createResolverFixture(fileService, memoryGate);

		const firstReferencePromise = contentService.createContentReference(
			URI.file("/workspace/data/unlimited-a.csv"),
		);
		const secondReferencePromise = contentService.createContentReference(
			URI.file("/workspace/data/unlimited-b.csv"),
		);
		await waitForTestCondition(() => pendingReads.length === 2);

		pendingReads[0]!(textFileContent("A,B\n1,2"));
		pendingReads[1]!(textFileContent("A,B\n3,4"));
		const references = await Promise.all([
			firstReferencePromise,
			secondReferencePromise,
		]);
		for (const reference of references) {
			reference.dispose();
		}
	});

	test("backs off physical content reads only when projected memory is unsafe", async () => {
		const mebibyte = 1024 * 1024;
		const pendingReads: Array<(content: ReturnType<typeof textFileContent>) => void> = [];
		const fileService = createFileServiceStub({
			readFile: async () => new Promise(resolve => {
				pendingReads.push(resolve);
			}),
		});
		const memoryGate = new DataResourceContentMemoryGate({
			retryDelayMs: 0,
			sample: () => ({
				heapLimitBytes: 100 * mebibyte,
				heapUsedBytes: 60 * mebibyte,
				systemFreeBytes: 2 * 1024 * mebibyte,
				systemTotalBytes: 4 * 1024 * mebibyte,
			}),
		});
		const { contentService } = createResolverFixture(fileService, memoryGate);

		const firstReferencePromise = contentService.createContentReference(
			URI.file("/workspace/data/pressured-a.csv"),
		);
		const secondReferencePromise = contentService.createContentReference(
			URI.file("/workspace/data/pressured-b.csv"),
		);
		await waitForTestCondition(() => pendingReads.length === 1);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.equal(pendingReads.length, 1);

		pendingReads[0]!(textFileContent("A,B\n1,2"));
		await waitForTestCondition(() => pendingReads.length === 2);
		pendingReads[1]!(textFileContent("A,B\n3,4"));
		const references = await Promise.all([
			firstReferencePromise,
			secondReferencePromise,
		]);
		for (const reference of references) {
			reference.dispose();
		}
	});

	test("keeps file changes from materializing a Review-only idle table model", async () => {
		let text = "Vg,Id\n0,1";
		let mtime = 10;
		let readCount = 0;
		const fileChanges = store.add(new Emitter<readonly IFileChange[]>());
		const resource = URI.file("/workspace/data/review-refresh.csv");
		const { contentService, service } = createResolverFixture(createFileServiceStub({
			onDidFilesChange: fileChanges.event,
			readFile: async () => {
				readCount += 1;
				return textFileContent(text);
			},
			stat: async () => ({
				ctime: 1,
				mtime,
				path: resource.path,
				size: text.length,
				type: FileType.File,
			}),
		}));

		const firstReference = await contentService.createContentReference(resource);
		assert.equal(service.get(resource)?.getSnapshot().loadState.state, "idle");

		text = "Vg,Id\n2,3";
		mtime = 20;
		fileChanges.fire([{ resource, type: FileChangeType.UPDATED }]);
		await waitForTestCondition(() =>
			contentService.get(resource)?.content?.rows[1]?.[0] === "2"
		);

		assert.deepStrictEqual({
			cachedRows: contentService.get(resource)?.content?.rows,
			modelState: service.get(resource)?.getSnapshot().loadState.state,
			readCount,
		}, {
			cachedRows: [["Vg", "Id"], ["2", "3"]],
			modelState: "idle",
			readCount: 2,
		});

		const nextReference = await contentService.createContentReference(resource);
		assert.deepStrictEqual({
			contentRows: nextReference.object.content?.rows,
			modelState: service.get(resource)?.getSnapshot().loadState.state,
			readCount,
		}, {
			contentRows: [["Vg", "Id"], ["2", "3"]],
			modelState: "idle",
			readCount: 2,
		});

		nextReference.dispose();
		firstReference.dispose();
	});

	test("releases file-backed model cache after the last reference is disposed", async () => {
		let readCount = 0;
		const resource = URI.file("/workspace/data/release.csv");
		const service = createResolverService(createFileServiceStub({
			readFile: async () => {
				readCount += 1;
				return textFileContent("A,B\n1,2");
			},
		}));

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
			path: "/generated/report.csv",
			scheme: "table-memory",
		});
		const { contentService, service } = createResolverFixture();
		const registration = contentService.registerContentProvider({
			canHandleResource: candidate => candidate.scheme === "table-memory",
			dispose: () => {
				disposeCount += 1;
			},
			resolveContent: async () => {
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
		} satisfies IDataResourceContentProvider);

		const reference = await service.createModelReference(resource);

		assert.deepStrictEqual({
			canHandle: service.canHandleResource(resource),
			content: reference.object.getSnapshot().content,
			isCached: service.get(resource) === reference.object,
			resolveCount,
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
		const manager = store.add(new TableFileEditorModelManager(directTableStructureParserService, createFileServiceStub({
			readFile: async () => textFileContent(text),
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
			columnFacts: fileEditorModel.model.getSnapshot().content?.columnFacts,
			rows: fileEditorModel.model.getSnapshot().content?.rows,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
			version: fileEditorModel.model.getSnapshot().version,
			workbenchSourceVersion: fileEditorModel.getSourceVersion(),
		}, {
			columnFacts: [
				{
					column: 0,
					kind: "mixed",
					longestValueRun: { startRow: 0, endRow: 2, pointCount: 3 },
					longestNumericRun: { startRow: 1, endRow: 2, pointCount: 2 },
					numericRuns: [{ startRow: 1, endRow: 2, pointCount: 2, values: new Float64Array([3, 5]) }],
				},
				{
					column: 1,
					kind: "mixed",
					longestValueRun: { startRow: 0, endRow: 2, pointCount: 3 },
					longestNumericRun: { startRow: 1, endRow: 2, pointCount: 2 },
					numericRuns: [{ startRow: 1, endRow: 2, pointCount: 2, values: new Float64Array([4, 6]) }],
				},
			],
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
		const manager = store.add(new TableFileEditorModelManager(directTableStructureParserService, createFileServiceStub({
			onDidFilesChange: fileChanges.event,
			readFile: async () => textFileContent(text),
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

	test("does not let an obsolete content read overwrite a newer file generation", async () => {
		let mtime = 10;
		const pendingReads: Array<(content: ReturnType<typeof textFileContent>) => void> = [];
		const fileChanges = store.add(new Emitter<readonly IFileChange[]>());
		const resource = URI.file("/workspace/data/generation.csv");
		const manager = store.add(new TableFileEditorModelManager(
			directTableStructureParserService,
			createFileServiceStub({
				onDidFilesChange: fileChanges.event,
				readFile: async () => new Promise(resolve => {
					pendingReads.push(resolve);
				}),
				stat: async () => ({
					ctime: 1,
					mtime,
					path: resource.path,
					size: 20,
					type: FileType.File,
				}),
			}),
		));
		const fileEditorModel = manager.getOrCreateFileEditorModel(resource);
		const firstResolve = manager.resolveContent(fileEditorModel);
		await waitForTestCondition(() => pendingReads.length === 1);

		mtime = 20;
		fileChanges.fire([{ resource, type: FileChangeType.UPDATED }]);
		await waitForTestCondition(() => pendingReads.length === 2);

		pendingReads[1]!(textFileContent("A,B\n7,8"));
		await waitForTestCondition(() =>
			manager.getResolvedContent(resource)?.content.sourceVersion === 20
		);
		pendingReads[0]!(textFileContent("A,B\n1,2"));
		const resolved = await firstResolve;

		assert.deepStrictEqual({
			cachedRows: manager.getResolvedContent(resource)?.content.content?.rows,
			editorSourceVersion: fileEditorModel.getSourceVersion(),
			modelState: fileEditorModel.model.getSnapshot().loadState.state,
			modelRows: fileEditorModel.model.getSnapshot().content?.rows,
			resolvedRows: resolved.content.content?.rows,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
		}, {
			cachedRows: [["A", "B"], ["7", "8"]],
			editorSourceVersion: 20,
			modelState: "idle",
			modelRows: undefined,
			resolvedRows: [["A", "B"], ["7", "8"]],
			sourceVersion: 0,
		});
	});

	test("marks dirty file-backed models conflicted on external updates", async () => {
		let text = "A,B\n1,2";
		let mtime = 10;
		const fileChanges = store.add(new Emitter<readonly IFileChange[]>());
		const resource = URI.file("/workspace/data/conflict.csv");
		const manager = store.add(new TableFileEditorModelManager(directTableStructureParserService, createFileServiceStub({
			onDidFilesChange: fileChanges.event,
			readFile: async () => textFileContent(text),
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
		await manager.resolveContent(fileEditorModel);

		assert.deepStrictEqual({
			conflict: fileEditorModel.getSnapshot().conflict,
			dirty: fileEditorModel.getSnapshot().dirty,
			editorSourceVersion: fileEditorModel.getSourceVersion(),
			rows: fileEditorModel.model.getSnapshot().content?.rows,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
		}, {
			conflict: true,
			dirty: true,
			editorSourceVersion: 20,
			rows: [["A", "B"], ["1", "2"]],
			sourceVersion: 10,
		});
	});

	test("saves dirty file-backed models and refreshes source version", async () => {
		let text = "A,B\n1,2";
		let mtime = 10;
		let writtenContent = "";
		const resource = URI.file("/workspace/data/save.csv");
		const manager = store.add(new TableFileEditorModelManager(directTableStructureParserService, createFileServiceStub({
			readFile: async () => textFileContent(text),
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
			sharedRows: manager.getResolvedContent(resource)?.content.content?.rows,
			sharedSourceVersion: manager.getResolvedContent(resource)?.content.sourceVersion,
			sharedVersion: manager.getResolvedContent(resource)?.version,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
			writtenContent,
		}, {
			conflict: false,
			dirty: false,
			rows: [["A", "B"], ["9", "9"]],
			saving: false,
			sharedRows: [["A", "B"], ["9", "9"]],
			sharedSourceVersion: 30,
			sharedVersion: 2,
			sourceVersion: 30,
			writtenContent: "A,B\n9,9",
		});
	});

	test("reverts dirty file-backed models from disk", async () => {
		let text = "A,B\n1,2";
		let mtime = 10;
		const resource = URI.file("/workspace/data/revert.csv");
		const manager = store.add(new TableFileEditorModelManager(directTableStructureParserService, createFileServiceStub({
			readFile: async () => textFileContent(text),
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
			sharedRows: manager.getResolvedContent(resource)?.content.content?.rows,
			sharedSourceVersion: manager.getResolvedContent(resource)?.content.sourceVersion,
			sharedVersion: manager.getResolvedContent(resource)?.version,
			sourceVersion: fileEditorModel.model.getSnapshot().sourceVersion,
		}, {
			conflict: false,
			dirty: false,
			rows: [["A", "B"], ["3", "4"]],
			sharedRows: [["A", "B"], ["3", "4"]],
			sharedSourceVersion: 20,
			sharedVersion: 2,
			sourceVersion: 20,
		});
	});

	test("tracks orphan state from file delete and add events", async () => {
		let text = "A,B\n1,2";
		let mtime = 10;
		const fileChanges = store.add(new Emitter<readonly IFileChange[]>());
		const resource = URI.file("/workspace/data/orphan.csv");
		const manager = store.add(new TableFileEditorModelManager(directTableStructureParserService, createFileServiceStub({
			onDidFilesChange: fileChanges.event,
			readFile: async () => textFileContent(text),
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
		const service = createResolverService();

		assert.equal(service.canHandleResource(URI.file("/workspace/readme.md")), false);
	});

	test("rejects unsupported resources at the resolver boundary", async () => {
		const service = createResolverService();

		await assert.rejects(
			() => service.createModelReference(URI.file("/workspace/readme.md")),
			/Unsupported table file/,
		);
	});

	test("creates sheet snapshots for xlsx resources without the import converter", async () => {
		const resource = URI.file("/workspace/data/workbook.xlsx");
		let readOptions: unknown = null;
		const workbookBase64 = await createXlsxBase64([{
			name: "Forward",
			rows: [["Vg", "Id"], ["0", "1"]],
		}, {
			name: "Reverse",
			rows: [["Vd", "Id"], ["1", "2"]],
		}]);
		const service = createResolverService(createFileServiceStub({
			readFile: async (_resource, options) => {
				readOptions = options;
				return base64FileContent(workbookBase64);
			},
			stat: async () => ({
				ctime: 1,
				mtime: 42,
				path: resource.path,
				size: 10,
				type: FileType.File,
			}),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		assert.equal(reference.object.getSnapshot().defaultSheetId, "1:Forward");
		assert.deepStrictEqual(reference.object.getSnapshot().sheets.map(sheet => ({
			columnCount: sheet.content?.columnCount,
			rowCount: sheet.content?.rowCount,
			sheetId: sheet.sheetId,
			sheetName: sheet.sheetName,
		})), [{
			columnCount: 2,
			rowCount: 2,
			sheetId: "1:Forward",
			sheetName: "Forward",
		}, {
			columnCount: 2,
			rowCount: 2,
			sheetId: "2:Reverse",
			sheetName: "Reverse",
		}]);
		assert.equal(
			reference.object.getSnapshot().sheets.find(sheet => sheet.sheetId === "2:Reverse")?.sheetName,
			"Reverse",
		);
		assert.deepStrictEqual(readOptions, undefined);
	});

	test("opens legacy HTML xls resources through the table model snapshot", async () => {
		const resource = URI.file("/workspace/data/legacy.xls");
		const service = createResolverService(createFileServiceStub({
			readFile: async () => textFileContent([
				'<html><head><meta charset="utf-8"></head><body><table>',
				"<tr><th>Label</th><th>Value</th></tr>",
				"<tr><td>Forward</td><td>1.23E-7</td></tr>",
				"<tr><td>Reverse</td><td>-7</td></tr>",
				"</table></body></html>",
			].join("")),
			stat: async () => ({
				ctime: 1,
				mtime: 42,
				path: resource.path,
				size: 10,
				type: FileType.File,
			}),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		const snapshot = reference.object.getSnapshot();
		assert.equal(snapshot.format, "xls");
		assert.equal(snapshot.defaultSheetId, resource.toString());
		assert.deepStrictEqual(snapshot.content?.rows, [
			["Label", "Value"],
			["Forward", "1.23E-7"],
			["Reverse", "-7"],
		]);
		assert.deepStrictEqual(snapshot.diagnostics, []);
	});

	test("keeps large xlsx sheet content in row windows", async () => {
		const resource = URI.file("/workspace/data/large-workbook.xlsx");
		const rowCount = PARSED_TABLE_ROW_WINDOW_SIZE + 2;
		const workbookBase64 = await createXlsxBase64([{
			name: "Large",
			rows: Array.from({ length: rowCount }, (_, index) => [`r${index}`, String(index)]),
		}]);
		const service = createResolverService(createFileServiceStub({
			readFile: async () => base64FileContent(workbookBase64),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		const snapshot = reference.object.getSnapshot();
		const content = snapshot.content;
		assert.equal(snapshot.defaultSheetId, "1:Large");
		assert.equal(content?.rowCount, rowCount);
		assert.equal(content?.rows.length, PARSED_TABLE_ROW_WINDOW_SIZE);
		assert.equal(content?.rowWindows?.length, 2);
		assert.deepStrictEqual(readTableModelContentRows(content, rowCount - 1, rowCount), [[
			`r${rowCount - 1}`,
			String(rowCount - 1),
		]]);
	});

	test("keeps xlsx sheet diagnostics without blocking readable sheets", async () => {
		const resource = URI.file("/workspace/data/partial-workbook.xlsx");
		const workbookBase64 = await createXlsxBase64([{
			name: "Missing",
			rows: [["Vg", "Id"], ["0", "1"]],
		}, {
			name: "Readable",
			rows: [["Vd", "Id"], ["1", "2"]],
		}], { missingSheetIndexes: [0] });
		const service = createResolverService(createFileServiceStub({
			readFile: async () => base64FileContent(workbookBase64),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		const snapshot = reference.object.getSnapshot();
		assert.equal(snapshot.defaultSheetId, "2:Readable");
		assert.deepStrictEqual(snapshot.content?.rows, [["Vd", "Id"], ["1", "2"]]);
		assert.equal(snapshot.sheets.length, 2);
		assert.equal(snapshot.sheets[0]?.content, null);
		assert.deepStrictEqual(snapshot.sheets[0]?.diagnostics?.map(diagnostic => ({
			code: diagnostic.code,
			severity: diagnostic.severity,
			sheetId: diagnostic.sheetId,
		})), [{
			code: "table.parser.missingSheetXml",
			severity: "error",
			sheetId: "1:Missing",
		}]);
		assert.deepStrictEqual(snapshot.sheets[1]?.content?.rows, [["Vd", "Id"], ["1", "2"]]);
	});

	test("carries malformed xlsx parser diagnostics on URI-backed model snapshots", async () => {
		const resource = URI.file("/workspace/data/malformed.xlsx");
		const workbookBase64 = await createMalformedXlsxBase64();
		const service = createResolverService(createFileServiceStub({
			readFile: async () => base64FileContent(workbookBase64),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		const snapshot = reference.object.getSnapshot();
		assert.equal(snapshot.loadState.state, "ready");
		assert.equal(snapshot.content, null);
		assert.deepStrictEqual(snapshot.diagnostics.map(diagnostic => ({
			code: diagnostic.code,
			severity: diagnostic.severity,
		})), [{
			code: "table.parser.malformedWorkbook",
			severity: "fatal",
		}]);
		assert.deepStrictEqual(snapshot.sheets, []);
	});

	test("carries malformed workbook bytes as file-level diagnostics on URI-backed model snapshots", async () => {
		const resource = URI.file("/workspace/data/decode-failed.xlsx");
		const service = createResolverService(createFileServiceStub({
			readFile: async () => textFileContent("%"),
			stat: async () => ({
				ctime: 1,
				mtime: 42,
				path: resource.path,
				size: 1,
				type: FileType.File,
			}),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		const snapshot = reference.object.getSnapshot();
		assert.equal(snapshot.loadState.state, "ready");
		assert.equal(snapshot.content, null);
		assert.equal(snapshot.format, "xlsx");
		assert.equal(snapshot.sourceVersion, 42);
		assert.deepStrictEqual(snapshot.diagnostics.map(diagnostic => ({
			code: diagnostic.code,
			severity: diagnostic.severity,
		})), [{
			code: "table.parser.malformedWorkbook",
			severity: "fatal",
		}]);
		assert.deepStrictEqual(snapshot.sheets, []);
	});

	test("carries no-readable-sheet xlsx parser diagnostics as file-level diagnostics", async () => {
		const resource = URI.file("/workspace/data/empty-workbook.xlsx");
		const workbookBase64 = await createXlsxBase64([]);
		const service = createResolverService(createFileServiceStub({
			readFile: async () => base64FileContent(workbookBase64),
		}));

		const reference = await service.createModelReference(resource);
		store.add(reference);

		const snapshot = reference.object.getSnapshot();
		assert.equal(snapshot.content, null);
		assert.deepStrictEqual(snapshot.diagnostics.map(diagnostic => ({
			code: diagnostic.code,
			severity: diagnostic.severity,
		})), [{
			code: "table.parser.noReadableSheet",
			severity: "fatal",
		}]);
		assert.deepStrictEqual(snapshot.sheets, []);
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
	getProviderCapabilities: () => FileSystemProviderCapabilities.FileRead |
		FileSystemProviderCapabilities.FileReadRange |
		FileSystemProviderCapabilities.FileWatch,
	moveFileToTrash: async () => undefined,
	onDidFilesChange: Event.None,
	readDir: async () => [],
	readFile: async () => textFileContent("A,B\n1,2"),
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

const textFileContent = (value: string): { readonly value: Uint8Array } => ({
	value: new TextEncoder().encode(value),
});

const base64FileContent = (value: string): { readonly value: Uint8Array } => ({
	value: Uint8Array.from(globalThis.atob(value), character => character.charCodeAt(0)),
});

const createXlsxBase64 = async (
	sheets: readonly { readonly name: string; readonly rows: readonly (readonly string[])[] }[],
	options: {
		readonly missingSheetIndexes?: readonly number[];
	} = {},
): Promise<string> => {
	const entries: ZipEntry[] = [];
	const missingSheetIndexes = new Set(options.missingSheetIndexes ?? []);
	entries.push({
		path: "xl/workbook.xml",
		contents: [
		'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
		"<sheets>",
		...sheets.map((sheet, index) =>
			`<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
		),
		"</sheets>",
		"</workbook>",
	].join(""),
	});
	entries.push({
		path: "xl/_rels/workbook.xml.rels",
		contents: [
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
		...sheets.map((_, index) =>
			`<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
		),
		"</Relationships>",
	].join(""),
	});
	for (let index = 0; index < sheets.length; index += 1) {
		if (missingSheetIndexes.has(index)) {
			continue;
		}
		entries.push({
			path: `xl/worksheets/sheet${index + 1}.xml`,
			contents: createXlsxSheetXml(sheets[index]!.rows),
		});
	}
	return bytesToBase64(createZipBuffer(entries));
};

const createMalformedXlsxBase64 = async (): Promise<string> => {
	return bytesToBase64(createZipBuffer([{
		path: "[Content_Types].xml",
		contents: "<Types></Types>",
	}]));
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

const bytesToBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return globalThis.btoa(binary);
};

const waitForTestCondition = async (
	condition: () => boolean,
): Promise<void> => {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (condition()) {
			return;
		}
		await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
	}
	throw new Error("Timed out waiting for the table model test condition.");
};
