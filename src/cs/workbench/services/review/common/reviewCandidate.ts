/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Recipe, RecipeSnapshot } from "cs/workbench/services/recipes/common/recipe";
import type {
	RecipeLogicalRelation,
} from "cs/workbench/services/recipes/common/recipeSchema";
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
	StructuredMeasurementBlockRecord as MeasurementBlockRecord,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import type {
	TemplateItMode,
	TemplateIvMode,
	TemplateMeasurementBinding,
	TemplateMeasurementFamily,
} from "src/cs/workbench/services/template/common/template";
import type {
	UserTemplate,
	UserTemplateSnapshot,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

// Candidate derivation is pure Review pipeline code: it interprets Recipe and
// UserTemplate snapshots against evidence, but does not score or select output.
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

	const matches = recipe.blockPartition.select === "first"
		? evaluation.matches.slice(0, 1)
		: evaluation.matches;
	const blocks: ReviewCandidateBlock[] = [];
	const matchedBlocks: MeasurementBlockRecord[] = [];
	const diagnostics = new Set<string>();
	for (const match of matches) {
		const block = getMatchedBlock(context.evidence, match);
		if (!block) {
			diagnostics.add("recipeCandidate.missingBlock");
			continue;
		}

		const candidateBlock = createCandidateBlock(recipe, match, block, context.evidence);
		if (!candidateBlock) {
			diagnostics.add("recipeCandidate.missingRoleBinding");
			continue;
		}
		matchedBlocks.push(block);
		blocks.push(candidateBlock);
	}

	const structuredContent = context.evidence.structuredContent;
	const schemaFingerprint = structuredContent?.structure.fingerprint;
	const measurement = createCandidateMeasurementBinding(matchedBlocks);
	const interpretation = createReviewCandidateInterpretation({
		name: recipe.label || recipe.id,
		version: 1,
		...(measurement ? { measurement } : {}),
		blocks,
		stopOnError: recipe.stopOnError ?? false,
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
		template.applicability.schemaFingerprint !== context.evidence.structuredContent?.structure.fingerprint
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
	const interpretation = createReviewCandidateInterpretation({
		name: template.name,
		version: template.version,
		...(template.measurement ? { measurement: template.measurement } : {}),
		blocks: template.blocks,
		stopOnError: template.stopOnError,
		...(template.applicability ? { applicability: template.applicability } : {}),
	});

	return {
		id: `user-template-candidate:${userTemplate.id}`,
		source: {
			kind: "userTemplate",
			templateId: userTemplate.id,
			templateVersion: userTemplate.version,
		},
		interpretation,
		interpretationFingerprint: createCandidateInterpretationFingerprint(interpretation),
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
	measurement,
	name,
	stopOnError,
	version,
}: ReviewCandidateInterpretation): ReviewCandidateInterpretation => ({
	name,
	version,
	...(measurement ? { measurement } : {}),
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
		measurement,
		name,
		stopOnError,
		version,
	} = interpretation;
	return createReviewInterpretationFingerprint({
		schemaVersion: 1,
		name,
		version,
		...(measurement ? { measurement } : {}),
		blocks,
		stopOnError,
		...(applicability ? { applicability } : {}),
	});
};

const createCandidateMeasurementBinding = (
	blocks: readonly MeasurementBlockRecord[],
): TemplateMeasurementBinding | undefined => {
	const measurements = blocks
		.map(createTemplateMeasurementBinding)
		.filter((measurement): measurement is TemplateMeasurementBinding => Boolean(measurement));
	const first = measurements[0];
	if (!first || measurements.length !== blocks.length) {
		return undefined;
	}

	return measurements.every(measurement => areSameTemplateMeasurementBinding(first, measurement))
		? first
		: undefined;
};

const createTemplateMeasurementBinding = (
	block: MeasurementBlockRecord,
): TemplateMeasurementBinding | undefined => {
	if (!isTemplateMeasurementFamily(block.family)) {
		return undefined;
	}

	return {
		curveFamily: block.family,
		...(block.family === "iv" && isTemplateIvMode(block.ivMode) ? { ivMode: block.ivMode } : {}),
		...(block.family === "it" && isTemplateItMode(block.itMode) ? { itMode: block.itMode } : {}),
	};
};

const areSameTemplateMeasurementBinding = (
	left: TemplateMeasurementBinding,
	right: TemplateMeasurementBinding,
): boolean =>
	left.curveFamily === right.curveFamily &&
	(left.ivMode ?? null) === (right.ivMode ?? null) &&
	(left.itMode ?? null) === (right.itMode ?? null);

const isTemplateMeasurementFamily = (
	family: string,
): family is TemplateMeasurementFamily =>
	family === "iv" ||
	family === "cv" ||
	family === "cf" ||
	family === "pv" ||
	family === "it";

const isTemplateIvMode = (
	mode: unknown,
): mode is TemplateIvMode =>
	mode === "transfer" ||
	mode === "output";

const isTemplateItMode = (
	mode: unknown,
): mode is TemplateItMode =>
	mode === "stability" ||
	mode === "transient" ||
	mode === "retention" ||
	mode === "biasStress" ||
	mode === "photoResponse" ||
	mode === "generic";

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
	const x = createAxisBinding(recipe, "x", match, evidence);
	const y = createAxisBinding(recipe, "y", match, evidence);
	if (!x || !y) {
		return null;
	}

	return {
		rowRange: getBlockDataRowRange(block),
		x,
		y,
		segmentation: createCandidateSegmentation(recipe.logicalRelation),
		legend: createCandidateLegend(recipe.logicalRelation),
	};
};

const createAxisBinding = (
	recipe: Recipe,
	axis: "x" | "y",
	match: ReviewSelectorBlockMatch,
	evidence: ReviewContext["evidence"],
): ReviewCandidateAxisBinding | null => {
	if (usesLayoutBindingColumns(recipe)) {
		const columns = readLayoutBindingColumns(evidence, recipe, axis);
		return columns.length
			? {
				columns,
				unit: readCaptureUnit(match, axis) ?? undefined,
			}
			: null;
	}

	const capture = readColumnsCapture(match.captures[axis]);
	if (!capture) {
		return null;
	}

	return {
		columns: capture.columns,
		unit: capture.unit ?? undefined,
	};
};

const readColumnsCapture = (
	capture: ReviewSelectorCapture | undefined,
): Extract<ReviewSelectorCapture, { readonly kind: "columns" }> | null =>
	capture?.kind === "columns" && capture.columns.length
		? capture
		: null;

const readCaptureUnit = (
	match: ReviewSelectorBlockMatch,
	captureName: "x" | "y",
): string | null => {
	const capture = readColumnsCapture(match.captures[captureName]);
	return capture?.unit ?? null;
};

const usesLayoutBindingColumns = (
	recipe: Recipe,
): boolean =>
	recipe.seriesPartition.kind === "groupColumn" ||
	recipe.withinBlock.physicalLayout === "xyxyxy";

const createCandidateSegmentation = (
	_logicalRelation: RecipeLogicalRelation,
): ReviewCandidateBlock["segmentation"] => ({
	kind: "auto",
});

const createCandidateLegend = (
	logicalRelation: RecipeLogicalRelation,
): ReviewCandidateBlock["legend"] => ({
	target: logicalRelation === "oneX-oneY-manyGroups" ? "group" : "auto",
});

const readLayoutBindingColumns = (
	evidence: ReviewContext["evidence"],
	recipe: Recipe,
	target: "x" | "y" | "bias",
): readonly number[] => {
	const layoutKinds = getLayoutBindingEvidenceKinds(recipe);
	const binding = evidence.structuredContent?.layoutCandidates
		.find(candidate =>
			(!layoutKinds.length || layoutKinds.includes(candidate.layoutKind)) &&
			candidate.bindings.length
		)?.bindings[0];
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

const getLayoutBindingEvidenceKinds = (
	recipe: Recipe,
): readonly string[] => {
	if (recipe.seriesPartition.kind === "groupColumn") {
		return [recipe.seriesPartition.layoutKind ?? "groupedSweep"];
	}
	switch (recipe.withinBlock.physicalLayout) {
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

const isIntegerColumn = (
	value: unknown,
): value is number =>
	Number.isInteger(value);

const getMatchedBlock = (
	evidence: ReviewContext["evidence"],
	match: ReviewSelectorBlockMatch | undefined,
): MeasurementBlockRecord | null =>
	match?.blockId
		? evidence.structuredContent?.blocks.find(block => block.id === match.blockId) ?? null
		: evidence.structuredContent?.blocks[0] ?? null;

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
