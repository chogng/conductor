/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import { ASSESSMENT_RULE_VERSION, type RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type { FileImportResult, ImportedFileRecord } from "src/cs/workbench/services/files/common/files";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import type { IRecipeService, RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { TemplateResolutionContribution } from "src/cs/workbench/services/templateResolution/browser/templateResolution.contribution";
import { TemplateResolutionService } from "src/cs/workbench/services/templateResolution/browser/templateResolutionService";
import { UserTemplateService } from "src/cs/workbench/services/userTemplate/browser/userTemplateService";
import { UserTemplateStoreService } from "src/cs/workbench/services/userTemplate/browser/userTemplateStoreService";

suite("workbench/services/templateResolution/test/browser/templateResolutionService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const createUserTemplateServiceForTest = () =>
		store.add(new UserTemplateService(
			store.add(new UserTemplateStoreService(store.add(new TestStorageService()))),
		));

	test("resolves recipe candidates for review", () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const service = store.add(new TemplateResolutionService(
			sessionService,
			recipeService,
			userTemplateService,
		));

		const result = service.resolve({
			assessment: createAssessment(),
			columnCount: 2,
			fileName: "Transfer.csv",
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.recipeFingerprint, "recipe:first");
		assert.equal(result.templateCatalogVersion, 0);
		assert.equal(result.templateCandidates[0]?.source.kind, "recipe");
		assert.equal(result.templateCandidates[0]?.source.kind === "recipe" && result.templateCandidates[0].source.recipeId, "builtin.iv.transfer");
		assert.equal(result.templateCandidates[0]?.state, "ready");
	});

	test("commits template resolutions after assessment and refreshes on recipe changes", () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const service = store.add(new TemplateResolutionService(
			sessionService,
			recipeService,
			userTemplateService,
		));
		store.add(new TemplateResolutionContribution(
			sessionService,
			service,
			recipeService,
			userTemplateService,
		));

		sessionService.commitFileImport(createImportResult());
		sessionService.commitRawTableAssessment(createAssessment());

		let record = sessionService.getSnapshot().filesById["file-a"]
			.templateResolutionsByRawTableId?.["table-a"];
		assert.equal(record?.recipeFingerprint, "recipe:first");
		assert.equal(record?.templateCandidates[0]?.source.kind, "recipe");

		recipeService.setFingerprint("recipe:second");

		record = sessionService.getSnapshot().filesById["file-a"]
			.templateResolutionsByRawTableId?.["table-a"];
		assert.equal(record?.recipeFingerprint, "recipe:second");
		assert.equal(record?.templateCandidates[0]?.source.kind, "recipe");
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

class TestStorageService extends AbstractStorageService {
	private readonly values = new Map<string, string>();

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.values.get(this.storageKey(key, scope));
	}

	protected writeValue(key: string, scope: StorageScope, value: string): void {
		this.values.set(this.storageKey(key, scope), value);
	}

	protected deleteValue(key: string, scope: StorageScope): void {
		this.values.delete(this.storageKey(key, scope));
	}

	protected readKeys(scope: StorageScope): string[] {
		const prefix = this.storageKey("", scope);
		return [...this.values.keys()]
			.filter(key => key.startsWith(prefix))
			.map(key => key.slice(prefix.length));
	}

	private storageKey(key: string, scope: StorageScope): string {
		return `${scope}:${key}`;
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
