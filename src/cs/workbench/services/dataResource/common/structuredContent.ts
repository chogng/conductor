/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type StructuredContentSourceRange = {
	readonly startRow: number;
	readonly endRow: number;
	readonly startCol: number;
	readonly endCol: number;
};

export type StructuredContentDiagnosticSeverity = "info" | "warning" | "error" | "fatal";

export type StructuredContentDiagnostic = {
	readonly severity: StructuredContentDiagnosticSeverity;
	readonly code: string;
	readonly message: string;
	readonly sourceRange?: StructuredContentSourceRange;
	readonly relatedBlockId?: string;
	readonly relatedGroupId?: string;
};

export type StructuredSchemaFingerprint = string;

export type StructuredContentHeaderRowCandidate = {
	readonly rowIndex: number;
	readonly range: StructuredContentSourceRange;
	readonly confidence: number;
	readonly source: "dataName" | "strippedChannel" | "measurementHeader" | "numericFollower" | "fallback";
};

export type StructuredContentUnitRowCandidate = {
	readonly rowIndex: number;
	readonly range: StructuredContentSourceRange;
	readonly confidence: number;
};

export type StructuredContentDataRegion = {
	readonly id: string;
	readonly range: StructuredContentSourceRange;
	readonly rowCount: number;
	readonly columnCount: number;
};

export type StructuredContentBlockRegion = {
	readonly id: string;
	readonly range: StructuredContentSourceRange;
	readonly kind: "single" | "repeatedHeader";
};

export type StructuredContentStructure = {
	readonly headerRows: readonly StructuredContentHeaderRowCandidate[];
	readonly unitRows: readonly StructuredContentUnitRowCandidate[];
	readonly dataRegions: readonly StructuredContentDataRegion[];
	readonly blockRegions: readonly StructuredContentBlockRegion[];
	readonly fingerprint: StructuredSchemaFingerprint;
};

export const createEmptyStructuredContentStructure = (): StructuredContentStructure => ({
	headerRows: [],
	unitRows: [],
	dataRegions: [],
	blockRegions: [],
	fingerprint: "",
});

export type StructuredColumnKind = "numeric" | "text" | "mixed" | "empty";

export type StructuredColumnNumericStats = {
	readonly sampleCount: number;
	readonly finiteCount: number;
	readonly min: number;
	readonly max: number;
	readonly medianAbs: number;
	readonly exponentMin: number;
	readonly exponentMax: number;
	readonly monotonicity: number;
	readonly uniqueRatio: number;
	readonly span: number;
};

export type StructuredColumnProfile = {
	readonly rawCol: number;
	readonly headerText: string;
	readonly normalizedHeader: string;
	readonly explicitUnitText?: string | null;
	readonly kind: StructuredColumnKind;
	readonly numericStats?: StructuredColumnNumericStats;
};

export type StructuredAxisTendency = "x" | "dependent" | "unknown";

export type StructuredXRangeDirection = "ascending" | "descending" | "mixed";

export type StructuredXRangeStepKind =
	| "constant"
	| "nearlyConstant"
	| "pointsDerived"
	| "segmentedConstant"
	| "ratioConstant";

export type StructuredXRangeCandidate = {
	readonly id: string;
	readonly column: number;
	readonly startRow: number;
	readonly endRow: number;
	readonly direction: StructuredXRangeDirection;
	readonly stepKind: StructuredXRangeStepKind;
	readonly step?: number;
	readonly pointCount: number;
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export type StructuredXGroupCandidate = {
	readonly id: string;
	readonly xRangeCandidateId: string;
	readonly startRow: number;
	readonly endRow: number;
	readonly direction: Exclude<StructuredXRangeDirection, "mixed">;
	readonly groupKind: "singleMonotonicRun" | "directionBreak" | "reset" | "repeatedPattern";
	readonly lineIndex: number;
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export type StructuredDataBlockCandidate = {
	readonly id: string;
	readonly xRangeCandidateId: string;
	readonly xGroupCandidateIds: readonly string[];
	readonly startRow: number;
	readonly endRow: number;
	readonly startCol: number;
	readonly endCol: number;
	readonly xColumn: number;
	readonly dependentColumns: readonly number[];
	readonly separatorColumns: readonly number[];
	readonly columnDirection: "rightPreferred" | "leftObserved" | "mixed";
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export type StructuredDependentValueCandidate = {
	readonly id: string;
	readonly column: number;
	readonly xRangeCandidateIds: readonly string[];
	readonly dataBlockCandidateIds: readonly string[];
	readonly numericCoverage: number;
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export type StructuredColumnTitleSpanEvidence = {
	readonly id: string;
	readonly titleCell: {
		readonly row: number;
		readonly column: number;
		readonly text: string;
	};
	readonly targetColumn: number;
	readonly startRow: number;
	readonly endRow: number;
	readonly normalizedTitle: string;
	readonly canonicalRole: StructuredMeasurementColumnRole;
	readonly canonicalUnit?: StructuredCanonicalUnit;
	readonly axisTendency: StructuredAxisTendency;
	readonly semanticRules: readonly StructuredRuleEvidence[];
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export type StructuredRuleEvidence = {
	readonly id: string;
	readonly label: string;
	readonly badge?: string;
	readonly axisTendency: StructuredAxisTendency;
	readonly priority: number;
	readonly priorityIndex: number;
	readonly source: "builtin" | "user";
};

export type StructuredXAxisRole =
	| "time"
	| "voltage"
	| "current"
	| "frequency"
	| "temperature"
	| "position"
	| "index"
	| "unknown";

export type StructuredXAxisIntent =
	| "rawTransient"
	| "ivCurve"
	| "pvCurve"
	| "cvCurve"
	| "frequencySweep"
	| "genericXY";

export type StructuredInfoCellNeighborDirection = "up" | "down" | "left" | "right";

export type StructuredInfoCellNeighborhoodEvidence = {
	readonly id: string;
	readonly infoCell: {
		readonly row: number;
		readonly column: number;
		readonly text: string;
	};
	readonly targetColumn: number;
	readonly startRow: number;
	readonly endRow: number;
	readonly neighbors: readonly {
		readonly direction: StructuredInfoCellNeighborDirection;
		readonly row: number;
		readonly column: number;
		readonly text: string;
	}[];
	readonly xRoleCandidates: readonly {
		readonly role: StructuredXAxisRole;
		readonly confidence: number;
		readonly reasons: readonly string[];
	}[];
	readonly intentCandidates: readonly {
		readonly intent: StructuredXAxisIntent;
		readonly confidence: number;
		readonly reasons: readonly string[];
	}[];
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export type StructuredBindingRelation =
	| "oneX-oneY"
	| "oneX-manyY"
	| "manyXYpairs"
	| "repeatedBlocks"
	| "segmentedSweep"
	| "matrixEncoded";

export type StructuredBindingCandidate = {
	readonly id: string;
	readonly xRangeCandidateIds: readonly string[];
	readonly dependentValueCandidateIds: readonly string[];
	readonly dataBlockCandidateIds: readonly string[];
	readonly relation: StructuredBindingRelation;
	readonly confidence: number;
	readonly ambiguityCodes: readonly string[];
	readonly reasons: readonly string[];
};

export type StructuredMeasurementFamily = "iv" | "cv" | "cf" | "pv" | "it" | "unknown";

export type StructuredIvSweepMode = "transfer" | "output" | "unknown";

export type StructuredItSweepMode = "stability" | "transient" | "retention" | "unknown";

export type StructuredMeasurementColumnRole =
	| "vd"
	| "vg"
	| "vs"
	| "id"
	| "ig"
	| "is"
	| "capacitance"
	| "conductance"
	| "frequency"
	| "time"
	| "voltage"
	| "current"
	| "unknown";

export type StructuredMeasurementColumnRef = {
	readonly rawCol: number;
	readonly headerText: string;
	readonly role: StructuredMeasurementColumnRole;
	readonly unit?: string | null;
	readonly dataRange?: StructuredContentSourceRange;
	readonly sourceRange?: StructuredContentSourceRange;
	readonly confidence?: number;
};

export type StructuredMeasurementColumnMap = {
	readonly columns: readonly StructuredMeasurementColumnRef[];
};

export type StructuredMeasurementBlockSource = {
	readonly fullRange: StructuredContentSourceRange;
	readonly headerRange?: StructuredContentSourceRange;
	readonly dataRange?: StructuredContentSourceRange;
	readonly titleRange?: StructuredContentSourceRange;
};

export type StructuredMeasurementGroupRecord = {
	readonly id: string;
	readonly fileId: string;
	readonly rawTableId: string;
	readonly label: string;
	readonly titleRange?: StructuredContentSourceRange;
	readonly blockIds: readonly string[];
	readonly confidence?: number;
};

export type StructuredMeasurementBlockRecord = {
	readonly id: string;
	readonly fileId: string;
	readonly rawTableId: string;
	readonly groupId?: string;
	readonly label: string;
	readonly badge?: string;
	readonly family: StructuredMeasurementFamily;
	readonly ivMode?: StructuredIvSweepMode;
	readonly itMode?: StructuredItSweepMode;
	readonly source: StructuredMeasurementBlockSource;
	readonly columns: StructuredMeasurementColumnMap;
	readonly rowCount: number;
	readonly columnCount: number;
	readonly confidence?: number;
	readonly diagnosticCodes: readonly string[];
};

export type StructuredEvidenceSource =
	| "header"
	| "unitRow"
	| "schemaProfile"
	| "roleDefault";

export type StructuredCanonicalUnit = "V" | "A" | "ohm" | "s" | "F" | "Hz" | "S";

export type StructuredColumnSemanticCandidate = {
	readonly rawCol: number;
	readonly roleCandidates: readonly {
		readonly role: StructuredMeasurementColumnRole;
		readonly confidence: number;
		readonly sources: readonly StructuredEvidenceSource[];
	}[];
	readonly unitCandidates: readonly {
		readonly canonicalUnit: StructuredCanonicalUnit;
		readonly confidence: number;
		readonly sources: readonly StructuredEvidenceSource[];
		readonly confirmed: boolean;
	}[];
	readonly displayScale?: {
		readonly unitLabel: "nA" | "uA" | "mA" | "MOhm" | "ms" | string;
		readonly scale: number;
		readonly source: "valueDistribution";
	};
};

export type StructuredContentRowWindow = {
	readonly startRowIndex: number;
	readonly rows: readonly (readonly string[])[];
};

export type StructuredContentGridSnapshot = {
	readonly columnCount: number;
	readonly maxCellLengths: readonly number[];
	readonly rowCount: number;
	readonly rows: readonly (readonly string[])[];
	readonly rowWindows?: readonly StructuredContentRowWindow[];
};

export type StructuredContentEvidence = {
	readonly structure: StructuredContentStructure;
	readonly columnProfiles: readonly StructuredColumnProfile[];
	readonly xRangeCandidates: readonly StructuredXRangeCandidate[];
	readonly xGroupCandidates: readonly StructuredXGroupCandidate[];
	readonly dataBlockCandidates: readonly StructuredDataBlockCandidate[];
	readonly dependentValueCandidates: readonly StructuredDependentValueCandidate[];
	readonly columnTitleSpans: readonly StructuredColumnTitleSpanEvidence[];
	readonly infoCellNeighborhoods: readonly StructuredInfoCellNeighborhoodEvidence[];
	readonly bindingCandidates: readonly StructuredBindingCandidate[];
	readonly semanticRulesFingerprint: string;
	readonly semanticCandidates: readonly StructuredColumnSemanticCandidate[];
	readonly groups: readonly StructuredMeasurementGroupRecord[];
	readonly blocks: readonly StructuredMeasurementBlockRecord[];
	readonly diagnostics: readonly StructuredContentDiagnostic[];
};

export const readStructuredContentRows = (
	content: StructuredContentGridSnapshot | null | undefined,
	startRowIndex = 0,
	endRowIndexExclusive = content?.rowCount ?? 0,
): readonly (readonly string[])[] => {
	if (!content) {
		return [];
	}

	const start = clampInteger(startRowIndex, 0, content.rowCount);
	const end = clampInteger(endRowIndexExclusive, start, content.rowCount);
	if (start >= end) {
		return [];
	}

	if (!content.rowWindows?.length) {
		return content.rows.slice(start, end);
	}

	const rows: (readonly string[])[] = [];
	for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
		const row = getStructuredContentRow(content, rowIndex);
		if (!row) {
			break;
		}
		rows.push(row);
	}
	return rows;
};

const getStructuredContentRow = (
	content: StructuredContentGridSnapshot,
	rowIndex: number,
): readonly string[] | undefined =>
	getStructuredContentWindowRow(content.rowWindows ?? [], rowIndex) ??
	content.rows[rowIndex];

const getStructuredContentWindowRow = (
	rowWindows: readonly StructuredContentRowWindow[],
	rowIndex: number,
): readonly string[] | undefined => {
	for (const rowWindow of rowWindows) {
		const start = normalizeNonNegativeInteger(rowWindow.startRowIndex);
		const offset = rowIndex - start;
		if (offset >= 0 && offset < rowWindow.rows.length) {
			return rowWindow.rows[offset];
		}
	}
	return undefined;
};

const clampInteger = (
	value: number,
	minimum: number,
	maximum: number,
): number =>
	Math.min(Math.max(normalizeNonNegativeInteger(value), minimum), maximum);

const normalizeNonNegativeInteger = (value: number): number =>
	Number.isFinite(value)
		? Math.max(0, Math.floor(value))
		: 0;
