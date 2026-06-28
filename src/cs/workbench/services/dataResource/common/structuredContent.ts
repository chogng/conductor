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

export type StructuredLayoutKind =
	| "metadataPreamble"
	| "repeatedBlock"
	| "groupedSweep"
	| "wideMatrix"
	| "timeSeries"
	| "pairwiseXY"
	| "sharedXMultiY"
	| "simpleXY"
	| "unknown";

export type StructuredLayoutBindingDraft = {
	readonly blockRegionId?: string;
	readonly dataRange?: StructuredContentSourceRange;
	readonly headerRange?: StructuredContentSourceRange;
	readonly xCol?: number;
	readonly yCols?: readonly number[];
	readonly groupByCol?: number;
	readonly pointCol?: number;
	readonly biasCols?: readonly number[];
};

export type StructuredLayoutCandidate = {
	readonly id: string;
	readonly layoutKind: StructuredLayoutKind;
	readonly confidence: number;
	readonly bindings: readonly StructuredLayoutBindingDraft[];
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
	readonly layoutCandidates: readonly StructuredLayoutCandidate[];
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
