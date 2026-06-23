/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ASSESSMENT_RULE_VERSION, type RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type {
	IRawTableRowsReaderService,
	RawTableRows,
	RawTableRowsReadInput,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";
import type { FileImportResult, ImportedFileRecord } from "src/cs/workbench/services/files/common/files";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { SliceService } from "src/cs/workbench/services/slice/browser/sliceService";
import { createSliceAssessmentSignature } from "src/cs/workbench/services/slice/common/slicePlanner";
import type {
	IRecipeService,
	RecipeSnapshot,
} from "src/cs/workbench/services/recipe/common/recipe";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import type { ITemplateService, Template } from "src/cs/workbench/services/template/common/template";

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

	test("queues manual saved templates through canonical template lookup", () => {
		const sessionService = store.add(new SessionService());
		const template = {
			...createTemplate(),
			id: "template-a",
		};
		const sliceService = store.add(new SliceService(sessionService, createTemplateServiceForTest(template)));
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

	test("queues automatic slice when a recipe matches a ready assessment", () => {
		const sessionService = store.add(new SessionService());
		const sliceService = store.add(new SliceService(
			sessionService,
			undefined,
			undefined,
			new TestRecipeService(),
		));
		sessionService.commitFileImport(createImportResult());
		sessionService.commitRawTableAssessment(createAssessment());

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
		const recipeService = new TestRecipeService("recipe:first");
		const sliceService = store.add(new SliceService(
			sessionService,
			undefined,
			undefined,
			recipeService,
		));
		sessionService.commitFileImport(createImportResult());
		sessionService.commitRawTableAssessment(createAssessment());

		sliceService.enqueueAuto([{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);
		recipeService.setFingerprint("recipe:second");
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
			new TestRecipeService(),
		));
		sessionService.commitFileImport(createImportResult());
		sessionService.commitRawTableAssessment(createAssessment());

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

	test("drops stale automatic slice plans when assessment changes while rows are loading", async () => {
		const sessionService = store.add(new SessionService());
		const rowsReaderService = new BlockingRawTableRowsReaderService([
			["Vg", "Id"],
			["0", "1"],
			["1", "2"],
		]);
		const recipeService = new TestRecipeService("recipe:first");
		const sliceService = store.add(new SliceService(
			sessionService,
			undefined,
			rowsReaderService,
			recipeService,
		));
		sessionService.commitFileImport(createImportResult());
		const latestAssessment = createAssessment();
		sessionService.commitRawTableAssessment(latestAssessment);

		sliceService.enqueueAuto([{
			fileId: "file-a",
			rawTableId: "table-a",
		}]);
		await waitUntil(() => rowsReaderService.inputs.length === 1);

		recipeService.setFingerprint("recipe:second");
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
			record.sliceRunsById?.[record.latestSliceRunId!]?.sourceAssessmentSignature,
			createSliceAssessmentSignature(latestAssessment, "recipe:second"),
		);
	});

	test("drops stale manual saved-template plans when the saved template changes while rows are loading", async () => {
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
			createTemplateServiceForTest(() => savedTemplate),
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

	test("marks automatic slice skipped when no assessment can materialize a recipe template", () => {
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

const createTemplateServiceForTest = (template: Template | (() => Template)): ITemplateService => {
	const getCurrentTemplate = () => typeof template === "function" ? template() : template;
	return {
	_serviceBrand: undefined,
	deleteTemplate: async () => undefined,
	getSnapshot: () => ({
		templates: [getCurrentTemplate()],
		version: 1,
	}),
	getTemplate: (id: string) => {
		const currentTemplate = getCurrentTemplate();
		return String(id ?? "").trim() === currentTemplate.id ? currentTemplate : undefined;
	},
	getTemplateList: () => {
		throw new Error("SliceService must not read legacy template apply preset lists.");
	},
	hasLoadedTemplateList: () => true,
	onDidChangeTemplates: Event.None,
	refreshTemplates: async () => [],
	saveTemplate: async () => {
		throw new Error("Unexpected template save in slice test.");
	},
	} as unknown as ITemplateService;
};

class TestRecipeService implements IRecipeService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidChangeRecipes = Event.None as Event<void>;
	private fingerprint: string;

	public constructor(fingerprint = "recipe:test") {
		this.fingerprint = fingerprint;
	}

	public setFingerprint(fingerprint: string): void {
		this.fingerprint = fingerprint;
	}

	public getSnapshot(): RecipeSnapshot {
		return {
			version: 1,
			fingerprint: this.fingerprint,
			recipes: builtinRecipes,
			diagnostics: [],
		};
	}

	public reload(): Promise<void> {
		return Promise.resolve();
	}
}

const createAssessment = (): RawTableAssessmentRecord => ({
	assessmentRuleVersion: ASSESSMENT_RULE_VERSION,
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
				source: {
					range: {
						startRow: 0,
						endRow: 2,
						startCol: 0,
						endCol: 0,
					},
				},
			}, {
				rawCol: 1,
				role: "id",
				unit: "A",
				headerText: "Id",
				confidence: 0.95,
				source: {
					range: {
						startRow: 0,
						endRow: 2,
						startCol: 1,
						endCol: 1,
					},
				},
			}],
		},
		rowCount: 3,
		columnCount: 2,
		confidence: 0.95,
		diagnosticCodes: [],
	}],
	decision: {
		state: "ready",
		autoApplyAllowed: true,
		confidence: 0.95,
		reasons: [],
	},
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
