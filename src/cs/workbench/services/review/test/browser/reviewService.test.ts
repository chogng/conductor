/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ASSESSMENT_RULE_VERSION, type RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type { FileImportResult, ImportedFileRecord } from "src/cs/workbench/services/files/common/files";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import type { IRecipeService, RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import { ReviewContribution } from "src/cs/workbench/services/review/browser/review.contribution";
import { ReviewService } from "src/cs/workbench/services/review/browser/reviewService";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import type {
	ITemplateService,
	Template,
	TemplateApplyPresetRecord,
	TemplateApplyPresetSaveInput,
	TemplateSnapshot,
} from "src/cs/workbench/services/template/common/template";

suite("workbench/services/review/test/browser/reviewService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("derives recipe candidates into a system-recommended review decision", () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const templateService = store.add(new TestTemplateService());
		const service = store.add(new ReviewService(
			sessionService,
			recipeService,
			templateService,
		));

		const result = service.deriveAndReview({
			assessment: createAssessment(),
			columnCount: 2,
			fileName: "Transfer.csv",
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			templateSnapshot: templateService.getSnapshot(),
		});

		assert.equal(result.recipeFingerprint, "recipe:first");
		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.application.kind, "systemRecommended");
		assert.equal(result.decision.kind === "ready" && result.decision.reviewedTemplate.source.kind, "recipe");
	});

	test("commits reviews after assessment and refreshes on recipe changes", () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const templateService = store.add(new TestTemplateService());
		const service = store.add(new ReviewService(
			sessionService,
			recipeService,
			templateService,
		));
		store.add(new ReviewContribution(
			sessionService,
			service,
			recipeService,
			templateService,
		));

		sessionService.commitFileImport(createImportResult());
		sessionService.commitRawTableAssessment(createAssessment());

		let record = sessionService.getSnapshot().filesById["file-a"]
			.rawTableReviewsByRawTableId?.["table-a"];
		assert.equal(record?.recipeFingerprint, "recipe:first");
		assert.equal(record?.decision.kind, "ready");

		recipeService.setFingerprint("recipe:second");

		record = sessionService.getSnapshot().filesById["file-a"]
			.rawTableReviewsByRawTableId?.["table-a"];
		assert.equal(record?.recipeFingerprint, "recipe:second");
		assert.equal(record?.decision.kind, "ready");
	});
});

class TestRecipeService extends Disposable implements IRecipeService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeRecipesEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeRecipes = this.onDidChangeRecipesEmitter.event;
	private fingerprint: string;
	private version = 1;

	public constructor(fingerprint: string) {
		super();
		this.fingerprint = fingerprint;
	}

	public setFingerprint(fingerprint: string): void {
		this.fingerprint = fingerprint;
		this.version += 1;
		this.onDidChangeRecipesEmitter.fire(undefined);
	}

	public getSnapshot(): RecipeSnapshot {
		return {
			version: this.version,
			fingerprint: this.fingerprint,
			recipes: builtinRecipes,
			diagnostics: [],
		};
	}

	public reload(): Promise<void> {
		return Promise.resolve();
	}
}

class TestTemplateService extends Disposable implements ITemplateService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeTemplatesEmitter = this._register(new Emitter<readonly TemplateApplyPresetRecord[]>());
	public readonly onDidChangeTemplates = this.onDidChangeTemplatesEmitter.event;
	private version = 1;

	public getSnapshot(): TemplateSnapshot {
		return {
			version: this.version,
			templates: [],
		};
	}

	public getTemplate(_id: string): Template | undefined {
		return undefined;
	}

	public getTemplateList(): readonly TemplateApplyPresetRecord[] {
		return [];
	}

	public hasLoadedTemplateList(): boolean {
		return true;
	}

	public refreshTemplates(): Promise<readonly TemplateApplyPresetRecord[]> {
		return Promise.resolve([]);
	}

	public deleteTemplate(_id: string): Promise<void> {
		return Promise.resolve();
	}

	public saveTemplate(_template: TemplateApplyPresetSaveInput): Promise<TemplateApplyPresetRecord> {
		throw new Error("Unexpected template save in review test.");
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
	decision: {
		state: "ready",
		autoApplyAllowed: true,
		confidence: 0.95,
		reasons: [],
	},
	diagnostics: [],
	createdAt: 1,
});

const createImportResult = (): FileImportResult => ({
	createdAt: 1,
	diagnostics: [],
	files: [createImportedFile()],
});

const createImportedFile = (): ImportedFileRecord => ({
	id: "file-a",
	kind: "csv",
	name: "Transfer.csv",
	raw: {
		fileId: "file-a",
		fileName: "Transfer.csv",
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
