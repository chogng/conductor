/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { stableStringify } from "src/cs/base/common/objects";
import type {
	StructuredBindingCandidate,
	StructuredContentEvidence,
	StructuredDataBlockCandidate,
	StructuredMeasurementBlockRecord,
	StructuredMeasurementColumnRef,
	StructuredXGroupCandidate,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import type {
	ReviewCandidate,
	ReviewCandidateAxisBinding,
	ReviewCandidateBlock,
	ReviewCandidateColumnRange,
	ReviewCandidateDiagnostic,
	ReviewCandidateInterpretation,
	ReviewCandidateLegend,
	ReviewCandidateRowRange,
	ReviewContext,
	ReviewProofRange,
} from "src/cs/workbench/services/review/common/reviewModel";
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

// Candidate derivation is pure Review pipeline code: it projects DataResource
// evidence and UserTemplate snapshots into review candidates, but does not
// score or select output.
export const deriveAutomaticReviewCandidates = ({
	context,
	userTemplateSnapshot,
}: {
	readonly context: ReviewContext;
	readonly userTemplateSnapshot: UserTemplateSnapshot;
}): readonly ReviewCandidate[] =>
	sortReviewCandidates([
		...deriveDataResourceReviewCandidates({
			context,
		}),
		...deriveUserTemplateReviewCandidates({
			context,
			userTemplateSnapshot,
		}),
	]);

export const deriveDataResourceReviewCandidates = ({
	context,
}: {
	readonly context: ReviewContext;
}): readonly ReviewCandidate[] => {
	const structuredContent = context.evidence.structuredContent;
	if (!structuredContent) {
		return [];
	}

	const candidates: ReviewCandidate[] = [];
	for (const binding of structuredContent.bindingCandidates) {
		const candidate = createDataResourceReviewCandidate({
			binding,
			context,
			structuredContent,
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

const createDataResourceReviewCandidate = ({
	binding,
	context,
	structuredContent,
}: {
	readonly binding: StructuredBindingCandidate;
	readonly context: ReviewContext;
	readonly structuredContent: StructuredContentEvidence;
}): ReviewCandidate | null => {
	const projection = createDataResourceCandidateProjection({
		binding,
		structuredContent,
	});
	if (!projection.blocks.length) {
		return null;
	}

	const measurement = createCandidateMeasurementBinding(projection.measurementBlocks);
	const reviewedType = createCandidateReviewedType(projection.measurementBlocks);
	const name = getDataResourceCandidateName(projection.measurementBlocks, binding);
	const interpretation = createReviewCandidateInterpretation({
		name,
		version: 1,
		...(reviewedType ? { reviewedType } : {}),
		...(measurement ? { measurement } : {}),
		blocks: projection.blocks,
		applicability: {
			...(structuredContent.structure.fingerprint ? { schemaFingerprint: structuredContent.structure.fingerprint } : {}),
			columnCount: context.evidence.sourceMetadata.columnCount,
		},
	});

	return {
		id: `data-resource-candidate:${binding.id}`,
		source: {
			kind: "dataResource",
			bindingCandidateId: binding.id,
			semanticRulesFingerprint: structuredContent.semanticRulesFingerprint,
		},
		interpretation,
		interpretationFingerprint: createCandidateInterpretationFingerprint(interpretation),
		evidenceFingerprint: context.evidenceFingerprint,
		...(context.contentHash ? { contentHash: context.contentHash } : {}),
		...(context.modelVersion !== undefined ? { modelVersion: context.modelVersion } : {}),
		...(context.sourceVersion !== undefined ? { sourceVersion: context.sourceVersion } : {}),
		confidence: binding.confidence,
		providerRank: getDataResourceProviderRank(binding),
		selectorTrace: {
			reasons: binding.reasons,
			diagnostics: binding.ambiguityCodes.map(createReviewCandidateDiagnostic),
		},
		projectionTrace: {
			reasons: projection.reasons,
			diagnostics: projection.diagnostics,
		},
		...(projection.proofRanges.length ? {
			evidence: {
				proofRanges: projection.proofRanges,
			},
		} : {}),
		captures: {
			relation: binding.relation,
			dataBlockCandidateIds: binding.dataBlockCandidateIds,
		},
	};
};

const createDataResourceCandidateProjection = ({
	binding,
	structuredContent,
}: {
	readonly binding: StructuredBindingCandidate;
	readonly structuredContent: StructuredContentEvidence;
}): {
	readonly blocks: readonly ReviewCandidateBlock[];
	readonly diagnostics: readonly ReviewCandidateDiagnostic[];
	readonly measurementBlocks: readonly StructuredMeasurementBlockRecord[];
	readonly proofRanges: readonly ReviewProofRange[];
	readonly reasons: readonly string[];
} => {
	const blocks: ReviewCandidateBlock[] = [];
	const diagnostics: ReviewCandidateDiagnostic[] = [];
	const measurementBlocks: StructuredMeasurementBlockRecord[] = [];
	const proofRanges: ReviewProofRange[] = [];
	const reasons: string[] = [];
	for (const blockId of binding.dataBlockCandidateIds) {
		const dataBlock = structuredContent.dataBlockCandidates.find(candidate => candidate.id === blockId);
		if (!dataBlock) {
			diagnostics.push(createReviewCandidateDiagnostic("dataResourceCandidate.missingDataBlock"));
			continue;
		}

		const measurementBlock = structuredContent.blocks.find(candidate => candidate.id === dataBlock.id);
		if (measurementBlock) {
			measurementBlocks.push(measurementBlock);
			proofRanges.push(...createReviewProofRanges(dataBlock, measurementBlock));
		}

		const groupBlocks = createReviewBlocksForDataBlock({
			dataBlock,
			measurementBlock,
			structuredContent,
		});
		if (!groupBlocks.length) {
			diagnostics.push(createReviewCandidateDiagnostic("dataResourceCandidate.missingAxisBinding"));
			continue;
		}
		blocks.push(...groupBlocks);
		reasons.push("dataResourceCandidate.projectedBinding");
	}
	return {
		blocks,
		diagnostics,
		measurementBlocks,
		proofRanges: normalizeReviewProofRanges(proofRanges),
		reasons,
	};
};

const createReviewProofRanges = (
	dataBlock: StructuredDataBlockCandidate,
	measurementBlock: StructuredMeasurementBlockRecord,
): readonly ReviewProofRange[] =>
	(measurementBlock.proofColumns ?? []).map(column => ({
		column,
		startRow: dataBlock.startRow,
		endRow: dataBlock.endRow,
	}));

const normalizeReviewProofRanges = (
	ranges: readonly ReviewProofRange[],
): readonly ReviewProofRange[] => {
	const rangesByKey = new Map<string, ReviewProofRange>();
	for (const range of ranges) {
		rangesByKey.set(
			`${range.column}:${range.startRow}:${range.endRow}`,
			range,
		);
	}
	return [...rangesByKey.values()].sort((left, right) =>
		left.startRow - right.startRow ||
		left.endRow - right.endRow ||
		left.column - right.column
	);
};

const createReviewBlocksForDataBlock = ({
	dataBlock,
	measurementBlock,
	structuredContent,
}: {
	readonly dataBlock: StructuredDataBlockCandidate;
	readonly measurementBlock?: StructuredMeasurementBlockRecord;
	readonly structuredContent: StructuredContentEvidence;
}): readonly ReviewCandidateBlock[] => {
	const xGroups = dataBlock.xGroupCandidateIds
		.map(groupId => structuredContent.xGroupCandidates.find(candidate => candidate.id === groupId))
		.filter((candidate): candidate is StructuredXGroupCandidate => Boolean(candidate));
	const rowRanges = xGroups.length
		? xGroups.map(group => ({
			startRow: group.startRow,
			endRow: group.endRow,
			lineIndex: group.lineIndex,
		}))
		: [{
			startRow: dataBlock.startRow,
			endRow: dataBlock.endRow,
			lineIndex: undefined,
		}];
	const xUnit = getMeasurementColumnUnit(measurementBlock, dataBlock.xColumn);
	const yUnit = getCommonMeasurementColumnUnit(measurementBlock, dataBlock.dependentColumns);
	const legendTarget = getReviewBlockLegendTarget({
		dataBlock,
		hasMultipleXGroups: xGroups.length > 1,
		measurementBlock,
	});
	return rowRanges.map(rowRange => ({
		rowRange: {
			startRow: rowRange.startRow,
			endRow: rowRange.endRow,
		},
		x: createAxisBinding(dataBlock.xColumn, rowRange.startRow, rowRange.endRow, xUnit),
		y: createAxisBinding(dataBlock.dependentColumns, rowRange.startRow, rowRange.endRow, yUnit),
		segmentation: {
			kind: "none",
		},
		legend: {
			target: legendTarget,
			...(rowRange.lineIndex !== undefined ? { prefix: `Line ${rowRange.lineIndex + 1}` } : {}),
		},
	}));
};

const getReviewBlockLegendTarget = ({
	dataBlock,
	hasMultipleXGroups,
	measurementBlock,
}: {
	readonly dataBlock: StructuredDataBlockCandidate;
	readonly hasMultipleXGroups: boolean;
	readonly measurementBlock?: StructuredMeasurementBlockRecord;
}): ReviewCandidateLegend["target"] => {
	if (hasMultipleXGroups) {
		return "group";
	}
	if (dataBlock.dependentColumns.length < 2) {
		return "auto";
	}
	return hasDistinctDependentColumnHeaders(measurementBlock, dataBlock.dependentColumns)
		? "yColumn"
		: "auto";
};

const hasDistinctDependentColumnHeaders = (
	block: StructuredMeasurementBlockRecord | undefined,
	columns: readonly number[],
): boolean => {
	const headers = columns
		.map(column => getMeasurementColumnHeader(block, column));
	if (headers.some(header => !header)) {
		return false;
	}

	const normalizedHeaders = headers.map(header => normalizeLegendHeaderText(header ?? ""));
	return new Set(normalizedHeaders).size === columns.length;
};

const createAxisBinding = (
	columns: number | readonly number[],
	startRow: number,
	endRow: number,
	unit: string | null,
): ReviewCandidateAxisBinding => {
	const normalizedColumns = Array.isArray(columns) ? columns : [columns];
	return {
		columns: normalizedColumns,
		ranges: normalizedColumns.map((column): ReviewCandidateColumnRange => ({
			column,
			startRow,
			endRow,
		})),
		...(unit ? { unit } : {}),
	};
};

const getMeasurementColumnUnit = (
	block: StructuredMeasurementBlockRecord | undefined,
	column: number,
): string | null =>
	normalizeOptionalText(block?.columns.columns.find(candidate => candidate.rawCol === column)?.unit);

const getMeasurementColumnHeader = (
	block: StructuredMeasurementBlockRecord | undefined,
	column: number,
): string | null =>
	normalizeOptionalText(block?.columns.columns.find(candidate => candidate.rawCol === column)?.headerText);

const getCommonMeasurementColumnUnit = (
	block: StructuredMeasurementBlockRecord | undefined,
	columns: readonly number[],
): string | null => {
	const units = columns
		.map(column => getMeasurementColumnUnit(block, column))
		.filter((unit): unit is string => Boolean(unit));
	const uniqueUnits = [...new Set(units)];
	return uniqueUnits.length === 1 ? uniqueUnits[0] ?? null : null;
};

const getDataResourceCandidateName = (
	blocks: readonly StructuredMeasurementBlockRecord[],
	binding: StructuredBindingCandidate,
): string => {
	const labels = [...new Set(blocks.map(block => normalizeOptionalText(block.label)).filter(Boolean))];
	if (labels.length === 1) {
		return labels[0] ?? "Detected Data";
	}
	if (binding.relation === "manyXYpairs") {
		return "Detected XY Pairs";
	}
	if (binding.relation === "repeatedBlocks") {
		return "Detected Repeated Blocks";
	}
	if (binding.relation === "oneX-manyY") {
		return "Detected Shared X Data";
	}
	return "Detected Data";
};

const getDataResourceProviderRank = (
	binding: StructuredBindingCandidate,
): number => {
	const relationRank = binding.relation === "manyXYpairs"
		? 20
		: binding.relation === "repeatedBlocks"
			? 30
			: binding.relation === "oneX-manyY"
				? 10
			: 0;
	return Math.round(binding.confidence * 100) + relationRank;
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
		if (!isAxisInBounds(block.x, columnCount, rowCount)) {
			diagnostics.add("userTemplate.xAxisOutOfBounds");
		}
		if (!isAxisInBounds(block.y, columnCount, rowCount)) {
			diagnostics.add("userTemplate.yAxisOutOfBounds");
		}
	}
	const interpretation = createReviewCandidateInterpretation({
		name: template.name,
		version: template.version,
		...(template.measurement ? { measurement: template.measurement } : {}),
		blocks: template.blocks,
		...(template.applicability ? { applicability: template.applicability } : {}),
	});

	return {
		id: `user-template-candidate:${userTemplate.id}`,
		source: {
			kind: "user",
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
	reviewedType,
	version,
}: ReviewCandidateInterpretation): ReviewCandidateInterpretation => ({
	name,
	version,
	...(reviewedType ? { reviewedType } : {}),
	...(measurement ? { measurement } : {}),
	blocks,
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
	reviewedType,
	version,
	} = interpretation;
	return createReviewInterpretationFingerprint({
		schemaVersion: 1,
		name,
		version,
	...(reviewedType ? { reviewedType } : {}),
	...(measurement ? { measurement } : {}),
	blocks,
		...(applicability ? { applicability } : {}),
	});
};

const createCandidateMeasurementBinding = (
	blocks: readonly StructuredMeasurementBlockRecord[],
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

const createCandidateReviewedType = (
	blocks: readonly StructuredMeasurementBlockRecord[],
): string | undefined => {
	const types = blocks
		.map(block => normalizeOptionalText(block.type))
		.filter((type): type is string => Boolean(type));
	const uniqueTypes = [...new Set(types)];
	return uniqueTypes.length === 1 && types.length === blocks.length
		? uniqueTypes[0]
		: undefined;
};

const createTemplateMeasurementBinding = (
	block: StructuredMeasurementBlockRecord,
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
	rowCount: number,
): boolean =>
	axis.columns.length > 0 &&
	axis.columns.every(column => isColumnInBounds(column, columnCount)) &&
	(axis.ranges ?? []).every(range =>
		isColumnInBounds(range.column, columnCount) &&
		isRowRangeInBounds({
			startRow: range.startRow,
			endRow: range.endRow,
		}, rowCount)
	);

const isColumnInBounds = (
	column: number,
	columnCount: number,
): boolean =>
	Number.isInteger(column) &&
	column >= 0 &&
	column < columnCount;

const normalizeOptionalText = (
	value: unknown,
): string | null => {
	const normalized = String(value ?? "").trim();
	return normalized || null;
};

const normalizeLegendHeaderText = (
	value: string,
): string => value.trim().toLowerCase();

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
