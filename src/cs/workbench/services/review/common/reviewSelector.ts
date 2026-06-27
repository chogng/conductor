/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	MeasurementBlockRecord,
	MeasurementColumnRef,
} from "src/cs/workbench/services/table/common/tableProjection";
import type { Recipe } from "src/cs/workbench/services/recipe/common/recipe";
import type {
	RecipePhysicalLayout,
	RecipeRole,
	RecipeSeriesPartition,
} from "src/cs/workbench/services/recipe/common/recipeSchema";
import type { ReviewEvidence } from "src/cs/workbench/services/review/common/reviewModel";

export type ReviewSelectorCapture =
	| {
		readonly kind: "columns";
		readonly columns: readonly number[];
		readonly unit?: string | null;
	}
	| {
		readonly kind: "units";
		readonly units: readonly string[];
	};

export type ReviewSelectorBlockMatch = {
	readonly blockId?: string;
	readonly captures: Readonly<Record<string, ReviewSelectorCapture>>;
	readonly reasons: readonly string[];
};

export type ReviewSelectorEvaluation = {
	readonly matched: boolean;
	readonly recipeId: string;
	readonly recipeVersion: number;
	readonly matches: readonly ReviewSelectorBlockMatch[];
	readonly diagnosticCodes: readonly string[];
};

type EvaluationContext = {
	readonly evidence: ReviewEvidence;
	readonly block: MeasurementBlockRecord | null;
};

type MatchResult =
	| {
		readonly matched: true;
		readonly captures: Readonly<Record<string, ReviewSelectorCapture>>;
		readonly reasons: readonly string[];
	}
	| {
		readonly matched: false;
		readonly diagnosticCodes: readonly string[];
	};

type PredicateResult =
	| {
		readonly matched: true;
		readonly captures?: Readonly<Record<string, ReviewSelectorCapture>>;
		readonly reason?: string;
	}
	| {
		readonly matched: false;
		readonly diagnosticCode?: string;
	};

export const evaluateReviewSelector = (
	recipe: Recipe,
	evidence: ReviewEvidence,
): ReviewSelectorEvaluation => {
	const tableProjection = evidence.tableProjection;
	if (!tableProjection) {
		return {
			matched: false,
			recipeId: recipe.id,
			recipeVersion: recipe.version,
			matches: [],
			diagnosticCodes: ["recipeSelector.missingTableProjection"],
		};
	}

	const contexts = tableProjection.blocks.length
		? tableProjection.blocks.map(block => ({ evidence, block }))
		: [{ evidence, block: null }];
	const matches: ReviewSelectorBlockMatch[] = [];
	const diagnosticCodes = new Set<string>();

	for (const context of contexts) {
		const result = evaluateRecipe(recipe, context);
		if (result.matched) {
			matches.push({
				blockId: context.block?.id,
				captures: result.captures,
				reasons: result.reasons,
			});
		} else {
			for (const code of result.diagnosticCodes) {
				diagnosticCodes.add(code);
			}
		}
	}

	return {
		matched: matches.length > 0,
		recipeId: recipe.id,
		recipeVersion: recipe.version,
		matches,
		diagnosticCodes: matches.length ? [] : [...diagnosticCodes],
	};
};

const evaluateRecipe = (
	recipe: Recipe,
	context: EvaluationContext,
): MatchResult => {
	const captures: Record<string, ReviewSelectorCapture> = {};
	const reasons: string[] = [];
	const diagnosticCodes = new Set<string>();
	const predicates: readonly (() => PredicateResult)[] = [
		() => evaluateDataRange(recipe, context),
		() => evaluateBlockPartition(recipe, context.block),
		() => evaluateDomain(recipe, context.block),
		() => evaluatePhysicalLayout(recipe.withinBlock.physicalLayout, context.evidence),
		() => evaluateSeriesPartition(recipe.seriesPartition, context.evidence),
		() => evaluateRole("x", recipe.roles.x, context),
		() => evaluateRole("y", recipe.roles.y, context),
	];

	for (const predicate of predicates) {
		const result = predicate();
		if (!result.matched) {
			addDiagnosticCode(diagnosticCodes, result.diagnosticCode);
			return {
				matched: false,
				diagnosticCodes: [...diagnosticCodes],
			};
		}
		mergeCaptures(captures, result.captures);
		addReason(reasons, result.reason);
	}

	return {
		matched: true,
		captures,
		reasons,
	};
};

const evaluateDataRange = (
	recipe: Recipe,
	context: EvaluationContext,
): PredicateResult => {
	if (recipe.dataRange.kind !== "detectedDataRegion") {
		return { matched: false, diagnosticCode: "recipeSelector.dataRangeMismatch" };
	}
	if (
		context.evidence.tableProjection?.structure.dataRegions.length ||
		context.block?.source.dataRange ||
		context.block?.source.fullRange
	) {
		return { matched: true, reason: "dataRange:detectedDataRegion" };
	}
	return { matched: false, diagnosticCode: "recipeSelector.missingDataRange" };
};

const evaluateBlockPartition = (
	recipe: Recipe,
	block: MeasurementBlockRecord | null,
): PredicateResult => {
	if (recipe.blockPartition.kind !== "measurementBlocks") {
		return { matched: false, diagnosticCode: "recipeSelector.blockPartitionMismatch" };
	}
	if (!block) {
		return { matched: false, diagnosticCode: "recipeSelector.missingMeasurementBlock" };
	}
	if (!meetsMinConfidence(block.confidence, recipe.blockPartition.minConfidence)) {
		return { matched: false, diagnosticCode: "recipeSelector.blockConfidenceMismatch" };
	}
	return { matched: true, reason: `blockPartition:${recipe.blockPartition.select}` };
};

const evaluateDomain = (
	recipe: Recipe,
	block: MeasurementBlockRecord | null,
): PredicateResult => {
	const domain = recipe.domain;
	if (!domain) {
		return { matched: true };
	}
	if (!block || !meetsMinConfidence(block.confidence, domain.minConfidence)) {
		return { matched: false, diagnosticCode: "recipeSelector.blockFamilyMismatch" };
	}
	if (domain.family && block.family !== domain.family) {
		return { matched: false, diagnosticCode: "recipeSelector.blockFamilyMismatch" };
	}
	if (domain.ivMode && block.ivMode !== domain.ivMode) {
		return { matched: false, diagnosticCode: "recipeSelector.ivModeMismatch" };
	}
	if (domain.itMode && block.itMode !== domain.itMode) {
		return { matched: false, diagnosticCode: "recipeSelector.itModeMismatch" };
	}
	return { matched: true, reason: domain.family ? `domain:${domain.family}` : undefined };
};

const evaluatePhysicalLayout = (
	layout: RecipePhysicalLayout,
	evidence: ReviewEvidence,
): PredicateResult => {
	const layoutKinds = getRequiredLayoutEvidenceKinds(layout);
	if (!layoutKinds.length) {
		return { matched: true, reason: `physicalLayout:${layout}` };
	}
	const matched = evidence.tableProjection?.layoutCandidates.some(candidate =>
		layoutKinds.includes(candidate.layoutKind) &&
		meetsMinConfidence(candidate.confidence, 0.75)
	);
	return matched
		? { matched: true, reason: `physicalLayout:${layout}` }
		: { matched: false, diagnosticCode: "recipeSelector.physicalLayoutMismatch" };
};

const evaluateSeriesPartition = (
	partition: RecipeSeriesPartition,
	evidence: ReviewEvidence,
): PredicateResult => {
	if (partition.kind === "none") {
		return { matched: true };
	}

	const layoutKind = partition.layoutKind ?? "groupedSweep";
	const matched = evidence.tableProjection?.layoutCandidates.some(candidate =>
		candidate.layoutKind === layoutKind &&
		meetsMinConfidence(candidate.confidence, partition.minConfidence ?? 0.75) &&
		candidate.bindings.some(hasSeriesPartitionBinding)
	);
	return matched
		? { matched: true, reason: `seriesPartition:${partition.kind}` }
		: { matched: false, diagnosticCode: "recipeSelector.seriesPartitionMismatch" };
};

const hasSeriesPartitionBinding = (
	binding: {
		readonly groupByCol?: number;
		readonly pointCol?: number;
		readonly biasCols?: readonly number[];
	},
): boolean =>
	Number.isInteger(binding.groupByCol) ||
	Number.isInteger(binding.pointCol) ||
	Boolean(binding.biasCols?.length);

const evaluateRole = (
	capture: "x" | "y",
	role: RecipeRole,
	context: EvaluationContext,
): PredicateResult => {
	const matchedColumns = getColumnsForBlock(context.block)
		.filter(column =>
			role.roleAny.includes(column.role) &&
			(!role.canonicalUnit || normalizeUnit(column.unit) === role.canonicalUnit) &&
			meetsMinConfidence(column.confidence, role.minConfidence)
		);
	if (!isCountWithinBounds(matchedColumns.length, role.count)) {
		return { matched: false, diagnosticCode: "recipeSelector.columnRoleMismatch" };
	}

	return {
		matched: true,
		captures: {
			[capture]: {
				kind: "columns",
				columns: matchedColumns.map(column => column.rawCol),
				unit: getCommonUnit(matchedColumns),
			},
		},
		reason: `role:${capture}`,
	};
};

const getRequiredLayoutEvidenceKinds = (
	layout: RecipePhysicalLayout,
): readonly string[] => {
	switch (layout) {
		case "xyxyxy":
			return ["pairwiseXY"];
		case "blocks.xy":
		case "blocks.xyyyy":
			return ["repeatedBlock"];
		case "xy":
		case "xyyyy":
			return [];
	}
};

const getColumnsForBlock = (
	block: MeasurementBlockRecord | null,
): readonly MeasurementColumnRef[] =>
	block?.columns.columns ?? [];

const isCountWithinBounds = (
	count: number,
	cardinality: RecipeRole["count"],
): boolean =>
	cardinality === "one"
		? count === 1
		: count >= 1;

const getCommonUnit = (
	columns: readonly MeasurementColumnRef[],
): string | null => {
	const units = [...new Set(columns.map(column => normalizeUnit(column.unit)).filter(Boolean))];
	return units.length === 1 ? units[0] ?? null : null;
};

const meetsMinConfidence = (
	confidence: number | undefined,
	minConfidence: number | undefined,
): boolean =>
	minConfidence === undefined ||
	Number(confidence ?? 1) >= minConfidence;

const mergeCaptures = (
	target: Record<string, ReviewSelectorCapture>,
	source: Readonly<Record<string, ReviewSelectorCapture>> | undefined,
): void => {
	if (!source) {
		return;
	}
	for (const [key, value] of Object.entries(source)) {
		target[key] = value;
	}
};

const addReason = (target: string[], reason: string | undefined): void => {
	if (reason) {
		target.push(reason);
	}
};

const addDiagnosticCode = (target: Set<string>, code: string | undefined): void => {
	if (code) {
		target.add(code);
	}
};

const normalizeUnit = (value: unknown): string =>
	String(value ?? "").trim();
