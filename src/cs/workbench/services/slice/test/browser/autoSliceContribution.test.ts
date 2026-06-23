/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { AssessmentContribution } from "src/cs/workbench/services/assessment/browser/assessment.contribution";
import { AssessmentQueueService } from "src/cs/workbench/services/assessment/browser/assessmentQueueService";
import { AssessmentService } from "src/cs/workbench/services/assessment/browser/assessmentService";
import { ASSESSMENT_RULE_VERSION, type RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type {
	IRawTableRowsReaderService,
	RawTableRows,
	RawTableRowsReadInput,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";
import type { FileImportResult, ImportedFileRecord } from "src/cs/workbench/services/files/common/files";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import type { RawTableRef } from "src/cs/workbench/services/session/common/sessionModel";
import { AutoSliceContribution } from "src/cs/workbench/services/slice/browser/autoSlice.contribution";
import { SliceService } from "src/cs/workbench/services/slice/browser/sliceService";
import type {
	ISliceService,
	RunSliceWithTemplateInput,
	SliceState,
} from "src/cs/workbench/services/slice/common/slice";
import { createSliceAssessmentSignature } from "src/cs/workbench/services/slice/common/slicePlanner";
import type { Template } from "src/cs/workbench/services/template/common/template";
import type { TemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";
import type {
	IRecipeService,
	RecipeSnapshot,
} from "src/cs/workbench/services/recipe/common/recipe";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";

suite("workbench/services/slice/test/browser/autoSliceContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("enqueues ready selected assessments after assessment commit", () => {
		const sessionService = store.add(new SessionService());
		const sliceService = new TestSliceService();
		store.add(new AutoSliceContribution(sessionService, sliceService));
		sessionService.commitFileImport(createImportResult());

		sessionService.commitRawTableAssessment(createAssessment());

		assert.deepEqual(sliceService.enqueuedRefs, [[{
			fileId: "file-a",
			rawTableId: "table-a",
		}]]);
	});

	test("does not enqueue assessments already covered by latest auto slice run", () => {
		const sessionService = store.add(new SessionService());
		sessionService.commitFileImport(createImportResult());
		const assessment = createAssessment();
		sessionService.commitRawTableAssessment(assessment);
		sessionService.commitSliceRuns([{
			run: {
				id: "slice-run-a",
				fileId: "file-a",
				rawTableId: "table-a",
				mode: "auto",
				selection: { kind: "auto" },
				sourceRawTableVersion: assessment.sourceRawTableVersion,
				sourceAssessmentSignature: createSliceAssessmentSignature(assessment),
				template: createTemplate(),
				templateFingerprint: "template:test",
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

	test("runs raw import through assessment selected template into slice curves", async () => {
		const sessionService = store.add(new SessionService());
		const rowsReaderService = new TestRawTableRowsReaderService();
		const recipeService = new TestRecipeService();
		const assessmentService = store.add(new AssessmentService());
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rowsReaderService,
			undefined,
			recipeService,
		));
		const sliceService = store.add(new SliceService(sessionService, undefined, rowsReaderService));
		store.add(new AssessmentContribution(sessionService, assessmentQueueService));
		store.add(new AutoSliceContribution(sessionService, sliceService));

		sessionService.commitFileImport(createImportResult());
		await waitUntil(() =>
			Boolean(sessionService.getSnapshot().filesById["file-a"]?.latestSliceRunId)
		);

		const file = sessionService.getSnapshot().filesById["file-a"];
		const run = file.sliceRunsById?.[file.latestSliceRunId!];
		assert.equal(run?.mode, "auto");
		assert.equal(run?.errors.length, 0);
		assert.equal(file.assessmentsByRawTableId["table-a"]?.selectedTemplate?.source.kind, "recipe");
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

class TestRecipeService implements IRecipeService {
	public declare readonly _serviceBrand: undefined;

	public readonly onDidChangeRecipes = Event.None as Event<void>;

	public getSnapshot(): RecipeSnapshot {
		return {
			version: 1,
			fingerprint: "recipe:test",
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
	recipeFingerprint: "recipe:test",
	templateCatalogVersion: 0,
	schemaProfileVersion: 0,
	fileId: "file-a",
	rawTableId: "table-a",
	sourceRawTableVersion: 1,
	structure: createEmptyRawTableStructure(),
	columnProfiles: [],
	layoutCandidates: [],
	semanticCandidates: [],
	groups: [],
	blocks: [],
	templateCandidates: [],
	selectedTemplate: {
		candidateId: "candidate-a",
		source: {
			kind: "recipe",
			recipeId: "recipe-a",
			recipeVersion: 1,
		},
		template: createTemplate(),
		templateFingerprint: "template:test",
	},
	decision: {
		state: "ready",
		autoApplyAllowed: true,
		confidence: 0.95,
		reasons: [],
	},
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
