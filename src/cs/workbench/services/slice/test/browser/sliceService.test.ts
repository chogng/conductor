/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { DataResourceService } from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import { SliceService } from "src/cs/workbench/services/slice/browser/sliceService";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { ReviewedTemplate } from "src/cs/workbench/services/review/common/reviewModel";
import type {
	ITableModel,
	TableModelContentSnapshot,
	TableModelSnapshot,
} from "src/cs/workbench/services/table/common/model";
import type {
	ITableModelContentProvider,
	ITableModelReference,
	ITableModelService,
} from "src/cs/workbench/services/table/common/resolverService";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	SliceResourceRequest,
	SliceResourceTarget,
} from "src/cs/workbench/services/slice/common/slice";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";

suite("workbench/services/slice/test/browser/sliceService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const settingsService = {
		onDidChangeConductorSettings: Event.None,
		getConductorSettings: () => null,
	} as unknown as ISettingsService;
	const createDataResourceServiceForTest = (
		tableModelService: ITableModelService,
	): DataResourceService =>
		store.add(new DataResourceService(tableModelService, settingsService));

	test("stores template selections by resource target in Slice state", () => {
		const sliceService = store.add(new SliceService());
		const target = { resource: URI.file("/workspace/file-a.csv"), sheetId: "sheet-a" };
		const changedTargets: SliceResourceTarget[] = [];
		store.add(sliceService.onDidChangeTemplateSelection(changedTarget => {
			changedTargets.push(changedTarget);
		}));

		assert.deepEqual(sliceService.getTemplateSelection(target), { kind: "auto" });

		sliceService.setTemplateSelection(target, {
			kind: "saved",
			templateId: "template-a",
		});
		sliceService.setTemplateSelection(target, {
			kind: "saved",
			templateId: "template-a",
		});

		const state = sliceService.getState();
		assert.deepEqual(sliceService.getTemplateSelection(target), {
			kind: "saved",
			templateId: "template-a",
		});
		assert.deepEqual(state.templateSelections.map(selection => ({
			resource: selection.target.resource.toString(),
			sheetId: selection.target.sheetId,
			selection: selection.selection,
		})), [{
			resource: target.resource.toString(),
			sheetId: "sheet-a",
			selection: {
				kind: "saved",
				templateId: "template-a",
			},
		}]);
		assert.deepEqual(changedTargets.map(changedTarget => ({
			resource: changedTarget.resource.toString(),
			sheetId: changedTarget.sheetId,
		})), [{
			resource: target.resource.toString(),
			sheetId: "sheet-a",
		}]);
	});

	test("cleans queued resource state when the table model resource changes", async () => {
		const tableModelService = store.add(new BlockingTableModelService());
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const resource = URI.file("/workspace/source.xlsx");
		const processingTarget = { resource, sheetId: "sheet-a" };
		const queuedTarget = { resource, sheetId: "sheet-b" };

		sliceService.submitResource([createResourceSliceRequest(processingTarget)]);
		await waitUntil(() => sliceService.getResourceState(processingTarget)?.state === "processing");
		sliceService.submitResource([createResourceSliceRequest(queuedTarget)]);
		assert.deepEqual(sliceService.getResourceState(queuedTarget), { state: "queued" });

		tableModelService.fireModelChanged(resource);

		assert.equal(sliceService.getState().queueLength, 0);
		assert.equal(sliceService.getResourceState(queuedTarget), undefined);
		assert.deepEqual(sliceService.getResourceState(processingTarget), { state: "processing" });
	});

	test("cancels queued resource slice requests by target", async () => {
		const tableModelService = store.add(new BlockingTableModelService());
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const resource = URI.file("/workspace/source.xlsx");
		const processingTarget = { resource, sheetId: "sheet-a" };
		const queuedTarget = { resource, sheetId: "sheet-b" };

		sliceService.submitResource([createResourceSliceRequest(processingTarget)]);
		await waitUntil(() => sliceService.getResourceState(processingTarget)?.state === "processing");
		sliceService.submitResource([createResourceSliceRequest(queuedTarget)]);
		assert.deepEqual(sliceService.getResourceState(queuedTarget), { state: "queued" });

		sliceService.cancelResource([queuedTarget]);

		assert.equal(sliceService.getState().queueLength, 0);
		assert.deepEqual(sliceService.getResourceState(queuedTarget), { state: "none" });
		assert.deepEqual(sliceService.getResourceState(processingTarget), { state: "processing" });
	});

	test("matches queued resource slice state when request resource is structured cloned", async () => {
		const tableModelService = store.add(new BlockingTableModelService());
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const resource = URI.file("/workspace/source.xlsx");
		const processingTarget = { resource, sheetId: "sheet-a" };
		const queuedTarget = {
			resource: resource.toJSON() as unknown as SliceResourceTarget["resource"],
			sheetId: "sheet-b",
		};
		const queryTarget = { resource, sheetId: "sheet-b" };

		sliceService.submitResource([createResourceSliceRequest(processingTarget)]);
		await waitUntil(() => sliceService.getResourceState(processingTarget)?.state === "processing");
		sliceService.submitResource([createResourceSliceRequest(queuedTarget)]);

		assert.deepEqual(sliceService.getResourceState(queryTarget), { state: "queued" });

		sliceService.cancelResource([queryTarget]);

		assert.deepEqual(sliceService.getResourceState(queryTarget), { state: "none" });
	});

	test("reads only planned resource table row ranges from windowed content", async () => {
		const resource = URI.file("/workspace/large-source.xlsx");
		const rowCount = 1004;
		const template = createTemplate({
			startRow: 1001,
			endRow: 1003,
		});
		const content: TableModelContentSnapshot = {
			columnCount: 2,
			maxCellLengths: [4, 4],
			rowCount,
			rows: [],
			rowWindows: [{
				startRowIndex: 1001,
				rows: [
					["0", "1"],
					["1", "2"],
					["2", "3"],
				],
			}],
		};
		const tableModelService = store.add(new StaticTableModelService({
			content,
			defaultSheetId: "sheet-a",
			diagnostics: [],
			format: "xlsx",
			loadState: { state: "ready", message: "" },
			resource,
			sheets: [{
				content,
				diagnostics: [],
				sheetId: "sheet-a",
				sheetName: "Sheet A",
			}],
			sourceVersion: 7,
			version: 3,
		}));
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const target = { resource, sheetId: "sheet-a" };

		sliceService.submitResource([createResourceSliceRequest(target, {
			rowCount,
			sourceModelVersion: 3,
			sourceVersion: 7,
			template,
		})]);

		await waitUntil(() => sliceService.getResourceState(target)?.state === "ready");
		const result = sliceService.getResourceResult(target);
		assert.equal(result?.run.errors.length, 0);
		assert.deepEqual(result?.curves[0]?.points, [
			{ x: 0, y: 1 },
			{ x: 1, y: 2 },
			{ x: 2, y: 3 },
		]);
	});

	test("fires resource result target changes when resource results are stored and removed", async () => {
		const resource = URI.file("/workspace/source.xlsx");
		const content: TableModelContentSnapshot = {
			columnCount: 2,
			maxCellLengths: [2, 2],
			rowCount: 3,
			rows: [
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			],
		};
		const tableModelService = store.add(new StaticTableModelService({
			content,
			defaultSheetId: "sheet-a",
			diagnostics: [],
			format: "xlsx",
			loadState: { state: "ready", message: "" },
			resource,
			sheets: [{
				content,
				diagnostics: [],
				sheetId: "sheet-a",
				sheetName: "Sheet A",
			}],
			sourceVersion: 1,
			version: 1,
		}));
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const target = { resource, sheetId: "sheet-a" };
		const changedTargets: SliceResourceTarget[] = [];
		const listener = sliceService.onDidChangeResourceSliceResult(changedTarget => {
			changedTargets.push(changedTarget);
		});

		sliceService.submitResource([createResourceSliceRequest(target)]);
		await waitUntil(() => sliceService.getResourceState(target)?.state === "ready");
		tableModelService.fireModelChanged(resource);
		listener.dispose();

		assert.equal(changedTargets.length, 2);
		assert.deepEqual(changedTargets.map(changedTarget => changedTarget.sheetId), ["sheet-a", "sheet-a"]);
		assert.deepEqual(changedTargets.map(changedTarget => changedTarget.resource.toString()), [
			resource.toString(),
			resource.toString(),
		]);
		assert.equal(sliceService.getResourceResult(target), null);
	});

	test("does not fall back to the default sheet when a resource slice sheet target is missing", async () => {
		const resource = URI.file("/workspace/source.xlsx");
		const content: TableModelContentSnapshot = {
			columnCount: 2,
			maxCellLengths: [2, 2],
			rowCount: 3,
			rows: [
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			],
		};
		const tableModelService = store.add(new StaticTableModelService({
			content,
			defaultSheetId: "sheet-a",
			diagnostics: [],
			format: "xlsx",
			loadState: { state: "ready", message: "" },
			resource,
			sheets: [{
				content,
				diagnostics: [],
				sheetId: "sheet-a",
				sheetName: "Sheet A",
			}],
			sourceVersion: 1,
			version: 1,
		}));
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const target = { resource, sheetId: "missing-sheet" };

		sliceService.submitResource([createResourceSliceRequest(target)]);

		await waitUntil(() => sliceService.getResourceState(target)?.state === "failed");
		assert.equal(sliceService.getResourceState(target)?.state, "failed");
		assert.equal(sliceService.getResourceResult(target), null);
	});
});

const createTemplate = (
	options: {
		readonly startRow?: number;
		readonly endRow?: number | "end";
	} = {},
): Template => ({
	schemaVersion: 1,
	name: "Transfer",
	version: 1,
	measurement: {
		curveFamily: "iv",
		ivMode: "transfer",
	},
	blocks: [{
		rowRange: {
			startRow: options.startRow ?? 1,
			endRow: options.endRow ?? "end",
		},
		x: {
			columns: [0],
			unit: "V",
		},
		y: {
			columns: [1],
			unit: "A",
		},
		segmentation: {
			kind: "auto",
		},
		legend: {
			target: "auto",
		},
	}],
	stopOnError: false,
});

const createTestReviewFactors = () => ({
	selectorScore: 1,
	projectionScore: 1,
	semanticScore: 1,
	dataQualityScore: 1,
	parseHealthScore: 1,
	freshnessScore: 1,
	ambiguityPenalty: 0,
	conflictPenalty: 0,
	diagnosticPenalty: 0,
});

const createResourceSliceRequest = (
	target: SliceResourceTarget,
	options: {
		readonly rowCount?: number;
		readonly sourceModelVersion?: number;
		readonly sourceVersion?: number;
		readonly template?: Template;
	} = {},
): SliceResourceRequest => {
	const reviewedTemplate = createReviewedTemplate(options.template);
	const requestSignature = JSON.stringify({
		resource: target.resource.toString(),
		sheetId: target.sheetId ?? null,
		templateFingerprint: reviewedTemplate.templateFingerprint,
	});
	return {
		id: `slice-resource-request:${target.resource.toString()}:${target.sheetId ?? ""}`,
		target,
		reviewedTemplate,
		reviewSignature: "review:resource",
		trigger: {
			kind: "reviewDecision",
			reviewSignature: "review:resource",
			submittedBy: "system",
		},
		requestSignature,
		createdAt: 1,
		rowCount: options.rowCount ?? 3,
		columnCount: 2,
		sourceContentSignature: "source-content:resource",
		sourceModelVersion: options.sourceModelVersion ?? 1,
		sourceVersion: options.sourceVersion ?? 1,
	};
};

const createReviewedTemplate = (
	template = createTemplate(),
): ReviewedTemplate => {
	const templateFingerprint = createTemplateFingerprint(template);
	return {
		candidateId: "data-resource-candidate:binding-a",
		source: {
			kind: "dataResource",
			bindingCandidateId: "binding-a",
			semanticLibraryFingerprint: "semantic:test",
		},
		template,
		templateFingerprint,
		review: {
			candidateId: "data-resource-candidate:binding-a",
			interpretationFingerprint: templateFingerprint,
			status: "ready",
			confidence: 0.95,
			factors: createTestReviewFactors(),
			findings: [],
			reasons: [],
			diagnostics: [],
		},
	};
};

class BlockingTableModelService implements ITableModelService {
	public declare readonly _serviceBrand: undefined;
	private readonly onDidChangeModelEmitter = new Emitter<ITableModel>();
	public readonly onDidChangeModel = this.onDidChangeModelEmitter.event;

	public canHandleResource(): boolean {
		return true;
	}

	public createModelReference(): Promise<ITableModelReference> {
		return new Promise(() => undefined);
	}

	public get(): ITableModel | undefined {
		return undefined;
	}

	public registerContentProvider(_provider: ITableModelContentProvider): { dispose(): void } {
		return { dispose: () => undefined };
	}

	public resolve(_resource: URI, _source?: TableSource | null): void {}

	public fireModelChanged(resource: URI): void {
		this.onDidChangeModelEmitter.fire({ resource } as ITableModel);
	}

	public dispose(): void {
		this.onDidChangeModelEmitter.dispose();
	}
}

class StaticTableModelService implements ITableModelService {
	public declare readonly _serviceBrand: undefined;
	private readonly onDidChangeModelEmitter = new Emitter<ITableModel>();
	public readonly onDidChangeModel = this.onDidChangeModelEmitter.event;

	public constructor(
		private readonly snapshot: TableModelSnapshot,
	) {}

	public canHandleResource(): boolean {
		return true;
	}

	public createModelReference(): Promise<ITableModelReference> {
		return Promise.resolve({
			object: {
				resource: this.snapshot.resource,
				getSnapshot: () => this.snapshot,
			} as ITableModel,
			dispose: () => undefined,
		});
	}

	public get(): ITableModel | undefined {
		return undefined;
	}

	public registerContentProvider(_provider: ITableModelContentProvider): { dispose(): void } {
		return { dispose: () => undefined };
	}

	public resolve(_resource: URI, _source?: TableSource | null): void {}

	public fireModelChanged(resource: URI): void {
		this.onDidChangeModelEmitter.fire({ resource } as ITableModel);
	}

	public dispose(): void {
		this.onDidChangeModelEmitter.dispose();
	}
}

const waitUntil = async (
	predicate: () => boolean,
): Promise<void> => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (predicate()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 0));
	}

	assert.ok(predicate());
};
