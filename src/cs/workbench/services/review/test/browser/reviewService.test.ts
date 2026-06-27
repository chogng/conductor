/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import { createEmptyTableProjectionStructure } from "src/cs/workbench/services/table/common/tableProjection";
import { builtinRecipes } from "cs/workbench/services/recipes/common/builtinRecipes.generated";
import type { IRecipeService, Recipe, RecipeSnapshot } from "cs/workbench/services/recipes/common/recipe";
import { createRecipeSnapshot } from "cs/workbench/services/recipes/common/recipeCodec";
import { ReviewService } from "src/cs/workbench/services/review/browser/reviewService";
import type { ReviewSummaryTarget } from "src/cs/workbench/services/review/common/review";
import type { ReviewEvidence } from "src/cs/workbench/services/review/common/reviewModel";
import { deriveReviewResult } from "src/cs/workbench/services/review/common/reviewDecision";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import {
	TableModel as TableContentModel,
	type ITableModel,
	type TableModelContentSnapshot,
	type TableParseDiagnostic,
} from "src/cs/workbench/services/table/common/model";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	ITableModelContentProvider,
	ITableModelReference,
	ITableModelService,
} from "src/cs/workbench/services/table/common/resolverService";
import type { Template } from "src/cs/workbench/services/template/common/template";
import type { IUserTemplateService } from "src/cs/workbench/services/userTemplate/common/userTemplate";
import { UserTemplateService } from "src/cs/workbench/services/userTemplate/browser/userTemplateService";
import { UserTemplateStoreService } from "src/cs/workbench/services/userTemplate/browser/userTemplateStoreService";

suite("workbench/services/review/test/browser/reviewService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const createUserTemplateStoreServiceForTest = () =>
		store.add(new UserTemplateStoreService(store.add(new TestStorageService())));
	const createUserTemplateServiceForTest = () =>
		store.add(new UserTemplateService(createUserTemplateStoreServiceForTest()));
	const createReviewServiceForTest = (
		_sessionService: SessionService,
		recipeService: IRecipeService,
		userTemplateService: IUserTemplateService,
		tableModelService?: ITableModelService,
	) => store.add(new ReviewService(
		recipeService,
		userTemplateService,
		tableModelService,
	));
	const createReviewTargetForTest = (fileName = "Transfer.csv") => ({
		resource: URI.file(`/workspace/${fileName}`),
		modelVersion: 1,
		sourceVersion: 1,
	});

	test("derives recipe review candidates into a system-recommended review decision", () => {
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidence(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.recipeFingerprint, "recipe:first");
		assert.equal(result.reviewPolicyVersion, 8);
		assert.equal(typeof result.evidenceFingerprint, "string");
		assert.equal(result.candidates[0]?.providerRank, 100);
		assert.equal(result.reviewedTemplate, result.decision.kind === "ready" ? result.decision.reviewedTemplate : undefined);
		assert.equal(typeof result.reviews[0]?.factors.selectorScore, "number");
		assert.deepEqual(result.reviews[0]?.findings, []);
		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.application.kind, "systemRecommended");
		assert.equal(result.decision.kind === "ready" && result.decision.reviewedTemplate.source.kind, "recipe");
		assert.deepEqual(result.reviewedTemplate?.template.measurement, {
			curveFamily: "iv",
			ivMode: "transfer",
		});
	});

	test("uses the Review decision application as the system application gate", () => {
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidence(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.application.kind, "systemRecommended");
		assert.equal(result.decision.kind === "ready" && result.decision.application.reason, "review.ready.systemRecommended");
	});

	test("requires adjustment when Review cannot rank top candidates distinctly", () => {
		const recipe = getBuiltinRecipe("builtin.iv.transfer");
		const recipeService = store.add(new TestRecipeService("recipe:ambiguous", [{
			...recipe,
			id: "workspace.tie-a",
			priority: 100,
		}, {
			...recipe,
			id: "workspace.tie-b",
			priority: 90,
		}]));
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidence(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.decision.kind, "needsManualAdjustment");
		assert.equal(result.reviewedTemplate, undefined);
		assert.equal(result.reviews.every(review => review.status !== "ready"), true);
		assert.equal(
			result.reviews.every(review => review.findings.some(finding => finding.code === "review.ambiguousCandidates")),
			true,
		);
	});

	test("derives user template candidates from the user template snapshot", async () => {
		const template = createTemplate({
			id: "template-a",
			applicability: {
				schemaFingerprint: createEmptyTableProjectionStructure().fingerprint,
				columnCount: 2,
			},
		});
		const recipeService = store.add(new TestRecipeService("recipe:none", []));
		const userTemplateService = createUserTemplateServiceForTest();
		await userTemplateService.createTemplate({
			id: "template-a",
			name: "Transfer",
			template,
		});

		const result = deriveReviewResult({
			evidence: createReviewEvidence(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.userTemplateCatalogVersion, 1);
		assert.equal(result.candidates[0]?.source.kind, "userTemplate");
		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.reviewedTemplate.source.kind, "userTemplate");
	});

	test("requires adjustment when Review confidence is below the ready threshold", async () => {
		const recipeService = store.add(new TestRecipeService("recipe:none", []));
		const userTemplateService = createUserTemplateServiceForTest();
		await userTemplateService.createTemplate({
			id: "template-a",
			name: "Transfer",
			template: createTemplate({ id: "template-a" }),
		});

		const result = deriveReviewResult({
			evidence: createReviewEvidence(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.decision.kind, "needsManualAdjustment");
		assert.equal(result.reviews[0]?.status, "needsAdjustment");
		assert.equal(result.reviewedTemplate, undefined);
		assert.equal(result.decision.kind === "needsManualAdjustment" && result.decision.candidateId, result.candidates[0]?.id);
		assert.equal(Object.hasOwn(result.reviews[0] ?? {}, "template"), false);
	});

	test("returns latest review summaries for URI-backed table models", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			store.add(new TestTableModelService(resource)),
		);

		const target = {
			resource,
			sheetId: "table-a",
		};
		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		await waitUntil(() => service.getLatestReviewSummary(target).state !== "pending");

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "ready");
		assert.equal(summary.resource, resource);
		assert.equal(summary.sheetId, "table-a");
		assert.equal(summary.reviewedSemanticLabel, "Detected IV Transfer");
		assert.equal(summary.message, "Review is ready and recommended for system application.");
		assert.deepEqual(summary.findingCodes, []);
		assert.equal(typeof summary.confidence, "number");
		assert.equal(Boolean(summary.reviewSignature), true);
		assert.equal(Boolean(summary.templateFingerprint), true);

		const uriReview = await service.reviewUri(target);
		assert.equal(uriReview.result?.resource?.toString(), resource.toString());
		assert.equal(uriReview.result?.sheetId, "table-a");
		assert.equal(uriReview.result?.modelVersion, 1);
		assert.equal(uriReview.result?.sourceVersion, 1);
		assert.equal(typeof uriReview.result?.evidenceFingerprint, "string");
		assert.equal(uriReview.result?.reviewedTemplate?.template.measurement?.curveFamily, "iv");
		assert.equal(uriReview.result?.reviewedTemplate?.template.measurement?.ivMode, "transfer");
		assert.equal(service.getLatestReview(target)?.reviewSignature, uriReview.reviewSignature);
		assert.equal(service.getLatestReview(target)?.summary.state, "ready");
	});

	test("normalizes structured-cloned URI review targets before resolving models", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			store.add(new TestTableModelService(resource)),
		);
		const target: ReviewSummaryTarget = {
			resource: resource.toJSON() as unknown as ReviewSummaryTarget["resource"],
			sheetId: "table-a",
		};

		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		await waitUntil(() => service.getLatestReviewSummary(target).state !== "pending");

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "ready");
		assert.equal(summary.resource.toString(), resource.toString());
		assert.equal(summary.reviewSignature?.includes("[object Object]"), false);

		const review = await service.reviewUri(target);
		assert.equal(review.resource.toString(), resource.toString());
		assert.equal(review.result?.resource?.toString(), resource.toString());
		assert.equal(review.reviewSignature?.includes("[object Object]"), false);
	});

	test("does not expose the default sheet id when the URI review target has no sheet", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			store.add(new TestTableModelService(resource)),
		);
		const target = { resource };

		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		await waitUntil(() => service.getLatestReviewSummary(target).state !== "pending");

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "ready");
		assert.equal(summary.sheetId, undefined);

		const uriReview = await service.reviewUri(target);
		assert.equal(uriReview.sheetId, undefined);
		assert.equal(uriReview.summary.sheetId, undefined);
		assert.equal(uriReview.result?.sheetId, undefined);
	});

	test("does not fall back to another sheet when a URI review sheet target is missing", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			store.add(new TestTableModelService(resource, [], "table-a")),
		);
		const target = {
			resource,
			sheetId: "missing-sheet",
		};

		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		await waitUntil(() => service.getLatestReviewSummary(target).state !== "pending");

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "invalid");
		assert.deepEqual(summary.findingCodes, ["review.sheetNotFound"]);

		const manualResult = await service.reviewUriManualTemplate({
			target,
			selection: {
				kind: "inline",
				template: createTemplate(),
			},
		});
		assert.equal(manualResult.kind, "invalid");
		if (manualResult.kind === "invalid") {
			assert.deepEqual(manualResult.diagnostics.map(diagnostic => diagnostic.code), ["review.manual.sheetNotFound"]);
		}
	});

	test("marks cached URI reviews stale when review inputs change", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			store.add(new TestTableModelService(resource)),
		);
		const target = {
			resource,
			sheetId: "table-a",
		};
		await waitUntil(() => service.getLatestReviewSummary(target).state === "ready");

		recipeService.setFingerprint("recipe:changed");

		const staleSummary = service.getLatestReviewSummary(target);
		assert.equal(staleSummary.state, "stale");
		assert.equal(staleSummary.findingCodes.includes("review.stale"), true);
		assert.equal(staleSummary.templateFingerprint, undefined);

		const staleReview = service.getLatestReview(target);
		assert.equal(staleReview?.summary.state, "stale");
		assert.equal(staleReview?.result, undefined);
		assert.equal(staleReview?.reviewSignature, undefined);

		await waitUntil(() => service.getLatestReviewSummary(target).state === "ready");
		assert.equal(service.getLatestReview(target)?.summary.state, "ready");
	});

	test("carries URI parser diagnostics into review summaries", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Malformed.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			store.add(new TestTableModelService(resource, [{
				code: "table.parser.MissingQuotes",
				message: "Quoted field unterminated.",
				rowIndex: 1,
				severity: "fatal",
			}])),
		);

		const target = { resource };
		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		await waitUntil(() => service.getLatestReviewSummary(target).state !== "pending");

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "invalid");
		assert.deepEqual(summary.findingCodes, ["review.parserFatalDiagnostic"]);
		assert.equal(summary.message, "Review candidates are invalid.");

		const uriReview = await service.reviewUri(target);
		assert.equal(uriReview.result?.reviews.some(review =>
			review.findings.some(finding => finding.code === "review.parserFatalDiagnostic")
		), true);
	});

	test("does not treat recoverable URI parser errors as fatal review findings", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Recoverable.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			store.add(new TestTableModelService(resource, [{
				code: "table.parser.BadRow",
				message: "A row was recovered with fewer cells.",
				rowIndex: 2,
				severity: "error",
			}])),
		);

		const target = { resource };
		await waitUntil(() => service.getLatestReviewSummary(target).state !== "pending");

		const summary = service.getLatestReviewSummary(target);
		assert.notEqual(summary.state, "invalid");
		assert.equal(summary.findingCodes.includes("review.parserFatalDiagnostic"), false);

		const uriReview = await service.reviewUri(target);
		assert.equal(uriReview.result?.reviews.some(review =>
			review.findings.some(finding => finding.code === "review.parserFatalDiagnostic")
		), false);
	});

});

const builtinRecipeSnapshot = createRecipeSnapshot(builtinRecipes);

const getBuiltinRecipe = (id: string): Recipe => {
	const recipe = builtinRecipeSnapshot.recipes.find(candidate => candidate.id === id);
	assert.ok(recipe);
	return recipe;
};

class TestRecipeService extends Disposable implements IRecipeService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeRecipesEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeRecipes = this.onDidChangeRecipesEmitter.event;
	private fingerprint: string;
	private version = 1;

	public constructor(
		fingerprint: string,
		private readonly recipes: readonly Recipe[] = builtinRecipeSnapshot.recipes,
	) {
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
			recipes: this.recipes,
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

class TestTableModelService extends Disposable implements ITableModelService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeModelEmitter = this._register(new Emitter<ITableModel>());
	public readonly onDidChangeModel = this.onDidChangeModelEmitter.event;
	private readonly model: TableContentModel;

	public constructor(
		private readonly resource: URI,
		private readonly diagnostics: readonly TableParseDiagnostic[] = [],
		private readonly fixedSheetId: string | null = null,
	) {
		super();
		this.model = this._register(new TableContentModel(resource));
	}

	public canHandleResource(resource: URI): boolean {
		return resource.toString() === this.resource.toString();
	}

	public async createModelReference(
		resource: URI,
		source?: TableSource | null,
	): Promise<ITableModelReference> {
		if (!this.canHandleResource(resource)) {
			throw new Error(`Unsupported test table resource: ${resource.toString()}`);
		}

		await this.resolveModel(source);
		return {
			object: this.model,
			dispose: () => undefined,
		};
	}

	public get(resource: URI | null | undefined): ITableModel | undefined {
		return resource && this.canHandleResource(resource)
			? this.model
			: undefined;
	}

	public registerContentProvider(provider: ITableModelContentProvider): { dispose(): void } {
		return {
			dispose: () => {
				provider.dispose();
			},
		};
	}

	public resolve(resource: URI, source?: TableSource | null): void {
		if (!this.canHandleResource(resource)) {
			return;
		}

		void this.resolveModel(source);
	}

	private async resolveModel(source?: TableSource | null): Promise<void> {
		if (this.model.getSnapshot().loadState.state === "ready") {
			return;
		}

		const content = createTestTableModelContent();
		const sheetId = this.fixedSheetId ?? String(source?.sheetId ?? "table-a");
		await this.model.resolve({
			resolveContent: async () => ({
				content,
				diagnostics: this.diagnostics,
				format: "csv",
				resource: this.resource,
				sheets: [{
					content,
					sheetId,
					sheetName: null,
				}],
				sourceVersion: 1,
			}),
		});
		this.onDidChangeModelEmitter.fire(this.model);
	}
}

const waitUntil = async (
	condition: () => boolean,
): Promise<void> => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (condition()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 0));
	}
	assert.fail("Timed out waiting for condition.");
};

const createTestTableModelContent = (): TableModelContentSnapshot => ({
	columnCount: 2,
	maxCellLengths: [2, 2],
	rowCount: 3,
	rows: [
		["Vg", "Id"],
		["0", "1"],
		["1", "2"],
	],
});

const createReviewEvidence = (): ReviewEvidence => ({
	sourceMetadata: {
		fileName: "Transfer.csv",
		rowCount: 3,
		columnCount: 2,
	},
	tableProjection: {
		structure: createEmptyTableProjectionStructure(),
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
	},
});

const createTemplate = (
	overrides: Partial<Template> = {},
): Template => ({
	schemaVersion: 1,
	id: "template-inline",
	name: "Transfer",
	version: 1,
	blocks: [{
		rowRange: {
			startRow: 1,
			endRow: 2,
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
			kind: "none",
		},
		legend: {
			target: "auto",
		},
	}],
	stopOnError: false,
	...overrides,
});
