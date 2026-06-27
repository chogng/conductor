/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ReviewDiagnostic,
	CandidateReview,
	ReviewCandidate,
	ReviewCandidateAxisBinding,
	ReviewCandidateInterpretation,
	ReviewCandidateRowRange,
	ReviewContext,
	ReviewFactors,
	ReviewFinding,
} from "src/cs/workbench/services/review/common/reviewModel";

const READY_CONFIDENCE = 0.85;
const INVALID_CONFIDENCE = 0.5;
const AMBIGUITY_MARGIN = 0.05;

export const scoreReviewCandidates = ({
	candidates,
	context,
}: {
	readonly candidates: readonly ReviewCandidate[];
	readonly context: ReviewContext;
}): readonly CandidateReview[] => {
	const baseScores = new Map<string, number>();
	for (const candidate of candidates) {
		baseScores.set(candidate.id, getBaseConfidence(createBaseFactors(candidate, context)));
	}

	const orderedBaseScores = [...baseScores.entries()]
		.sort((left, right) => right[1] - left[1]);
	const topScore = orderedBaseScores[0]?.[1] ?? 0;
	const secondScore = orderedBaseScores[1]?.[1] ?? 0;
	const isAmbiguous = candidates.length > 1 && topScore - secondScore < AMBIGUITY_MARGIN;

	return candidates.map(candidate =>
		scoreReviewCandidate({
			ambiguityPenalty: isAmbiguous ? 0.15 : 0,
			candidate,
			context,
		})
	);
};

export const scoreReviewCandidate = ({
	ambiguityPenalty = 0,
	candidate,
	context,
}: {
	readonly ambiguityPenalty?: number;
	readonly candidate: ReviewCandidate;
	readonly context: ReviewContext;
}): CandidateReview => {
	const findings = createReviewFindings(candidate, context, ambiguityPenalty);
	const baseFactors = createBaseFactors(candidate, context);
	const diagnosticPenalty = getDiagnosticPenalty(candidate, findings);
	const factors: ReviewFactors = {
		...baseFactors,
		ambiguityPenalty,
		conflictPenalty: 0,
		diagnosticPenalty,
	};
	const hardGate = findings.some(finding => finding.blocking);
	const cappedConfidence = applyConfidenceCaps(
		getBaseConfidence(factors) - ambiguityPenalty - factors.conflictPenalty - diagnosticPenalty,
		findings,
	);
	const confidence = hardGate ? 0 : clampConfidence(cappedConfidence);
	const hasRepairableProjectionFinding = findings.some(isRepairableProjectionFinding);
	const status = hardGate
		? "invalid"
		: confidence >= READY_CONFIDENCE && ambiguityPenalty === 0
			? "ready"
			: confidence >= INVALID_CONFIDENCE || hasRepairableProjectionFinding
				? "needsAdjustment"
				: "invalid";

	return {
		candidateId: candidate.id,
		interpretationFingerprint: candidate.interpretationFingerprint,
		status,
		confidence,
		factors,
		findings,
		reasons: [
			...candidate.selectorTrace.reasons,
			...candidate.projectionTrace.reasons,
		],
		diagnostics: getCandidateDiagnostics(candidate),
	};
};

export const createManualCandidateReview = ({
	candidateId,
	confidence,
	diagnostics,
	reasons,
	status,
	interpretationFingerprint,
}: {
	readonly candidateId: string;
	readonly confidence: number;
	readonly diagnostics: readonly ReviewDiagnostic[];
	readonly reasons: readonly string[];
	readonly status: CandidateReview["status"];
	readonly interpretationFingerprint: string;
}): CandidateReview => {
	const normalizedConfidence = clampConfidence(confidence);
	return {
		candidateId,
		interpretationFingerprint,
		status,
		confidence: normalizedConfidence,
		factors: {
			selectorScore: normalizedConfidence,
			projectionScore: normalizedConfidence,
			semanticScore: normalizedConfidence,
			dataQualityScore: normalizedConfidence,
			parseHealthScore: 1,
			freshnessScore: 1,
			ambiguityPenalty: 0,
			conflictPenalty: 0,
			diagnosticPenalty: diagnostics.length ? 0.25 : 0,
		},
		findings: diagnostics.map(diagnostic => ({
			severity: diagnostic.severity,
			code: diagnostic.code,
			message: diagnostic.message,
			blocking: status === "invalid",
		})),
		reasons,
		diagnostics,
	};
};

const createBaseFactors = (
	candidate: ReviewCandidate,
	context: ReviewContext,
): Omit<ReviewFactors, "ambiguityPenalty" | "conflictPenalty" | "diagnosticPenalty"> => ({
	selectorScore: candidate.selectorTrace.diagnostics.length ? 0.45 : 1,
	projectionScore: getProjectionScore(candidate, context),
	semanticScore: clampConfidence(candidate.confidence),
	dataQualityScore: getDataQualityScore(context),
	parseHealthScore: getParseHealthScore(context),
	freshnessScore: getFreshnessScore(candidate, context),
});

const getBaseConfidence = (
	factors: Omit<ReviewFactors, "ambiguityPenalty" | "conflictPenalty" | "diagnosticPenalty">,
): number =>
	0.25 * factors.selectorScore +
	0.25 * factors.projectionScore +
	0.20 * factors.semanticScore +
	0.15 * factors.dataQualityScore +
	0.10 * factors.parseHealthScore +
	0.05 * factors.freshnessScore;

const getProjectionScore = (
	candidate: ReviewCandidate,
	context: ReviewContext,
): number => {
	if (candidate.projectionTrace.diagnostics.length) {
		return 0.45;
	}
	const rangeFindings = validateCandidateInterpretationRanges(candidate.interpretation, context);
	return rangeFindings.length ? 0.35 : 1;
};

const getDataQualityScore = (
	context: ReviewContext,
): number => {
	const rowCount = Number(context.evidence.sourceMetadata.rowCount);
	const columnCount = Number(context.evidence.sourceMetadata.columnCount);
	if (!Number.isInteger(rowCount) || rowCount <= 0 || !Number.isInteger(columnCount) || columnCount <= 0) {
		return 0;
	}
	const blocks = context.evidence.tableProjection?.blocks ?? [];
	if (!blocks.length) {
		return 0.4;
	}
	return clampConfidence(Math.min(1, 0.7 + blocks.length * 0.1));
};

const getParseHealthScore = (
	context: ReviewContext,
): number => {
	const diagnostics = context.evidence.tableProjection?.diagnostics ?? [];
	const fatalCount = diagnostics.filter(diagnostic => diagnostic.severity === "fatal").length;
	const errorCount = diagnostics.filter(diagnostic => diagnostic.severity === "error").length;
	const warningCount = diagnostics.filter(diagnostic => diagnostic.severity === "warning").length;
	return clampConfidence(1 - fatalCount - errorCount * 0.5 - warningCount * 0.15);
};

const getFreshnessScore = (
	candidate: ReviewCandidate,
	context: ReviewContext,
): number => {
	return getFreshnessFindings(candidate, context).length ? 0 : 1;
};

const createReviewFindings = (
	candidate: ReviewCandidate,
	context: ReviewContext,
	ambiguityPenalty: number,
): readonly ReviewFinding[] => {
	const findings: ReviewFinding[] = [];
	findings.push(...getFreshnessFindings(candidate, context));
	const tableProjection = context.evidence.tableProjection;
	if (tableProjection?.diagnostics.some(diagnostic => diagnostic.severity === "fatal")) {
		findings.push(createFinding("error", "review.parserFatalDiagnostic", "Parser diagnostics contain a fatal error.", true));
	}
	if (!tableProjection?.blocks.length) {
		findings.push(createFinding("warning", "review.noMeasurementBlocks", "No measurement block evidence is available."));
	}
	for (const diagnostic of getCandidateDiagnostics(candidate)) {
		findings.push(createFinding(
			diagnostic.severity,
			diagnostic.code,
			diagnostic.message,
			diagnostic.severity === "error",
		));
	}
	findings.push(...validateCandidateInterpretationRanges(candidate.interpretation, context));
	if (ambiguityPenalty > 0) {
		findings.push(createFinding("warning", "review.ambiguousCandidates", "Top review candidates are too close to auto-apply."));
	}
	return findings;
};

const getFreshnessFindings = (
	candidate: ReviewCandidate,
	context: ReviewContext,
): readonly ReviewFinding[] => {
	const findings: ReviewFinding[] = [];
	if (candidate.evidenceFingerprint !== context.evidenceFingerprint) {
		findings.push(createFinding("error", "review.staleEvidence", "Candidate evidence is stale.", true));
	}
	if (context.contentHash && candidate.contentHash !== context.contentHash) {
		findings.push(createFinding("error", "review.staleContentHash", "Candidate content hash is stale.", true));
	}
	if (candidate.modelVersion !== context.modelVersion) {
		findings.push(createFinding("error", "review.staleModelVersion", "Candidate model version is stale.", true));
	}
	if (candidate.sourceVersion !== context.sourceVersion) {
		findings.push(createFinding("error", "review.staleSourceVersion", "Candidate source version is stale.", true));
	}
	return findings;
};

const validateCandidateInterpretationRanges = (
	interpretation: ReviewCandidateInterpretation,
	context: ReviewContext,
): readonly ReviewFinding[] => {
	const findings: ReviewFinding[] = [];
	const rawRowCount = context.evidence.sourceMetadata.rowCount;
	const rawColumnCount = context.evidence.sourceMetadata.columnCount;
	const rowCount = typeof rawRowCount === "number" && Number.isInteger(rawRowCount) && rawRowCount > 0
		? rawRowCount
		: undefined;
	const columnCount = typeof rawColumnCount === "number" && Number.isInteger(rawColumnCount) && rawColumnCount > 0
		? rawColumnCount
		: undefined;
	if (rowCount === undefined) {
		findings.push(createFinding("error", "review.invalidRowCount", "Review evidence has no valid row count.", true));
	}
	if (columnCount === undefined) {
		findings.push(createFinding("error", "review.invalidColumnCount", "Review evidence has no valid column count.", true));
	}
	if (!interpretation.blocks.length) {
		findings.push(createFinding("warning", "review.missingProjectionBlock", "Candidate has no projected blocks."));
		return findings;
	}
	if (rowCount === undefined || columnCount === undefined) {
		return findings;
	}
	for (const block of interpretation.blocks) {
		if (!isRowRangeInBounds(block.rowRange, rowCount)) {
			findings.push(createFinding("error", "review.rangeOutOfBounds", "Candidate row range is out of bounds.", true));
		}
		if (!isAxisInBounds(block.x, columnCount)) {
			findings.push(createFinding("warning", "review.xAxisOutOfBounds", "Candidate X axis is out of bounds."));
		}
		if (!isAxisInBounds(block.y, columnCount)) {
			findings.push(createFinding("warning", "review.yAxisOutOfBounds", "Candidate Y axis is out of bounds."));
		}
	}
	return findings;
};

const applyConfidenceCaps = (
	confidence: number,
	findings: readonly ReviewFinding[],
): number => {
	if (findings.some(finding => finding.code === "review.rangeOutOfBounds")) {
		return Math.min(confidence, 0.39);
	}
	if (findings.some(finding => finding.code === "recipeCandidate.missingRoleBinding" || finding.code === "recipeCandidate.missingBlock")) {
		return Math.min(confidence, 0.49);
	}
	if (findings.some(finding => finding.code === "review.missingProjectionBlock")) {
		return Math.min(confidence, 0.49);
	}
	if (findings.some(finding => finding.code === "review.xAxisOutOfBounds" || finding.code === "review.yAxisOutOfBounds")) {
		return Math.min(confidence, 0.69);
	}
	return confidence;
};

const isRepairableProjectionFinding = (
	finding: ReviewFinding,
): boolean =>
	finding.code === "recipeCandidate.missingRoleBinding" ||
	finding.code === "recipeCandidate.missingBlock" ||
	finding.code === "review.missingProjectionBlock";

const getDiagnosticPenalty = (
	candidate: ReviewCandidate,
	findings: readonly ReviewFinding[],
): number =>
	Math.min(0.4, getCandidateDiagnostics(candidate).length * 0.1 + findings.filter(finding => finding.severity === "warning").length * 0.05);

const getCandidateDiagnostics = (
	candidate: ReviewCandidate,
): readonly ReviewDiagnostic[] => [
	...candidate.selectorTrace.diagnostics,
	...candidate.projectionTrace.diagnostics,
];

const createFinding = (
	severity: ReviewFinding["severity"],
	code: string,
	message: string,
	blocking?: boolean,
): ReviewFinding => ({
	severity,
	code,
	message,
	...(blocking ? { blocking } : {}),
});

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
	axis.columns.every(column => Number.isInteger(column) && column >= 0 && column < columnCount);

const clampConfidence = (
	value: unknown,
): number => {
	const confidence = Number(value);
	if (!Number.isFinite(confidence)) {
		return 0;
	}
	return Math.max(0, Math.min(1, confidence));
};
