/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	createRecipeReviewCandidate,
	deriveRecipeReviewCandidates,
	deriveUserTemplateReviewCandidates,
} from "src/cs/workbench/services/review/common/reviewCandidate";
import {
	scoreReviewCandidate,
} from "src/cs/workbench/services/review/common/reviewDecision";
import { evaluateReviewSelector } from "src/cs/workbench/services/review/common/reviewSelector";
import {
	createEmptyStructuredContentStructure,
	type StructuredMeasurementColumnRef as MeasurementColumnRef,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import { builtinRecipes } from "cs/workbench/services/recipes/common/builtinRecipes.generated";
import type { Recipe } from "cs/workbench/services/recipes/common/recipe";
import { createRecipeSnapshot } from "cs/workbench/services/recipes/common/recipeCodec";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { Template } from "src/cs/workbench/services/template/common/template";
import type { SegmentCandidate, ReviewContext, ReviewEvidence } from "src/cs/workbench/services/review/common/reviewModel";
import type {
	UserTemplate,
	UserTemplateSnapshot,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

suite("workbench/services/review/test/common/reviewCandidate", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("builds builtin IV transfer recipe into a review candidate", () => {
		const recipe = getBuiltinRecipe("builtin.iv.transfer");

		const evidence = createReviewEvidence();
		const context = createReviewContext(evidence);
		const evaluation = evaluateReviewSelector(recipe, evidence);
		const candidate = createRecipeReviewCandidate({
			context,
			recipe,
			evaluation,
		});

		assert.ok(candidate);
		assert.equal(candidate.source.kind, "builtin");
		assert.equal(candidate.source.kind === "builtin" && candidate.source.recipeId, "builtin.iv.transfer");
		assert.equal(candidate.projectionTrace.diagnostics.length, 0);
		assert.equal(candidate.interpretation.blocks.length, 1);
		assert.deepEqual(candidate.interpretation.blocks[0]?.rowRange, {
			startRow: 1,
			endRow: 3,
		});
		assert.deepEqual(candidate.interpretation.blocks[0]?.x, {
			columns: [0],
			unit: "V",
		});
		assert.deepEqual(candidate.interpretation.blocks[0]?.y, {
			columns: [1],
			unit: "A",
		});
		assert.deepEqual(candidate.interpretation.measurement, {
			curveFamily: "iv",
			ivMode: "transfer",
		});
		assert.equal(candidate.interpretation.blocks[0]?.segmentation.kind, "auto");
		assert.ok(candidate.interpretationFingerprint);
	});

	test("matches IV transfer candidates with generic instrument voltage/current headers", () => {
		const recipe = getBuiltinRecipe("builtin.iv.transfer");

		const evidence = createReviewEvidence({
			columns: [
				createColumn(0, "voltage", "V", "CH1 Voltage"),
				createColumn(1, "current", "A", "CH1 Current"),
			],
		});
		const context = createReviewContext(evidence);
		const candidate = createRecipeReviewCandidate({
			context,
			recipe,
			evaluation: evaluateReviewSelector(recipe, evidence),
		});

		assert.ok(candidate);
		assert.deepEqual(candidate.interpretation.blocks[0]?.x, {
			columns: [0],
			unit: "V",
		});
		assert.deepEqual(candidate.interpretation.blocks[0]?.y, {
			columns: [1],
			unit: "A",
		});
	});

	test("builds grouped XY IV recipe from series partition layout bindings", () => {
		const recipe = getBuiltinRecipe("builtin.iv.transfer.grouped");

		const evidence = createReviewEvidence({
			layoutKind: "groupedSweep",
			layoutBinding: {
				xCol: 2,
				yCols: [3],
				groupByCol: 0,
				pointCol: 1,
			},
			columns: [
				createColumn(2, "vg", "V"),
				createColumn(3, "id", "A"),
			],
		});
		const context = createReviewContext(evidence);
		const candidate = createRecipeReviewCandidate({
			context,
			recipe,
			evaluation: evaluateReviewSelector(recipe, evidence),
		});

		assert.ok(candidate);
		assert.equal(candidate.projectionTrace.diagnostics.length, 0);
		assert.deepEqual(candidate.interpretation.blocks[0]?.x, {
			columns: [2],
			unit: "V",
		});
		assert.deepEqual(candidate.interpretation.blocks[0]?.y, {
			columns: [3],
			unit: "A",
		});
		assert.equal(candidate.interpretation.blocks[0]?.legend.target, "group");
	});

	test("keeps compatible user templates as ready review candidates", () => {
		const candidates = deriveUserTemplateReviewCandidates({
			context: createReviewContext(createReviewEvidence()),
			userTemplateSnapshot: createUserTemplateSnapshot([createUserTemplate({
				...createTemplate(),
				id: "template-a",
				version: 3,
				applicability: {
					schemaFingerprint: "schema-a",
					columnCount: 2,
				},
			})]),
		});

		assert.equal(candidates.length, 1);
		assert.equal(candidates[0]?.source.kind, "user");
		assert.equal(candidates[0]?.source.kind === "user" && candidates[0].source.templateId, "template-a");
		assert.equal(candidates[0]?.projectionTrace.diagnostics.length, 0);
		assert.equal(candidates[0]?.confidence, 0.95);
		assert.notEqual(candidates[0]?.interpretationFingerprint, createTemplateFingerprint(candidates[0]?.interpretation as Template));
		assert.equal(candidates[0]?.interpretationFingerprint.startsWith("review-interpretation:"), true);
	});

	test("treats missing URI candidate versions as stale", () => {
		const recipe = getBuiltinRecipe("builtin.iv.transfer");

		const evidence = createReviewEvidence();
		const context = createReviewContext(evidence);
		const candidate = createRecipeReviewCandidate({
			context,
			recipe,
			evaluation: evaluateReviewSelector(recipe, evidence),
		});
		assert.ok(candidate);
		const { modelVersion, ...candidateWithoutModelVersion } = candidate;
		assert.equal(modelVersion, 3);

		const staleReview = scoreReviewCandidate({
			candidate: candidateWithoutModelVersion,
			context,
		});

		assert.equal(staleReview.status, "invalid");
		assert.equal(staleReview.findings.some(finding => finding.code === "review.staleModelVersion"), true);
	});

	test("treats mismatched URI content hashes as stale", () => {
		const recipe = getBuiltinRecipe("builtin.iv.transfer");

		const evidence = createReviewEvidence();
		const context = createReviewContext(evidence, { contentHash: "sha256:first" });
		const candidate = createRecipeReviewCandidate({
			context,
			recipe,
			evaluation: evaluateReviewSelector(recipe, evidence),
		});
		assert.ok(candidate);

		const staleReview = scoreReviewCandidate({
			candidate,
			context: {
				...context,
				contentHash: "sha256:second",
			},
		});

		assert.equal(staleReview.status, "invalid");
		assert.equal(staleReview.findings.some(finding => finding.code === "review.staleContentHash"), true);
	});

	test("exports review candidates as segment candidates for the content-first pipeline", () => {
		const recipe = getBuiltinRecipe("builtin.iv.transfer");

		const evidence = createReviewEvidence();
		const context = createReviewContext(evidence, { contentHash: "sha256:first" });
		const candidate = createRecipeReviewCandidate({
			context,
			recipe,
			evaluation: evaluateReviewSelector(recipe, evidence),
		});
		assert.ok(candidate);
		const segmentCandidate: SegmentCandidate = candidate;

		assert.ok(segmentCandidate);
		assert.equal(segmentCandidate.contentHash, "sha256:first");
		assert.equal(segmentCandidate.evidenceFingerprint, "evidence:test");
	});

	test("orders matching recipe candidates by recipe priority", () => {
		const recipe = getBuiltinRecipe("builtin.iv.transfer");
		const candidates = deriveRecipeReviewCandidates({
			context: createReviewContext(createReviewEvidence()),
			recipeSnapshot: {
				version: 1,
				fingerprint: "recipe:test",
				diagnostics: [],
				recipes: [
					{
						...recipe,
						id: "workspace.low",
						priority: 1,
					},
					{
						...recipe,
						id: "workspace.high",
						priority: 200,
					},
				],
			},
		});

		assert.equal(candidates.length, 2);
		assert.equal(candidates[0]?.source.kind === "builtin" && candidates[0].source.recipeId, "workspace.high");
		assert.equal(candidates[0]?.providerRank, 200);
		assert.equal(candidates[1]?.source.kind === "builtin" && candidates[1].source.recipeId, "workspace.low");
	});

	test("rejects user templates with mismatched applicability", () => {
		const candidates = deriveUserTemplateReviewCandidates({
			context: createReviewContext(createReviewEvidence()),
			userTemplateSnapshot: createUserTemplateSnapshot([createUserTemplate({
				...createTemplate(),
				id: "template-a",
				applicability: {
					schemaFingerprint: "schema-b",
				},
			})]),
		});

		assert.deepEqual(candidates, []);
	});
});

const builtinRecipeSnapshot = createRecipeSnapshot(builtinRecipes);

const getBuiltinRecipe = (id: string): Recipe => {
	const recipe = builtinRecipeSnapshot.recipes.find(candidate => candidate.id === id);
	assert.ok(recipe);
	return recipe;
};

const createReviewContext = (
	evidence: ReviewEvidence,
	options: {
		readonly contentHash?: string;
	} = {},
): ReviewContext => ({
	resource: URI.file("/workspace/transfer.csv"),
	...(options.contentHash ? { contentHash: options.contentHash } : {}),
	modelVersion: 3,
	sourceVersion: 4,
	evidenceFingerprint: "evidence:test",
	evidence,
});

const createUserTemplateSnapshot = (
	templates: readonly UserTemplate[],
): UserTemplateSnapshot => ({
	version: 7,
	workspaceVersion: 0,
	globalVersion: 7,
	workspaceFingerprint: "workspace:test",
	globalFingerprint: "global:test",
	effectiveFingerprint: "effective:test",
	templates,
});

const createUserTemplate = (template: Template): UserTemplate => ({
	id: String(template.id ?? "template-a"),
	name: template.name,
	version: template.version,
	scope: "global",
	source: "userCreated",
	template,
	templateFingerprint: createTemplateFingerprint(template),
	createdAt: 0,
	updatedAt: 0,
});

const createReviewEvidence = (options: {
	readonly columns?: readonly MeasurementColumnRef[];
	readonly layoutBinding?: {
		readonly xCol?: number;
		readonly yCols?: readonly number[];
		readonly groupByCol?: number;
		readonly pointCol?: number;
	};
	readonly layoutKind?: "groupedSweep" | "simpleXY";
} = {}): ReviewEvidence => ({
	sourceMetadata: {
		fileName: "Transfer.csv",
		rowCount: 4,
		columnCount: 2,
	},
	structuredContent: {
		structure: {
			...createEmptyStructuredContentStructure(),
			fingerprint: "schema-a",
		},
		columnProfiles: [],
		layoutCandidates: [{
			id: "layout-a",
			layoutKind: options.layoutKind ?? "simpleXY",
			confidence: 0.9,
			bindings: [options.layoutBinding ?? {
				xCol: 0,
				yCols: [1],
			}],
			reasons: [],
		}],
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
					endRow: 3,
					startCol: 0,
					endCol: 1,
				},
				dataRange: {
					startRow: 1,
					endRow: 3,
					startCol: 0,
					endCol: 1,
				},
			},
			columns: {
				columns: options.columns ?? [
					createColumn(0, "vg", "V"),
					createColumn(1, "id", "A"),
				],
			},
			rowCount: 4,
			columnCount: 2,
			confidence: 0.95,
			diagnosticCodes: [],
		}],
		diagnostics: [],
	},
});

const createColumn = (
	rawCol: number,
	role: MeasurementColumnRef["role"],
	unit: string,
	headerText: string = role,
): MeasurementColumnRef => ({
	rawCol,
	role,
	unit,
	headerText,
	confidence: 0.95,
	sourceRange: {
		startRow: 0,
		endRow: 3,
		startCol: rawCol,
		endCol: rawCol,
	},
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
