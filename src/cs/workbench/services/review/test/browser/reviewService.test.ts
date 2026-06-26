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
import { TABLE_MODEL_RULE_VERSION, type TableModelRecord } from "src/cs/workbench/services/tableModel/common/tableModel";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";
import type { FileImportResult, ImportedFileRecord } from "src/cs/workbench/services/files/common/files";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import type { IRecipeService, Recipe, RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import { ReviewService } from "src/cs/workbench/services/review/browser/reviewService";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import { TableModel as TableContentModel, type ITableModel, type TableModelContentSnapshot } from "src/cs/workbench/services/table/common/model";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	ITableModelContentProvider,
	ITableModelReference,
	ITableModelService,
} from "src/cs/workbench/services/table/common/resolverService";
import { TableModelProducerService } from "src/cs/workbench/services/tableModel/browser/tableModelService";
import { TemplateMaterializationService } from "src/cs/workbench/services/template/browser/templateMaterializationService";
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
		sessionService: SessionService,
		recipeService: IRecipeService,
		userTemplateService: IUserTemplateService,
		tableModelService?: ITableModelService,
		tableModelProducerService?: TableModelProducerService,
	) => store.add(new ReviewService(
		sessionService,
		recipeService,
		userTemplateService,
		new TemplateMaterializationService(),
		tableModelService,
		tableModelProducerService,
	));

	test("derives recipe candidates into a system-recommended review decision", () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const service = createReviewServiceForTest(sessionService, recipeService, userTemplateService);

		const result = service.deriveAndReview({
			tableModel: createTableModel(),
			columnCount: 2,
			fileName: "Transfer.csv",
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.recipeFingerprint, "recipe:first");
		assert.equal(result.reviewPolicyVersion, 2);
		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.application.kind, "systemRecommended");
		assert.equal(result.decision.kind === "ready" && result.decision.reviewedTemplate.source.kind, "recipe");
	});

	test("uses the Review decision application as the system application gate", () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const service = createReviewServiceForTest(sessionService, recipeService, userTemplateService);

		const result = service.deriveAndReview({
			tableModel: createTableModel(),
			columnCount: 2,
			fileName: "Transfer.csv",
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.application.kind, "systemRecommended");
		assert.equal(result.decision.kind === "ready" && result.decision.application.reason, "review.ready.systemRecommended");
	});

	test("derives user template candidates from the user template snapshot", async () => {
		const template = createTemplate({
			id: "template-a",
			applicability: {
				schemaFingerprint: createEmptyRawTableStructure().fingerprint,
				columnCount: 2,
			},
		});
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:none", []));
		const userTemplateService = createUserTemplateServiceForTest();
		await userTemplateService.createTemplate({
			id: "template-a",
			name: "Transfer",
			template,
		});
		const service = createReviewServiceForTest(sessionService, recipeService, userTemplateService);

		const result = service.deriveAndReview({
			tableModel: createTableModel(),
			columnCount: 2,
			fileName: "Transfer.csv",
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.userTemplateCatalogVersion, 1);
		assert.equal(result.candidates[0]?.source.kind, "userTemplate");
		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.reviewedTemplate.source.kind, "userTemplate");
	});

	test("requires user action when Review confidence is below the system recommendation threshold", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:none", []));
		const userTemplateService = createUserTemplateServiceForTest();
		await userTemplateService.createTemplate({
			id: "template-a",
			name: "Transfer",
			template: createTemplate({ id: "template-a" }),
		});
		const service = createReviewServiceForTest(sessionService, recipeService, userTemplateService);

		const result = service.deriveAndReview({
			tableModel: createTableModel(),
			columnCount: 2,
			fileName: "Transfer.csv",
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.application.kind, "userActionRequired");
		assert.equal(result.decision.kind === "ready" && result.decision.application.reason, "review.ready.lowConfidence");
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
			store.add(new TableModelProducerService()),
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
		assert.equal(summary.message, "Template is ready and recommended for system application.");
		assert.deepEqual(summary.findingCodes, []);
		assert.equal(typeof summary.confidence, "number");
		assert.equal(Boolean(summary.reviewSignature), true);
		assert.equal(Boolean(summary.templateFingerprint), true);
	});

	test("reviews inline manual templates as ready", () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const service = createReviewServiceForTest(sessionService, recipeService, userTemplateService);
		sessionService.commitFileImport(createImportResult());
		sessionService.commitTableModel(createTableModel());

		const result = service.reviewManualTemplate({
			ref: { fileId: "file-a", rawTableId: "table-a" },
			selection: {
				kind: "inline",
				template: createTemplate(),
			},
		});

		assert.equal(result.kind, "ready");
		assert.equal(result.kind === "ready" && result.reviewedTemplate.source.kind, "inline");
	});

	test("reviews saved manual selections through user templates as ready", async () => {
		const template = createTemplate({ id: "template-a", name: "Saved Transfer" });
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		await userTemplateService.createTemplate({
			id: "template-a",
			name: "Saved Transfer",
			template,
		});
		const service = createReviewServiceForTest(sessionService, recipeService, userTemplateService);
		sessionService.commitFileImport(createImportResult());
		sessionService.commitTableModel(createTableModel());

		const result = service.reviewManualTemplate({
			ref: { fileId: "file-a", rawTableId: "table-a" },
			selection: {
				kind: "savedTemplate",
				templateId: "template-a",
			},
		});

		assert.equal(result.kind, "ready");
		assert.equal(result.kind === "ready" && result.reviewedTemplate.source.kind, "userTemplate");
		assert.equal(
			result.kind === "ready" &&
				result.reviewedTemplate.source.kind === "userTemplate" &&
				result.reviewedTemplate.source.templateId,
			"template-a",
		);
	});

	test("returns structured invalid result when a manual saved template is missing", () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const service = createReviewServiceForTest(sessionService, recipeService, userTemplateService);
		sessionService.commitFileImport(createImportResult());
		sessionService.commitTableModel(createTableModel());

		const result = service.reviewManualTemplate({
			ref: { fileId: "file-a", rawTableId: "table-a" },
			selection: {
				kind: "savedTemplate",
				templateId: "missing-template",
			},
		});

		if (result.kind !== "invalid") {
			assert.fail(`Expected invalid manual review result, got ${result.kind}.`);
		}
		assert.equal(result.diagnostics[0]?.code, "review.manual.templateNotFound");
	});

	test("reviews user templates through the user template service", async () => {
		const template = createTemplate({ id: "user-template-a", name: "User Transfer" });
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		await userTemplateService.createTemplate({
			id: "user-template-a",
			name: "User Transfer",
			template,
		});
		const service = createReviewServiceForTest(sessionService, recipeService, userTemplateService);
		sessionService.commitFileImport(createImportResult());
		sessionService.commitTableModel(createTableModel());

		const result = service.reviewManualTemplate({
			ref: { fileId: "file-a", rawTableId: "table-a" },
			selection: {
				kind: "userTemplate",
				templateId: "user-template-a",
			},
		});

		if (result.kind !== "ready") {
			assert.fail(`Expected ready manual review result, got ${result.kind}.`);
		}
		assert.equal(result.reviewedTemplate.source.kind, "userTemplate");
		assert.equal(
			result.reviewedTemplate.source.kind === "userTemplate" &&
				result.reviewedTemplate.source.templateId,
			"user-template-a",
		);
	});

	test("returns structured adjustment result for manual template bounds issues", () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const service = createReviewServiceForTest(sessionService, recipeService, userTemplateService);
		sessionService.commitFileImport(createImportResult());
		sessionService.commitTableModel(createTableModel());

		const result = service.reviewManualTemplate({
			ref: { fileId: "file-a", rawTableId: "table-a" },
			selection: {
				kind: "inline",
				template: createTemplate({
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
							columns: [5],
							unit: "A",
						},
						segmentation: {
							kind: "none",
						},
						legend: {
							target: "auto",
						},
					}],
				}),
			},
		});

		if (result.kind !== "needsManualAdjustment") {
			assert.fail(`Expected adjustment manual review result, got ${result.kind}.`);
		}
		assert.equal(result.diagnostics[0]?.code, "review.manual.yAxisOutOfBounds");
	});
});

class TestRecipeService extends Disposable implements IRecipeService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeRecipesEmitter = this._register(new Emitter<void>());
	public readonly onDidChangeRecipes = this.onDidChangeRecipesEmitter.event;
	private fingerprint: string;
	private version = 1;

	public constructor(
		fingerprint: string,
		private readonly recipes: readonly Recipe[] = builtinRecipes,
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
		const sheetId = String(source?.sheetId ?? "table-a");
		await this.model.resolve({
			resolveContent: async () => ({
				content,
				format: "csv",
				sheets: [{
					content,
					sheetId,
					sheetKey: `${this.resource.toString()}::${encodeURIComponent(sheetId)}`,
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

const createTableModel = (
	overrides: Partial<TableModelRecord> = {},
): TableModelRecord => ({
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
	...overrides,
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
