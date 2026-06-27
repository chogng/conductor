/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { MeasurementBlockRecord } from "src/cs/workbench/services/tableModel/common/measurement";
import type { Recipe, RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import type {
	RecipeColumnProjection,
	RecipeValueExpression,
} from "src/cs/workbench/services/recipe/common/recipeProjection";
import type {
	ReviewCandidate,
	ReviewCandidateAxisBinding,
	ReviewCandidateBlock,
	ReviewCandidateDiagnostic,
	ReviewCandidateInterpretation,
	ReviewCandidateRowRange,
	ReviewContext,
} from "src/cs/workbench/services/review/common/reviewModel";
import {
	evaluateReviewSelector,
	type ReviewSelectorBlockMatch,
	type ReviewSelectorCapture,
	type ReviewSelectorEvaluation,
} from "src/cs/workbench/services/review/common/reviewSelector";
import type {
	UserTemplate,
	UserTemplateSnapshot,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

export const deriveAutomaticReviewCandidates = ({
	context,
	recipeSnapshot,
	userTemplateSnapshot,
}: {
	readonly context: ReviewContext;
	readonly recipeSnapshot?: RecipeSnapshot;
	readonly userTemplateSnapshot: UserTemplateSnapshot;
}): readonly ReviewCandidate[] =>
	sortReviewCandidates([
		...deriveRecipeReviewCandidates({
			context,
			recipeSnapshot,
		}),
		...deriveUserTemplateReviewCandidates({
			context,
			userTemplateSnapshot,
		}),
	]);

export const deriveRecipeReviewCandidates = ({
	context,
	recipeSnapshot,
}: {
	readonly context: ReviewContext;
	readonly recipeSnapshot?: RecipeSnapshot;
}): readonly ReviewCandidate[] => {
	const candidates: ReviewCandidate[] = [];
	for (const recipe of recipeSnapshot?.recipes ?? []) {
		const evaluation = evaluateReviewSelector(recipe, context.evidence);
		const candidate = createRecipeReviewCandidate({
			context,
			recipe,
			evaluation,
		});
		if (candidate) {
			candidates.push(candidate);
		}
	}

	return sortReviewCandidates(candidates);
};

export const deriveUserTemplateReviewCandidates = ({
	context,
	userTemplateSnapshot,
}: {
	readonly context: ReviewContext;
	readonly userTemplateSnapshot: UserTemplateSnapshot;
}): readonly ReviewCandidate[] => {
	const candidates: ReviewCandidate[] = [];
	for (const userTemplate of userTemplateSnapshot.templates) {
		const candidate = createUserTemplateReviewCandidate({
			context,
			userTemplate,
		});
		if (candidate) {
			candidates.push(candidate);
		}
	}

	return sortReviewCandidates(candidates);
};

export const createRecipeReviewCandidate = ({
	context,
	recipe,
	evaluation,
}: {
	readonly context: ReviewContext;
	readonly recipe: Recipe;
	readonly evaluation: ReviewSelectorEvaluation;
}): ReviewCandidate | null => {
	if (!evaluation.matched || !evaluation.matches.length) {
		return null;
	}

	const projection = recipe.projection;
	const matches = projection.blocks.source === "singleMatchedBlock"
		? evaluation.matches.slice(0, 1)
		: evaluation.matches;
	const blocks: ReviewCandidateBlock[] = [];
	const diagnostics = new Set<string>();
	for (const match of matches) {
		const block = getMatchedBlock(context.evidence, match);
		if (!block) {
			diagnostics.add("recipeProjection.missingBlock");
			continue;
		}

		const candidateBlock = createCandidateBlock(recipe, match, block, context.evidence);
		if (!candidateBlock) {
			diagnostics.add("recipeProjection.missingCapture");
			continue;
		}
		blocks.push(candidateBlock);
	}

	const tableProjection = context.evidence.tableProjection;
	const schemaFingerprint = tableProjection?.structure.fingerprint;
	const interpretation = createReviewCandidateInterpretation({
		name: resolveCandidateExpressionValue(projection.name, matches[0], getMatchedBlock(context.evidence, matches[0])) || recipe.id,
		version: 1,
		blocks,
		stopOnError: projection.stopOnError ?? false,
		applicability: {
			...(schemaFingerprint ? { schemaFingerprint } : {}),
			columnCount: context.evidence.sourceMetadata.columnCount,
		},
	});

	return {
		id: `recipe-candidate:${recipe.id}:${recipe.version}`,
		source: {
			kind: "recipe",
			recipeId: recipe.id,
			recipeVersion: recipe.version,
		},
		interpretation,
		interpretationFingerprint: createCandidateInterpretationFingerprint(interpretation),
		evidenceFingerprint: context.evidenceFingerprint,
		...(context.contentHash ? { contentHash: context.contentHash } : {}),
		...(context.modelVersion !== undefined ? { modelVersion: context.modelVersion } : {}),
		...(context.sourceVersion !== undefined ? { sourceVersion: context.sourceVersion } : {}),
		confidence: getRecipeCandidateConfidence(matches, context.evidence),
		providerRank: recipe.priority,
		selectorTrace: {
			reasons: matches.flatMap(match => match.reasons),
			diagnostics: evaluation.diagnosticCodes.map(createReviewCandidateDiagnostic),
		},
		projectionTrace: {
			reasons: [],
			diagnostics: [...diagnostics].map(createReviewCandidateDiagnostic),
		},
	};
};

const createUserTemplateReviewCandidate = ({
	context,
	userTemplate,
}: {
	readonly context: ReviewContext;
	readonly userTemplate: UserTemplate;
}): ReviewCandidate | null => {
	const diagnostics = new Set<string>();
	const reasons: string[] = [];
	const template = userTemplate.template;

	if (!template.blocks.length) {
		return null;
	}

	if (
		template.applicability?.schemaFingerprint &&
		template.applicability.schemaFingerprint !== context.evidence.tableProjection?.structure.fingerprint
	) {
		return null;
	}
	if (
		Number.isInteger(template.applicability?.columnCount) &&
		template.applicability?.columnCount !== context.evidence.sourceMetadata.columnCount
	) {
		return null;
	}

	if (template.applicability?.schemaFingerprint) {
		reasons.push("userTemplate.schemaFingerprint");
	}
	if (Number.isInteger(template.applicability?.columnCount)) {
		reasons.push("userTemplate.columnCount");
	}
	const rowCount = context.evidence.sourceMetadata.rowCount;
	const columnCount = context.evidence.sourceMetadata.columnCount;
	if (
		typeof rowCount !== "number" ||
		typeof columnCount !== "number" ||
		!Number.isInteger(rowCount) ||
		!Number.isInteger(columnCount)
	) {
		return null;
	}

	for (const block of template.blocks) {
		if (!isRowRangeInBounds(block.rowRange, rowCount)) {
			diagnostics.add("userTemplate.rowRangeOutOfBounds");
		}
		if (!isAxisInBounds(block.x, columnCount)) {
			diagnostics.add("userTemplate.xAxisOutOfBounds");
		}
		if (!isAxisInBounds(block.y, columnCount)) {
			diagnostics.add("userTemplate.yAxisOutOfBounds");
		}
	}

	return {
		id: `user-template-candidate:${userTemplate.id}`,
		source: {
			kind: "userTemplate",
			templateId: userTemplate.id,
			templateVersion: userTemplate.version,
		},
		interpretation: {
			name: template.name,
			version: template.version,
			blocks: template.blocks,
			stopOnError: template.stopOnError,
			...(template.applicability ? { applicability: template.applicability } : {}),
		},
		interpretationFingerprint: createCandidateInterpretationFingerprint({
			name: template.name,
			version: template.version,
			blocks: template.blocks,
			stopOnError: template.stopOnError,
			...(template.applicability ? { applicability: template.applicability } : {}),
		}),
		evidenceFingerprint: context.evidenceFingerprint,
		...(context.contentHash ? { contentHash: context.contentHash } : {}),
		...(context.modelVersion !== undefined ? { modelVersion: context.modelVersion } : {}),
		...(context.sourceVersion !== undefined ? { sourceVersion: context.sourceVersion } : {}),
		confidence: diagnostics.size ? 0.6 : getUserTemplateConfidence(userTemplate),
		selectorTrace: {
			reasons,
			diagnostics: [],
		},
		projectionTrace: {
			reasons: [],
			diagnostics: [...diagnostics].map(createReviewCandidateDiagnostic),
		},
	};
};

const sortReviewCandidates = (
	candidates: readonly ReviewCandidate[],
): readonly ReviewCandidate[] => [...candidates].sort((left, right) =>
	getReviewCandidateStateRank(right) - getReviewCandidateStateRank(left) ||
	right.confidence - left.confidence ||
	getReviewCandidateProviderRank(right) - getReviewCandidateProviderRank(left) ||
	left.id.localeCompare(right.id)
);

const getReviewCandidateStateRank = (
	candidate: ReviewCandidate,
): number => hasReviewCandidateDiagnostics(candidate) ? 0 : 1;

const hasReviewCandidateDiagnostics = (
	candidate: ReviewCandidate,
): boolean =>
	candidate.selectorTrace.diagnostics.length > 0 ||
	candidate.projectionTrace.diagnostics.length > 0;

const getReviewCandidateProviderRank = (
	candidate: ReviewCandidate,
): number =>
	Number.isFinite(candidate.providerRank) ? Number(candidate.providerRank) : 0;

const createReviewCandidateDiagnostic = (
	code: string,
): ReviewCandidateDiagnostic => ({
	severity: "warning",
	code,
	message: code,
});

const createReviewCandidateInterpretation = ({
	applicability,
	blocks,
	name,
	stopOnError,
	version,
}: ReviewCandidateInterpretation): ReviewCandidateInterpretation => ({
	name,
	version,
	blocks,
	stopOnError,
	...(applicability ? { applicability } : {}),
});

const createCandidateInterpretationFingerprint = (
	interpretation: ReviewCandidateInterpretation,
): string => {
	const {
		applicability,
		blocks,
		name,
		stopOnError,
		version,
	} = interpretation;
	return createReviewInterpretationFingerprint({
		schemaVersion: 1,
		name,
		version,
		blocks,
		stopOnError,
		...(applicability ? { applicability } : {}),
	});
};

const createReviewInterpretationFingerprint = (
	interpretation: unknown,
): string =>
	`review-interpretation:${hashString(stableStringify(interpretation))}`;

const createCandidateBlock = (
	recipe: Recipe,
	match: ReviewSelectorBlockMatch,
	block: MeasurementBlockRecord,
	evidence: ReviewContext["evidence"],
): ReviewCandidateBlock | null => {
	const projection = recipe.projection;
	const x = createAxisBinding(projection.blocks.x, match, evidence);
	const y = createAxisBinding(projection.blocks.y, match, evidence);
	if (!x || !y) {
		return null;
	}

	return {
		rowRange: getBlockDataRowRange(block),
		x,
		y,
		segmentation: {
			kind: projection.blocks.segmentation.kind,
		},
		legend: {
			target: projection.blocks.legend.target,
		},
		titles: projection.blocks.titles
			? {
				bottom: projection.blocks.titles.bottom
					? resolveCandidateExpressionValue(projection.blocks.titles.bottom, match, block)
					: undefined,
				left: projection.blocks.titles.left
					? resolveCandidateExpressionValue(projection.blocks.titles.left, match, block)
					: undefined,
			}
			: undefined,
	};
};

const createAxisBinding = (
	projection: RecipeColumnProjection,
	match: ReviewSelectorBlockMatch,
	evidence: ReviewContext["evidence"],
): ReviewCandidateAxisBinding | null => {
	if (projection.columns.kind === "literalColumns") {
		return {
			columns: projection.columns.columns,
			unit: projection.unit ? resolveCandidateExpressionValue(projection.unit, match, null) : undefined,
		};
	}
	if (projection.columns.kind === "layoutBindingColumns") {
		const columns = readLayoutBindingColumns(evidence, projection.columns.target);
		return columns.length
			? {
				columns,
				unit: projection.unit ? resolveCandidateExpressionValue(projection.unit, match, null) : undefined,
			}
			: null;
	}

	const capture = readColumnsCapture(match.captures[projection.columns.capture]);
	if (!capture) {
		return null;
	}

	return {
		columns: capture.columns,
		unit: projection.unit
			? resolveCandidateExpressionValue(projection.unit, match, null)
			: capture.unit ?? undefined,
	};
};

const resolveCandidateExpressionValue = (
	expression: RecipeValueExpression,
	match: ReviewSelectorBlockMatch | undefined,
	block: MeasurementBlockRecord | null,
): string => {
	switch (expression.kind) {
		case "literal":
			return expression.value;
		case "capturedCommonUnit": {
			const capture = match ? match.captures[expression.capture] : undefined;
			if (capture?.kind === "columns") {
				return capture.unit ?? "";
			}
			if (capture?.kind === "units") {
				return capture.units.length === 1 ? capture.units[0] ?? "" : "";
			}
			return "";
		}
		case "matchedBlockLabel":
			return block?.label ?? "";
		case "matchedBlockFamily":
			return block?.family ?? "";
		case "matchedBlockMode":
			return block?.ivMode ?? block?.itMode ?? "";
	}
};

const readColumnsCapture = (
	capture: ReviewSelectorCapture | undefined,
): Extract<ReviewSelectorCapture, { readonly kind: "columns" }> | null =>
	capture?.kind === "columns" && capture.columns.length
		? capture
		: null;

const readLayoutBindingColumns = (
	evidence: ReviewContext["evidence"],
	target: "x" | "y" | "bias",
): readonly number[] => {
	const binding = evidence.tableProjection?.layoutCandidates
		.find(candidate => candidate.bindings.length)?.bindings[0];
	if (!binding) {
		return [];
	}

	switch (target) {
		case "x": {
			const xCol = binding.xCol;
			return isIntegerColumn(xCol) ? [xCol] : [];
		}
		case "y":
			return binding.yCols?.filter(isIntegerColumn) ?? [];
		case "bias":
			return binding.biasCols?.filter(isIntegerColumn) ?? [];
	}
};

const isIntegerColumn = (
	value: unknown,
): value is number =>
	Number.isInteger(value);

const getMatchedBlock = (
	evidence: ReviewContext["evidence"],
	match: ReviewSelectorBlockMatch | undefined,
): MeasurementBlockRecord | null =>
	match?.blockId
		? evidence.tableProjection?.blocks.find(block => block.id === match.blockId) ?? null
		: evidence.tableProjection?.blocks[0] ?? null;

const getBlockDataRowRange = (
	block: MeasurementBlockRecord,
): ReviewCandidateRowRange => {
	const sourceRange = block.source.dataRange ?? block.source.fullRange;
	return {
		startRow: sourceRange.startRow,
		endRow: sourceRange.endRow,
	};
};

const getRecipeCandidateConfidence = (
	matches: readonly ReviewSelectorBlockMatch[],
	evidence: ReviewContext["evidence"],
): number => {
	const confidences = matches
		.map(match => getMatchedBlock(evidence, match)?.confidence)
		.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
	if (!confidences.length) {
		return 0.5;
	}

	return Math.max(0, Math.min(1, Math.min(...confidences)));
};

const getUserTemplateConfidence = (
	userTemplate: UserTemplate,
): number => {
	const { template } = userTemplate;
	if (template.applicability?.schemaFingerprint) {
		return 0.95;
	}
	if (Number.isInteger(template.applicability?.columnCount)) {
		return 0.75;
	}
	return 0.2;
};

const isRowRangeInBounds = (
	rowRange: ReviewCandidateRowRange,
	rowCount: number,
): boolean => {
	const startRow = Math.floor(Number(rowRange.startRow));
	const endRow = rowRange.endRow === "end"
		? Math.max(0, rowCount - 1)
		: Math.floor(Number(rowRange.endRow));
	return Number.isInteger(startRow) &&
		Number.isInteger(endRow) &&
		startRow >= 0 &&
		startRow < rowCount &&
		endRow >= startRow &&
		endRow < rowCount;
};

const isAxisInBounds = (
	axis: ReviewCandidateAxisBinding,
	columnCount: number,
): boolean =>
	axis.columns.length > 0 &&
	axis.columns.every(column => isColumnInBounds(column, columnCount)) &&
	(axis.ranges ?? []).every(range =>
		isColumnInBounds(range.column, columnCount)
	);

const isColumnInBounds = (
	column: number,
	columnCount: number,
): boolean =>
	Number.isInteger(column) &&
	column >= 0 &&
	column < columnCount;

type JsonLike =
	| string
	| number
	| boolean
	| null
	| JsonLike[]
	| { [key: string]: JsonLike };

const stableStringify = (
	value: unknown,
): string => {
	const seen = new WeakSet<object>();

	const normalize = (
		input: unknown,
	): JsonLike => {
		if (!input || typeof input !== "object") {
			return input as JsonLike;
		}
		if (seen.has(input)) {
			return null;
		}
		seen.add(input);

		if (Array.isArray(input)) {
			return input.map(item => normalize(item));
		}

		const output: Record<string, JsonLike> = {};
		for (const key of Object.keys(input).sort()) {
			const record = input as Record<string, unknown>;
			output[key] = normalize(record[key]);
		}
		return output;
	};

	return JSON.stringify(normalize(value));
};

const hashString = (
	value: string,
): string => {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return (hash >>> 0).toString(36);
};
