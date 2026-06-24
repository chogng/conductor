/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { TABLE_FACTS_RULE_VERSION, type RawTableFactsRecord } from "src/cs/workbench/services/tableFacts/common/tableFacts";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableFacts/common/rawTableStructure";
import type {
	IRawTableRowsReaderService,
	RawTableRows,
	RawTableRowsReadInput,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";
import type { FileImportResult, ImportedFileRecord } from "src/cs/workbench/services/files/common/files";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { SliceService } from "src/cs/workbench/services/slice/browser/sliceService";
import { createSliceTableFactsSignature } from "src/cs/workbench/services/slice/common/slicePlanner";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import {
	createReviewEvidenceSignature,
	createReviewRecordSignature,
	type RawTableReviewRecord,
} from "src/cs/workbench/services/review/common/review";
import type {
	IUserTemplateService,
	UserTemplate,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

suite("workbench/services/slice/test/browser/sliceService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("queues manual inline templates and stores per-file selection", () => {
		const sessionService = store.add(new SessionService());
		const sliceService = store.add(new SliceService(sessionService));
		sessionService.commitFileImport(createImportResult());

		const template = createTemplate();
		sliceService.runWithTemplate({
			ref: {
				fileId: "file-a",
				rawTableId: "table-a",
			},
			selection: {
				kind: "inline",
				template,
			},
		});

		const state = sliceService.getState();
		assert.equal(state.queueLength, 1);
		assert.deepEqual(state.fileStates.get("file-a"), { state: "queued" });
		assert.equal(state.templateSelectionsByFileId["file-a"]?.kind, "inline");
	});

	test("queues manual saved selections through user template lookup", () => {
		const sessionService = store.add(new SessionService());
		const template = {
			...createTemplate(),
			id: "template-a",
		};
		const sliceService = store.add(new SliceService(sessionService, createUserTemplateServiceForTest(template)));
		sessionService.commitFileImport(createImportResult());

		sliceService.runWithTemplate({
			ref: {
				fileId: "file-a",
				rawTableId: "table-a",
			},
			selection: {
				kind: "saved",
				templateId: "template-a",
			},
		});

		const state = sliceService.getState();
		assert.equal(state.queueLength, 1);
		assert.deepEqual(state.templateSelectionsByFileId["file-a"], {
			kind: "saved",
			templateId: "template-a",
		});
	});

	test("queues automatic slice when a resolved template is available", () => {
		const sessionService = store.add(new SessionService());
		const sliceService = store.add(new SliceService(sessionService));
		sessionService.commitFileImport(createImportResult());
		const tableFacts = createTableFacts();
		sessionService.commitRawTableFacts(tableFacts);
		sessionService.commitRawTableReviews([createReview(tableFacts)]);

		sliceService.enqueueAuto([{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);

		const state = sliceService.getState();
		assert.equal(state.queueLength, 1);
		assert.deepEqual(state.fileStates.get("file-a"), { state: "queued" });
	});

	test("keeps one pending automatic slice plan per raw table", () => {
		const sessionService = store.add(new SessionService());
		const sliceService = store.add(new SliceService(sessionService));
		sessionService.commitFileImport(createImportResult());
		const tableFacts = createTableFacts();
		sessionService.commitRawTableFacts(tableFacts);
		sessionService.commitRawTableReviews([createReview(tableFacts, {
			recipeFingerprint: "recipe:first",
		})]);

		sliceService.enqueueAuto([{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);
		sessionService.commitRawTableReviews([createReview(tableFacts, {
			recipeFingerprint: "recipe:second",
		})]);
		sliceService.enqueueAuto([{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);

		const state = sliceService.getState();
		assert.equal(state.queueLength, 1);
		assert.deepEqual(state.fileStates.get("file-a"), { state: "queued" });
	});

	test("executes queued automatic slices when rows are available", async () => {
		const sessionService = store.add(new SessionService());
		const rowsReaderService = new TestRawTableRowsReaderService([
			["Vg", "Id"],
			["0", "1"],
			["1", "2"],
		]);
		const sliceService = store.add(new SliceService(
			sessionService,
			undefined,
			rowsReaderService,
		));
		sessionService.commitFileImport(createImportResult());
		const tableFacts = createTableFacts();
		sessionService.commitRawTableFacts(tableFacts);
		sessionService.commitRawTableReviews([createReview(tableFacts)]);

		sliceService.enqueueAuto([{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);
		await waitUntil(() => sliceService.getState().fileStates.get("file-a")?.state === "ready");

		const record = sessionService.getSnapshot().filesById["file-a"];
		assert.equal(sliceService.getState().queueLength, 0);
		assert.ok(record.latestSliceRunId);
		assert.equal(record.sliceRunsById?.[record.latestSliceRunId!]?.errors.length, 0);
		assert.deepEqual(record.seriesById["series-b0-y1"].y, [1, 2]);
		assert.deepEqual(record.curvesByKey["base:iv:transfer:series-b0-y1"]?.points, [
			{ x: 0, y: 1 },
			{ x: 1, y: 2 },
		]);
	});

	test("drops stale automatic slice plans when review changes while rows are loading", async () => {
		const sessionService = store.add(new SessionService());
		const rowsReaderService = new BlockingRawTableRowsReaderService([
			["Vg", "Id"],
			["0", "1"],
			["1", "2"],
		]);
		const sliceService = store.add(new SliceService(
			sessionService,
			undefined,
			rowsReaderService,
		));
		sessionService.commitFileImport(createImportResult());
		const latestTableFacts = createTableFacts();
		sessionService.commitRawTableFacts(latestTableFacts);
		sessionService.commitRawTableReviews([createReview(latestTableFacts, {
			recipeFingerprint: "recipe:first",
		})]);

		sliceService.enqueueAuto([{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);
		await waitUntil(() => rowsReaderService.inputs.length === 1);

		const latestReview = createReview(latestTableFacts, {
			recipeFingerprint: "recipe:second",
		});
		sessionService.commitRawTableReviews([latestReview]);
		sliceService.enqueueAuto([{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);
		rowsReaderService.resolveFirstRead();
		await waitUntil(() =>
			Boolean(sessionService.getSnapshot().filesById["file-a"].latestSliceRunId)
		);

		const record = sessionService.getSnapshot().filesById["file-a"];
		assert.equal(Object.keys(record.sliceRunsById ?? {}).length, 1);
		assert.equal(
			record.sliceRunsById?.[record.latestSliceRunId!]?.sourceTableFactsSignature,
			createSliceTableFactsSignature(latestTableFacts, {
				reviewSignature: createReviewRecordSignature(latestReview),
			}),
		);
	});

	test("drops stale manual saved-template plans when the user template changes while rows are loading", async () => {
		const sessionService = store.add(new SessionService());
		const rowsReaderService = new BlockingRawTableRowsReaderService([
			["Vg", "Id"],
			["0", "1"],
			["1", "2"],
		]);
		let savedTemplate: Template = {
			...createTemplate(),
			id: "template-a",
		};
		const sliceService = store.add(new SliceService(
			sessionService,
			createUserTemplateServiceForTest(() => savedTemplate),
			rowsReaderService,
		));
		sessionService.commitFileImport(createImportResult());

		sliceService.runWithTemplate({
			ref: {
				fileId: "file-a",
				rawTableId: "table-a",
			},
			selection: {
				kind: "saved",
				templateId: "template-a",
			},
		});
		await waitUntil(() => rowsReaderService.inputs.length === 1);

		savedTemplate = {
			...savedTemplate,
			name: "Updated Transfer",
			version: 2,
		};
		rowsReaderService.resolveFirstRead();
		await waitUntil(() => sliceService.getState().fileStates.get("file-a")?.state !== "processing");

		const record = sessionService.getSnapshot().filesById["file-a"];
		assert.equal(record.latestSliceRunId, undefined);
		assert.equal(sliceService.getState().fileStates.has("file-a"), false);
	});

	test("marks automatic slice skipped when no review decision is available", () => {
		const sessionService = store.add(new SessionService());
		const sliceService = store.add(new SliceService(sessionService));
		sessionService.commitFileImport(createImportResult());

		sliceService.enqueueAuto([{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);

		const state = sliceService.getState();
		assert.equal(state.queueLength, 0);
		assert.equal(state.fileStates.get("file-a")?.state, "skipped");
	});

	test("cleans local slice state when files are removed", () => {
		const sessionService = store.add(new SessionService());
		const sliceService = store.add(new SliceService(sessionService));
		sessionService.commitFileImport(createImportResult());

		sliceService.runWithTemplate({
			ref: {
				fileId: "file-a",
				rawTableId: "table-a",
			},
			selection: {
				kind: "inline",
				template: createTemplate(),
			},
		});
		sliceService.prioritize("file-a");

		sessionService.removeFiles(["file-a"]);

		const state = sliceService.getState();
		assert.equal(state.activeFileId, null);
		assert.equal(state.queueLength, 0);
		assert.equal(state.fileStates.has("file-a"), false);
		assert.deepEqual(state.templateSelectionsByFileId, {});
	});
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

const createReview = (
	tableFacts: RawTableFactsRecord,
	options: {
		readonly recipeFingerprint?: string;
		readonly template?: Template;
		readonly userTemplateCatalogVersion?: number;
		readonly templateFingerprint?: string;
	} = {},
): RawTableReviewRecord => {
	const template = options.template ?? createTemplate();
	const templateFingerprint = options.templateFingerprint ?? "template:auto";
	return {
		fileId: tableFacts.fileId,
		rawTableId: tableFacts.rawTableId,
		sourceRawTableVersion: tableFacts.sourceRawTableVersion,
		evidenceSignature: createReviewEvidenceSignature(tableFacts, {
			columnCount: 2,
			fileName: "Raw.csv",
			rowCount: 3,
		}),
		recipeFingerprint: options.recipeFingerprint ?? "recipe:test",
		userTemplateCatalogVersion: options.userTemplateCatalogVersion ?? 1,
		userTemplateEffectiveFingerprint: "legacy-template:test",
		reviewEngineVersion: 1,
		reviewPolicyVersion: 1,
		candidates: [{
			id: "recipe:builtin.iv.transfer:block-a",
			source: {
				kind: "recipe",
				recipeId: "builtin.iv.transfer",
				recipeVersion: 1,
			},
			templateFingerprint,
			displayName: template.name,
			reasonCodes: [],
			diagnosticCodes: [],
		}],
		reviews: [{
			candidateId: "recipe:builtin.iv.transfer:block-a",
			templateFingerprint,
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
				templateFingerprint,
				review: {
					candidateId: "recipe:builtin.iv.transfer:block-a",
					templateFingerprint,
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

const createUserTemplateServiceForTest = (template: Template | (() => Template)): IUserTemplateService => {
	const getCurrentTemplate = () => typeof template === "function" ? template() : template;
	const getCurrentUserTemplate = () => createUserTemplateForTest(getCurrentTemplate());
	return {
	_serviceBrand: undefined,
	createTemplate: async () => {
		throw new Error("Unexpected user template create in slice test.");
	},
	deleteTemplate: async () => undefined,
	duplicateTemplate: async () => {
		throw new Error("Unexpected user template duplicate in slice test.");
	},
	exportTemplates: () => ({
		version: 1,
		source: "conductor.userTemplate",
		templates: [getCurrentUserTemplate()],
	}),
	getSnapshot: () => ({
		version: 1,
		workspaceVersion: 0,
		globalVersion: 1,
		workspaceFingerprint: "workspace:test",
		globalFingerprint: "global:test",
		effectiveFingerprint: "effective:test",
		templates: [getCurrentUserTemplate()],
	}),
	getTemplate: (id: string) => {
		const userTemplate = getCurrentUserTemplate();
		return String(id ?? "").trim() === userTemplate.id ? userTemplate : undefined;
	},
	importTemplates: async () => ({
		imported: [],
		skipped: [],
	}),
	onDidChangeUserTemplates: Event.None,
	refreshTemplates: async () => [getCurrentUserTemplate()],
	updateTemplate: async () => {
		throw new Error("Unexpected user template update in slice test.");
	},
	} as unknown as IUserTemplateService;
};

const createUserTemplateForTest = (template: Template): UserTemplate => {
	const id = String(template.id ?? template.name ?? "template-a").trim();
	const name = String(template.name ?? id).trim();
	return {
		id,
		name,
		version: Math.max(1, Math.floor(Number(template.version)) || 1),
		scope: "global",
		source: "userCreated",
		template,
		templateFingerprint: createTemplateFingerprint(template),
		createdAt: 0,
		updatedAt: 0,
	};
};

const createTableFacts = (): RawTableFactsRecord => ({
	tableFactsRuleVersion: TABLE_FACTS_RULE_VERSION,
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
				endCol: 1,
			},
			dataRange: {
				startRow: 1,
				endRow: 2,
				startCol: 0,
				endCol: 1,
			},
		},
		columns: {
			columns: [{
				rawCol: 0,
				role: "vg",
				unit: "V",
				headerText: "Vg",
				confidence: 0.95,
				sourceRange: {
					startRow: 0,
					endRow: 2,
					startCol: 0,
					endCol: 0,
				},
			}, {
				rawCol: 1,
				role: "id",
				unit: "A",
				headerText: "Id",
				confidence: 0.95,
				sourceRange: {
					startRow: 0,
					endRow: 2,
					startCol: 1,
					endCol: 1,
				},
			}],
		},
		rowCount: 3,
		columnCount: 2,
		confidence: 0.95,
		diagnosticCodes: [],
	}],
	diagnostics: [],
	createdAt: 1,
});

class TestRawTableRowsReaderService implements IRawTableRowsReaderService {
	public declare readonly _serviceBrand: undefined;
	public readonly inputs: RawTableRowsReadInput[] = [];

	public constructor(
		protected readonly rows: RawTableRows,
	) {}

	public readRawTableRows(input: RawTableRowsReadInput): Promise<RawTableRows | null> {
		this.inputs.push(input);
		return Promise.resolve(this.rows);
	}
}

class BlockingRawTableRowsReaderService extends TestRawTableRowsReaderService {
	private firstRead:
		| { readonly resolve: (rows: RawTableRows | null) => void; readonly rows: RawTableRows | null }
		| null = null;

	public override readRawTableRows(input: RawTableRowsReadInput): Promise<RawTableRows | null> {
		if (this.inputs.length > 0) {
			return super.readRawTableRows(input);
		}

		this.inputs.push(input);
		return new Promise(resolve => {
			this.firstRead = { resolve, rows: this.rows };
		});
	}

	public resolveFirstRead(): void {
		this.firstRead?.resolve(this.firstRead.rows);
		this.firstRead = null;
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
				columnCount: 2,
				maxCellLengths: [],
				rows: {
					kind: "inline",
					values: [
						["Vg", "Id"],
						["0", "1"],
						["1", "2"],
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
