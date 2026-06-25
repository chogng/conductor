/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { TableModelContribution } from "src/cs/workbench/services/tableModel/browser/tableModel.contribution";
import { TableModelQueueService } from "src/cs/workbench/services/tableModel/browser/tableModelQueueService";
import { TableModelProducerService } from "src/cs/workbench/services/tableModel/browser/tableModelService";
import { TABLE_MODEL_RULE_VERSION, type TableModelRecord } from "src/cs/workbench/services/tableModel/common/tableModel";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";
import type {
	IRawTableRowsReaderService,
	RawTableRows,
	RawTableRowsReadInput,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";
import type { FileImportResult, ImportedFileRecord } from "src/cs/workbench/services/files/common/files";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { TableFileService } from "src/cs/workbench/services/tablefile/browser/tableFileService";
import type { RawTableRef } from "src/cs/workbench/services/session/common/sessionModel";
import { AutoSliceContribution } from "src/cs/workbench/services/slice/browser/autoSlice.contribution";
import { SliceService } from "src/cs/workbench/services/slice/browser/sliceService";
import type {
	ISliceService,
	RunSliceWithTemplateInput,
	SliceRequest,
	SliceState,
} from "src/cs/workbench/services/slice/common/slice";
import type { Template } from "src/cs/workbench/services/template/common/template";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import {
	createReviewEvidenceSignature,
	type RawTableReviewRecord,
} from "src/cs/workbench/services/review/common/review";

suite("workbench/services/slice/test/browser/autoSliceContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("enqueues system-recommended reviews after review commit", () => {
		const sessionService = store.add(new SessionService());
		const sliceService = new TestSliceService();
		store.add(new AutoSliceContribution(sessionService, sliceService));
		sessionService.commitFileImport(createImportResult());
		const tableModel = createTableModel();

		sessionService.commitTableModel(tableModel);
		sessionService.commitRawTableReviews([createReview(tableModel)]);

		assert.deepEqual(sliceService.enqueuedRefs, [[{
			fileId: "file-a",
			rawTableId: "table-a",
		}]]);
	});

	test("does not enqueue automatic slices after latest manual slice run", () => {
		const sessionService = store.add(new SessionService());
		sessionService.commitFileImport(createImportResult());
		const tableModel = createTableModel();
		sessionService.commitTableModel(tableModel);
		sessionService.commitRawTableReviews([createReview(tableModel)]);
		const template = createTemplate();
		sessionService.commitSliceRuns([{
			run: {
				id: "slice-run-manual",
				fileId: "file-a",
				rawTableId: "table-a",
				mode: "manual",
				selection: {
					kind: "inline",
					template,
				},
				sourceRawTableVersion: tableModel.sourceRawTableVersion,
				template,
				templateFingerprint: "template:manual",
				inputRanges: [{
					fileId: "file-a",
					rawTableId: "table-a",
					range: {
						startRow: 1,
						endRow: 2,
						startCol: 0,
						endCol: 1,
					},
				}],
				outputSeriesIds: [],
				outputCurveKeys: [],
				warnings: [],
				errors: [],
			},
			series: [],
			curves: [],
		}]);
		const sliceService = new TestSliceService();

		store.add(new AutoSliceContribution(sessionService, sliceService));

		assert.deepEqual(sliceService.enqueuedRefs, []);
	});

	test("runs raw import through reviewed automatic template into slice curves", async () => {
		const sessionService = store.add(new SessionService());
		const tableFileService = new TableFileService(sessionService);
		const rowsReaderService = new TestRawTableRowsReaderService();
		const tableModelService = store.add(new TableModelProducerService());
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			tableModelService,
			rowsReaderService,
		));
		const sliceService = store.add(new SliceService(
			sessionService,
			undefined,
			rowsReaderService,
		));
		store.add(new TableModelContribution(tableFileService, tableModelQueueService));
		store.add(new TestReviewContribution(sessionService));
		store.add(new AutoSliceContribution(sessionService, sliceService));

		sessionService.commitFileImport(createImportResult());
		await waitUntil(() =>
			Boolean(sessionService.getSnapshot().filesById["file-a"]?.latestSliceRunId)
		);

		const file = sessionService.getSnapshot().filesById["file-a"];
		const run = file.sliceRunsById?.[file.latestSliceRunId!];
		assert.equal(run?.mode, "auto");
		assert.equal(run?.errors.length, 0);
		assert.deepEqual(file.curvesByKey["base:iv:transfer:series-b0-y2"]?.points, [
			{ x: 0, y: 1 },
			{ x: 1, y: 2 },
		]);
	});
});

class TestSliceService implements ISliceService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidChangeSliceState = Event.None as Event<void>;
	public readonly enqueuedRefs: RawTableRef[][] = [];

	public getState(): SliceState {
		return {
			fileStates: new Map(),
			queueLength: 0,
			activeFileId: null,
			templateSelectionsByFileId: {},
		};
	}

	public enqueueAuto(refs: readonly RawTableRef[]): void {
		if (refs.length) {
			this.enqueuedRefs.push([...refs]);
		}
	}

	public submit(requests: readonly SliceRequest[]): void {
		const refs = requests.map(request => request.ref);
		if (refs.length) {
			this.enqueuedRefs.push(refs);
		}
	}

	public runWithTemplate(_input: RunSliceWithTemplateInput): void {}
	public prioritize(_fileId: string): void {}
	public cancel(_fileIds?: readonly string[]): void {}
	public setTemplateSelection(_fileId: string, _selection: TemplateSelection): void {}
}

class TestRawTableRowsReaderService implements IRawTableRowsReaderService {
	public declare readonly _serviceBrand: undefined;

	public readRawTableRows(input: RawTableRowsReadInput): Promise<RawTableRows | null> {
		if (input.rowStore?.kind === "memory") {
			return Promise.resolve(input.rowStore.rows.map(row =>
				row.map(cell => String(cell ?? ""))
			));
		}
		return Promise.resolve(null);
	}
}

class TestReviewContribution extends Disposable {
	public constructor(
		private readonly sessionService: SessionService,
	) {
		super();
		this._register(this.sessionService.onDidChangeSession(event => {
			if (event.reason !== "tableModelChanged") {
				return;
			}

			const snapshot = this.sessionService.getSnapshot();
			this.sessionService.commitRawTableReviews((event.rawTableRefs ?? [])
				.map(ref => snapshot.filesById[ref.fileId]?.tableModelByRawTableId[ref.rawTableId])
				.filter((tableModel): tableModel is TableModelRecord => Boolean(tableModel))
				.map(tableModel => createReview(tableModel, createAutoTemplate())));
		}));
	}
}

const createReview = (
	tableModel: TableModelRecord,
	template = createTemplate(),
): RawTableReviewRecord => {
	return {
		fileId: tableModel.fileId,
		rawTableId: tableModel.rawTableId,
		sourceRawTableVersion: tableModel.sourceRawTableVersion,
		evidenceSignature: createReviewEvidenceSignature(tableModel, {
			columnCount: 3,
			fileName: "Raw.csv",
			rowCount: 3,
		}),
		recipeFingerprint: "recipe:test",
		userTemplateCatalogVersion: 1,
		userTemplateEffectiveFingerprint: "user-template:test",
		reviewEngineVersion: 1,
		reviewPolicyVersion: 1,
		candidates: [{
			id: "recipe:builtin.iv.transfer:block-a",
			source: {
				kind: "recipe",
				recipeId: "builtin.iv.transfer",
				recipeVersion: 1,
			},
			templateFingerprint: "template:auto",
			displayName: template.name,
			reasonCodes: [],
			diagnosticCodes: [],
		}],
		reviews: [{
			candidateId: "recipe:builtin.iv.transfer:block-a",
			templateFingerprint: "template:auto",
			status: "ready",
			confidence: 0.95,
			reasons: [],
			diagnostics: [],
		}],
		decision: {
			kind: "ready",
			reviewedTemplate: {
				candidateId: "recipe:builtin.iv.transfer:block-a",
				source: {
					kind: "recipe",
					recipeId: "builtin.iv.transfer",
					recipeVersion: 1,
				},
				template,
				templateFingerprint: "template:auto",
				review: {
					candidateId: "recipe:builtin.iv.transfer:block-a",
					templateFingerprint: "template:auto",
					status: "ready",
					confidence: 0.95,
					reasons: [],
					diagnostics: [],
				},
			},
			application: {
				kind: "systemRecommended",
				reason: "review.ready.systemRecommended",
			},
			summary: "Template is ready.",
			suggestedActions: [],
		},
		createdAt: 1,
	};
};

const createTableModel = (): TableModelRecord => ({
	tableModelRuleVersion: TABLE_MODEL_RULE_VERSION,
	schemaProfileVersion: 0,
	fileId: "file-a",
	rawTableId: "table-a",
	sourceRawTableVersion: 1,
	structure: createEmptyRawTableStructure(),
	columnProfiles: [],
	layoutCandidates: [],
	semanticCandidates: [],
	groups: [],
	blocks: [{
		id: "block-a",
		fileId: "file-a",
		rawTableId: "table-a",
		label: "Transfer",
		family: "iv",
		ivMode: "transfer",
		source: {
			fullRange: {
				startRow: 0,
				endRow: 2,
				startCol: 0,
				endCol: 2,
			},
			dataRange: {
				startRow: 1,
				endRow: 2,
				startCol: 0,
				endCol: 2,
			},
		},
		columns: {
			columns: [{
				rawCol: 1,
				role: "vg",
				unit: "V",
				headerText: "Vg",
				confidence: 0.95,
				sourceRange: {
					startRow: 0,
					endRow: 2,
					startCol: 1,
					endCol: 1,
				},
			}, {
				rawCol: 2,
				role: "id",
				unit: "A",
				headerText: "Id",
				confidence: 0.95,
				sourceRange: {
					startRow: 0,
					endRow: 2,
					startCol: 2,
					endCol: 2,
				},
			}],
		},
		rowCount: 3,
		columnCount: 3,
		confidence: 0.95,
		diagnosticCodes: [],
	}],
	diagnostics: [],
	createdAt: 1,
});

const createTemplate = (): Template => ({
	schemaVersion: 1,
	name: "Transfer",
	version: 1,
	blocks: [{
		rowRange: {
			startRow: 1,
			endRow: "end",
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

const createAutoTemplate = (): Template => ({
	...createTemplate(),
	blocks: [{
		...createTemplate().blocks[0]!,
		x: {
			columns: [1],
			unit: "V",
		},
		y: {
			columns: [2],
			unit: "A",
		},
	}],
});

const createImportResult = (): FileImportResult => ({
	createdAt: 1,
	diagnostics: [],
	files: [createImportedFile()],
});

const createImportedFile = (): ImportedFileRecord => ({
	id: "file-a",
	kind: "csv",
	name: "Raw.csv",
	raw: {
		fileId: "file-a",
		fileName: "Raw.csv",
		rawTablesById: {
			"table-a": {
				fileId: "file-a",
				rawTableId: "table-a",
				rowCount: 3,
				columnCount: 3,
				maxCellLengths: [],
				rows: {
					kind: "inline",
					values: [
						["DataName", "Vg", "Id"],
						["DataValue", "0", "1"],
						["DataValue", "1", "2"],
					],
				},
				source: {
					kind: "csv",
				},
			},
		},
		rawTableOrder: ["table-a"],
	},
});

const waitUntil = async (
	predicate: () => boolean,
): Promise<void> => {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		if (predicate()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 0));
	}

	assert.ok(predicate());
};
