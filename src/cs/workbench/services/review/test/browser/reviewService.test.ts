/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import { DataResourceService } from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import type {
	DataResourceStructuredContentResolution,
	IDataResourceService,
	IDataResourceStructuredContentReference,
} from "src/cs/workbench/services/dataResource/common/dataResource";
import {
	createEmptyStructuredContentStructure,
	type StructuredColumnProfile,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import { builtinRecipes } from "cs/workbench/services/recipes/common/builtinRecipes.generated";
import type { IRecipeService, Recipe, RecipeSnapshot } from "cs/workbench/services/recipes/common/recipe";
import { createRecipeSnapshot } from "cs/workbench/services/recipes/common/recipeCodec";
import { ReviewService } from "src/cs/workbench/services/review/browser/reviewService";
import type {
	ReviewEvidence,
	ReviewSummaryTarget,
	ReviewedTemplate,
} from "src/cs/workbench/services/review/common/reviewModel";
import { deriveReviewResult } from "src/cs/workbench/services/review/common/reviewDecision";
import type {
	ISchemaProfileService,
	SchemaProfile,
	SchemaProfileSnapshot,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	createSchemaProfileFromConfirmation,
	type ConfirmSchemaProfileInput,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";
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
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
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
		dataResourceService?: IDataResourceService,
		schemaProfileService?: ISchemaProfileService,
	) => store.add(new ReviewService(
		recipeService,
		userTemplateService,
		dataResourceService,
		schemaProfileService,
	));
	const createDataResourceServiceForTest = (
		resource: URI,
		diagnostics: readonly TableParseDiagnostic[] = [],
		fixedSheetId: string | null = null,
		content: TableModelContentSnapshot = createTestTableModelContent(),
	): IDataResourceService =>
		store.add(new DataResourceService(store.add(new TestTableModelService(resource, diagnostics, fixedSheetId, content))));
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
		assert.equal(result.reviewPolicyVersion, 11);
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

	test("uses exact schema profile matches as review semantic evidence", () => {
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([createSchemaProfile()]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.exactFingerprint"), true);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.bindingMatched"), true);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.bindingIncomplete"), false);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.96);
	});

	test("prefers exact schema profile matches over similar profile matches", () => {
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([
				createSchemaProfile({
					id: "schema:older",
					schemaFingerprint: "schema-older",
				}),
				createSchemaProfile(),
			]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.exactFingerprint"), true);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.similarSchema"), false);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.96);
	});

	test("uses similar schema profile matches only as manual-assist review evidence", () => {
		const recipeService = store.add(new TestRecipeService("recipe:first", [createLowConfidenceTransferRecipeForTest()]));
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns({
				blockConfidence: 0.75,
				fingerprint: "schema-b",
			}),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([createSchemaProfile({
				id: "schema:older",
				schemaFingerprint: "schema-a",
			})]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.exactFingerprint"), false);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.similarSchema"), true);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.bindingIncomplete"), false);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.75);
		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.application.kind, "userActionRequired");
	});

	test("does not use similar schema profile matches to bypass conflicted exact profiles", () => {
		const recipeService = store.add(new TestRecipeService("recipe:first", [createLowConfidenceTransferRecipeForTest()]));
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns({
				blockConfidence: 0.75,
				fingerprint: "schema-b",
			}),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([
				createSchemaProfile({
					conflictCount: 1,
					id: "schema:conflicted-current",
					schemaFingerprint: "schema-b",
				}),
				createSchemaProfile({
					id: "schema:older",
					schemaFingerprint: "schema-a",
				}),
			]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.similarSchema"), false);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.75);
	});

	test("does not boost review scoring for incomplete exact schema profile bindings", () => {
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([createSchemaProfile({
				bindings: [{
					selector: {
						columnIndex: 0,
						normalizedHeader: "vg",
					},
					role: "vg",
					axis: "x",
					canonicalUnit: "V",
				}],
			})]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.exactFingerprint"), true);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.bindingMatched"), false);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.bindingIncomplete"), true);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.95);
	});

	test("ignores conflicted schema profile matches for review scoring", () => {
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			recipeSnapshot: recipeService.getSnapshot(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([createSchemaProfile({ conflictCount: 1 })]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.exactFingerprint"), false);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.95);
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
				schemaFingerprint: createEmptyStructuredContentStructure().fingerprint,
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

	test("returns latest review summaries for URI-backed structured content", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			createDataResourceServiceForTest(resource),
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

	test("derives IV output review from explicit drain voltage URI content", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Output.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["Vd", "Id"],
				["0", "1"],
				["1", "2"],
			])),
		);

		const target = {
			resource,
			sheetId: "table-a",
		};
		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		await waitUntil(() => service.getLatestReviewSummary(target).state !== "pending");

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "ready");
		assert.equal(summary.reviewedSemanticLabel, "Detected IV Output");

		const uriReview = await service.reviewUri(target);
		assert.equal(uriReview.result?.reviewedTemplate?.template.measurement?.curveFamily, "iv");
		assert.equal(uriReview.result?.reviewedTemplate?.template.measurement?.ivMode, "output");
	});

	test("does not auto-select IV mode from generic voltage URI content", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Instrument.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["Voltage", "Current"],
				["0", "1"],
				["1", "2"],
			])),
		);

		const target = {
			resource,
			sheetId: "table-a",
		};
		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		await waitUntil(() => service.getLatestReviewSummary(target).state !== "pending");

		const summary = service.getLatestReviewSummary(target);
		assert.deepEqual({
			findingCodes: summary.findingCodes,
			reviewedSemanticLabel: summary.reviewedSemanticLabel,
			state: summary.state,
		}, {
			findingCodes: ["review.noCandidates"],
			reviewedSemanticLabel: undefined,
			state: "invalid",
		});

		const uriReview = await service.reviewUri(target);
		assert.equal(uriReview.result?.reviewedTemplate, undefined);
	});

	test("keeps latest review summary reads off structured-content resolution", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const dataResourceService = store.add(new CountingDataResourceService(
			createDataResourceServiceForTest(resource),
		));
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			dataResourceService,
		);
		const target = {
			resource,
			sheetId: "table-a",
		};

		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		assert.equal(dataResourceService.getStructuredContentCalls, 0);
		assert.equal(dataResourceService.resolveStructuredContentCalls, 0);

		await waitUntil(() => service.getLatestReviewSummary(target).state === "ready");
		const getStructuredContentCalls = dataResourceService.getStructuredContentCalls;
		const resolveStructuredContentCalls = dataResourceService.resolveStructuredContentCalls;

		assert.equal(service.getLatestReviewSummary(target).state, "ready");
		assert.equal(service.getLatestReviewSummary(target).state, "ready");
		assert.equal(dataResourceService.getStructuredContentCalls, getStructuredContentCalls);
		assert.equal(dataResourceService.resolveStructuredContentCalls, resolveStructuredContentCalls);
	});

	test("bounds background URI review targets retained for cache refresh", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const dataResourceService = store.add(new ResolvingDataResourceService());
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			dataResourceService,
		);

		for (let index = 0; index < 520; index += 1) {
			service.getLatestReviewSummary({
				resource: URI.file(`/workspace/table-${index}.csv`),
			});
		}

		await waitUntil(() => dataResourceService.resolveStructuredContentCalls === 512);
		recipeService.setFingerprint("recipe:changed");
		await waitUntil(() => dataResourceService.resolveStructuredContentCalls === 1024);
	});

	test("reruns URI review when a resource changes while background review is pending", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const dataResourceService = store.add(new ControlledDataResourceService());
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			dataResourceService,
		);
		const target = {
			resource,
			sheetId: "table-a",
		};

		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		await waitUntil(() => dataResourceService.resolveStructuredContentCalls === 1);
		dataResourceService.fireDidChangeResource(resource);
		dataResourceService.resolveNext({
			kind: "missingContent",
		});

		await waitUntil(() => dataResourceService.resolveStructuredContentCalls === 2);
		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		dataResourceService.resolveNext({
			kind: "missingContent",
		});

		await waitUntil(() => service.getLatestReviewSummary(target).state === "invalid");
		assert.equal(dataResourceService.resolveStructuredContentCalls, 2);
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
			createDataResourceServiceForTest(resource),
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
			createDataResourceServiceForTest(resource),
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
			createDataResourceServiceForTest(resource, [], "table-a"),
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
			createDataResourceServiceForTest(resource),
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

	test("marks cached URI reviews stale when schema profiles change", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const schemaProfileService = store.add(new TestSchemaProfileService());
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			createDataResourceServiceForTest(resource),
			schemaProfileService,
		);
		const target = {
			resource,
			sheetId: "table-a",
		};
		await waitUntil(() => service.getLatestReviewSummary(target).state === "ready");

		schemaProfileService.setSnapshot(createSchemaProfileSnapshot([createSchemaProfile()]));

		const staleSummary = service.getLatestReviewSummary(target);
		assert.equal(staleSummary.state, "stale");
		assert.equal(staleSummary.findingCodes.includes("review.stale"), true);

		await waitUntil(() => service.getLatestReviewSummary(target).state === "ready");
		assert.equal(service.getLatestReview(target)?.summary.state, "ready");
	});

	test("confirms reviewed templates into schema profiles from structured content", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const schemaProfileService = store.add(new TestSchemaProfileService());
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			createDataResourceServiceForTest(resource),
			schemaProfileService,
		);
		const review = await service.reviewUri({
			resource,
			sheetId: "table-a",
		});
		const reviewedTemplate = review.result?.reviewedTemplate;
		assert.ok(reviewedTemplate);
		assert.equal(schemaProfileService.confirmations.length, 0);

		const profile = await service.confirmReviewedTemplate({
			target: {
				resource,
				sheetId: "table-a",
			},
			reviewedTemplate,
			reason: "manualTemplate",
		});

		assert.ok(profile);
		assert.equal(schemaProfileService.confirmations.length, 1);
		assert.deepEqual(profile.bindings, [{
			selector: {
				columnIndex: 0,
				normalizedHeader: "vg",
			},
			role: "vg",
			axis: "x",
			canonicalUnit: "V",
		}, {
			selector: {
				columnIndex: 1,
				normalizedHeader: "id",
			},
			role: "id",
			axis: "y",
			canonicalUnit: "A",
		}]);
	});

	test("does not learn schema profiles from automatic URI review derivation", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const schemaProfileService = store.add(new TestSchemaProfileService());
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			createDataResourceServiceForTest(resource),
			schemaProfileService,
		);

		await service.reviewUri({
			resource,
			sheetId: "table-a",
		});

		assert.equal(schemaProfileService.confirmations.length, 0);
		assert.deepEqual(schemaProfileService.getProfiles(), []);
	});

	test("returns null when reviewed template confirmation cannot resolve content", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const schemaProfileService = store.add(new TestSchemaProfileService());
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			createDataResourceServiceForTest(URI.file("/workspace/Transfer.csv")),
			schemaProfileService,
		);

		const profile = await service.confirmReviewedTemplate({
			target: {
				resource: URI.file("/workspace/Missing.csv"),
			},
			reviewedTemplate: createReviewedTemplateForTest(),
			reason: "manualTemplate",
		});

		assert.equal(profile, null);
		assert.equal(schemaProfileService.confirmations.length, 0);
	});

	test("returns null when reviewed template columns cannot be mapped to structured roles", async () => {
		const sessionService = store.add(new SessionService());
		const recipeService = store.add(new TestRecipeService("recipe:first"));
		const userTemplateService = createUserTemplateServiceForTest();
		const schemaProfileService = store.add(new TestSchemaProfileService());
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			sessionService,
			recipeService,
			userTemplateService,
			createDataResourceServiceForTest(resource),
			schemaProfileService,
		);

		const profile = await service.confirmReviewedTemplate({
			target: {
				resource,
				sheetId: "table-a",
			},
			reviewedTemplate: createReviewedTemplateForTest(createTemplate({
				blocks: [{
					rowRange: {
						startRow: 1,
						endRow: 2,
					},
					x: {
						columns: [99],
						unit: "V",
					},
					y: {
						columns: [100],
						unit: "A",
					},
					segmentation: {
						kind: "none",
					},
					legend: {
						target: "auto",
					},
				}],
			})),
			reason: "manualTemplate",
		});

		assert.equal(profile, null);
		assert.equal(schemaProfileService.confirmations.length, 0);
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
			createDataResourceServiceForTest(resource, [{
				code: "table.parser.MissingQuotes",
				message: "Quoted field unterminated.",
				rowIndex: 1,
				severity: "fatal",
			}]),
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
			createDataResourceServiceForTest(resource, [{
				code: "table.parser.BadRow",
				message: "A row was recovered with fewer cells.",
				rowIndex: 2,
				severity: "error",
			}]),
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

const createLowConfidenceTransferRecipeForTest = (): Recipe => {
	const recipe = getBuiltinRecipe("builtin.iv.transfer");
	assert.ok(recipe.domain);
	return {
		...recipe,
		domain: {
			...recipe.domain,
			minConfidence: 0.3,
		},
	};
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

class TestSchemaProfileService extends Disposable implements ISchemaProfileService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeSchemaProfilesEmitter = this._register(new Emitter<SchemaProfileSnapshot>());
	public readonly onDidChangeSchemaProfiles = this.onDidChangeSchemaProfilesEmitter.event;
	public readonly confirmations: ConfirmSchemaProfileInput[] = [];

	private snapshot: SchemaProfileSnapshot = createSchemaProfileSnapshot([]);

	public setSnapshot(snapshot: SchemaProfileSnapshot): void {
		this.snapshot = snapshot;
		this.onDidChangeSchemaProfilesEmitter.fire(snapshot);
	}

	public clearProfiles(): void {
		this.setSnapshot(createSchemaProfileSnapshot([]));
	}

	public confirmProfile(input: Parameters<ISchemaProfileService["confirmProfile"]>[0]): SchemaProfile | null {
		const profile = createSchemaProfileFromConfirmation(input);
		if (!profile) {
			return null;
		}

		this.confirmations.push(input);
		this.upsertProfile(profile);
		return profile;
	}

	public getProfiles(): readonly SchemaProfile[] {
		return this.snapshot.profiles;
	}

	public getSnapshot(): SchemaProfileSnapshot {
		return this.snapshot;
	}

	public getVersion(): number {
		return this.snapshot.version;
	}

	public removeProfile(profileId: string): void {
		this.setSnapshot({
			version: this.snapshot.version + 1,
			profiles: this.snapshot.profiles.filter(profile => profile.id !== profileId),
		});
	}

	public upsertProfile(profile: SchemaProfile): SchemaProfile {
		this.setSnapshot({
			version: this.snapshot.version + 1,
			profiles: [
				...this.snapshot.profiles.filter(candidate => candidate.id !== profile.id),
				profile,
			],
		});
		return profile;
	}
}

class CountingDataResourceService extends Disposable implements IDataResourceService {
	public declare readonly _serviceBrand: undefined;

	public readonly onDidChangeResource: IDataResourceService["onDidChangeResource"];
	public getStructuredContentCalls = 0;
	public resolveStructuredContentCalls = 0;
	private readonly delegate: IDataResourceService;

	public constructor(
		delegate: IDataResourceService,
	) {
		super();
		this.delegate = delegate;
		this.onDidChangeResource = delegate.onDidChangeResource;
	}

	public canHandleResource(
		resource: Parameters<IDataResourceService["canHandleResource"]>[0],
	): ReturnType<IDataResourceService["canHandleResource"]> {
		return this.delegate.canHandleResource(resource);
	}

	public resolveStructuredContent(
		target: Parameters<IDataResourceService["resolveStructuredContent"]>[0],
	): ReturnType<IDataResourceService["resolveStructuredContent"]> {
		this.resolveStructuredContentCalls += 1;
		return this.delegate.resolveStructuredContent(target);
	}

	public getStructuredContent(
		target: Parameters<IDataResourceService["getStructuredContent"]>[0],
	): ReturnType<IDataResourceService["getStructuredContent"]> {
		this.getStructuredContentCalls += 1;
		return this.delegate.getStructuredContent(target);
	}

	public resolve(
		target: Parameters<IDataResourceService["resolve"]>[0],
	): ReturnType<IDataResourceService["resolve"]> {
		return this.delegate.resolve(target);
	}
}

class ResolvingDataResourceService extends Disposable implements IDataResourceService {
	public declare readonly _serviceBrand: undefined;

	public readonly onDidChangeResource = Event.None as IDataResourceService["onDidChangeResource"];
	public resolveStructuredContentCalls = 0;

	public canHandleResource(): boolean {
		return true;
	}

	public async resolveStructuredContent(): Promise<IDataResourceStructuredContentReference> {
		this.resolveStructuredContentCalls += 1;
		return {
			object: {
				kind: "missingContent",
			},
			dispose: () => undefined,
		};
	}

	public getStructuredContent(): ReturnType<IDataResourceService["getStructuredContent"]> {
		return undefined;
	}

	public resolve(): void {}
}

class ControlledDataResourceService extends Disposable implements IDataResourceService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeResourceEmitter = this._register(new Emitter<URI>());
	public readonly onDidChangeResource = this.onDidChangeResourceEmitter.event;
	public resolveStructuredContentCalls = 0;
	private readonly pendingResolvers: Array<(reference: IDataResourceStructuredContentReference) => void> = [];

	public canHandleResource(): boolean {
		return true;
	}

	public resolveStructuredContent(): Promise<IDataResourceStructuredContentReference> {
		this.resolveStructuredContentCalls += 1;
		return new Promise(resolve => {
			this.pendingResolvers.push(resolve);
		});
	}

	public getStructuredContent(): ReturnType<IDataResourceService["getStructuredContent"]> {
		return undefined;
	}

	public resolve(): void {}

	public fireDidChangeResource(resource: URI): void {
		this.onDidChangeResourceEmitter.fire(resource);
	}

	public resolveNext(resolution: DataResourceStructuredContentResolution): void {
		const resolve = this.pendingResolvers.shift();
		assert.ok(resolve, "Expected a pending structured-content resolution.");
		resolve({
			object: resolution,
			dispose: () => undefined,
		});
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
		private readonly content: TableModelContentSnapshot = createTestTableModelContent(),
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

		const sheetId = this.fixedSheetId ?? String(source?.sheetId ?? "table-a");
		await this.model.resolve({
			resolveContent: async () => ({
				content: this.content,
				diagnostics: this.diagnostics,
				format: "csv",
				resource: this.resource,
				sheets: [{
					content: this.content,
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

const createTestTableModelContent = (
	rows: readonly (readonly string[])[] = [
		["Vg", "Id"],
		["0", "1"],
		["1", "2"],
	],
): TableModelContentSnapshot => {
	const columnCount = rows.reduce((count, row) => Math.max(count, row.length), 0);
	return {
		columnCount,
		maxCellLengths: Array.from({ length: columnCount }, (_, column) =>
			rows.reduce((length, row) => Math.max(length, String(row[column] ?? "").length), 0)
		),
		rowCount: rows.length,
		rows,
	};
};

const createSchemaProfileSnapshot = (
	profiles: readonly SchemaProfile[],
	version = profiles.length,
): SchemaProfileSnapshot => ({
	version,
	profiles,
});

const createSchemaProfile = ({
	bindings = defaultSchemaProfileBindings,
	conflictCount = 0,
	confirmedCount = 1,
	id = "schema:schema-a",
	schemaFingerprint = "schema-a",
}: {
	readonly bindings?: SchemaProfile["bindings"];
	readonly conflictCount?: number;
	readonly confirmedCount?: number;
	readonly id?: string;
	readonly schemaFingerprint?: string;
} = {}): SchemaProfile => ({
	id,
	scope: "workspace",
	schemaFingerprint,
	confirmedCount,
	conflictCount,
	bindings,
});

const defaultSchemaProfileBindings: SchemaProfile["bindings"] = [{
	selector: {
		columnIndex: 0,
		normalizedHeader: "vg",
	},
	role: "vg",
	axis: "x",
	canonicalUnit: "V",
}, {
	selector: {
		columnIndex: 1,
		normalizedHeader: "id",
	},
	role: "id",
	axis: "y",
	canonicalUnit: "A",
}];

const createReviewEvidenceWithSchemaProfileColumns = ({
	blockConfidence = 0.95,
	fingerprint = "schema-a",
}: {
	readonly blockConfidence?: number;
	readonly fingerprint?: string;
} = {}): ReviewEvidence => {
	const evidence = createReviewEvidence();
	assert.ok(evidence.structuredContent);
	return {
		...evidence,
		structuredContent: {
			...evidence.structuredContent,
			structure: {
				...evidence.structuredContent.structure,
				fingerprint,
			},
			columnProfiles: createSchemaProfileColumnProfiles(),
			blocks: evidence.structuredContent.blocks.map(block => ({
				...block,
				confidence: blockConfidence,
			})),
		},
	};
};

const createSchemaProfileColumnProfiles = (): readonly StructuredColumnProfile[] => [{
	rawCol: 0,
	headerText: "Vg",
	normalizedHeader: "vg",
	kind: "numeric",
}, {
	rawCol: 1,
	headerText: "Id",
	normalizedHeader: "id",
	kind: "numeric",
}];

const createReviewEvidence = (): ReviewEvidence => ({
	sourceMetadata: {
		fileName: "Transfer.csv",
		rowCount: 3,
		columnCount: 2,
	},
	structuredContent: {
		structure: createEmptyStructuredContentStructure(),
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

const createReviewedTemplateForTest = (
	template = createTemplate(),
): ReviewedTemplate => {
	const templateFingerprint = createTemplateFingerprint(template);
	return {
		candidateId: "candidate:test",
		source: {
			kind: "inline",
		},
		template,
		templateFingerprint,
		review: {
			candidateId: "candidate:test",
			interpretationFingerprint: templateFingerprint,
			status: "ready",
			confidence: 1,
			factors: {
				selectorScore: 1,
				projectionScore: 1,
				semanticScore: 1,
				dataQualityScore: 1,
				parseHealthScore: 1,
				freshnessScore: 1,
				ambiguityPenalty: 0,
				conflictPenalty: 0,
				diagnosticPenalty: 0,
			},
			findings: [],
			reasons: [],
			diagnostics: [],
		},
	};
};
