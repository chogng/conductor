/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type TableProjectionSourceRange = {
	readonly startRow: number;
	readonly endRow: number;
	readonly startCol: number;
	readonly endCol: number;
};

export type TableProjectionDiagnosticSeverity = "info" | "warning" | "error" | "fatal";

export type TableProjectionDiagnostic = {
	readonly severity: TableProjectionDiagnosticSeverity;
	readonly code: string;
	readonly message: string;
	readonly sourceRange?: TableProjectionSourceRange;
	readonly relatedBlockId?: string;
	readonly relatedGroupId?: string;
};

export type SchemaFingerprint = string;

export type TableProjectionHeaderRowCandidate = {
	readonly rowIndex: number;
	readonly range: TableProjectionSourceRange;
	readonly confidence: number;
	readonly source: "dataName" | "strippedChannel" | "measurementHeader" | "numericFollower" | "fallback";
};

export type TableProjectionUnitRowCandidate = {
	readonly rowIndex: number;
	readonly range: TableProjectionSourceRange;
	readonly confidence: number;
};

export type TableProjectionDataRegion = {
	readonly id: string;
	readonly range: TableProjectionSourceRange;
	readonly rowCount: number;
	readonly columnCount: number;
};

export type TableProjectionBlockRegion = {
	readonly id: string;
	readonly range: TableProjectionSourceRange;
	readonly kind: "single" | "repeatedHeader";
};

export type TableProjectionStructure = {
	readonly headerRows: readonly TableProjectionHeaderRowCandidate[];
	readonly unitRows: readonly TableProjectionUnitRowCandidate[];
	readonly dataRegions: readonly TableProjectionDataRegion[];
	readonly blockRegions: readonly TableProjectionBlockRegion[];
	readonly fingerprint: SchemaFingerprint;
};

export const createEmptyTableProjectionStructure = (): TableProjectionStructure => ({
	headerRows: [],
	unitRows: [],
	dataRegions: [],
	blockRegions: [],
	fingerprint: "",
});

export type ColumnKind = "numeric" | "text" | "mixed" | "empty";

export type ColumnNumericStats = {
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

export type ColumnProfile = {
	readonly rawCol: number;
	readonly headerText: string;
	readonly normalizedHeader: string;
	readonly explicitUnitText?: string | null;
	readonly kind: ColumnKind;
	readonly numericStats?: ColumnNumericStats;
};

export type LayoutKind =
	| "metadataPreamble"
	| "repeatedBlock"
	| "groupedSweep"
	| "wideMatrix"
	| "timeSeries"
	| "pairwiseXY"
	| "sharedXMultiY"
	| "simpleXY"
	| "unknown";

export type LayoutBindingDraft = {
	readonly blockRegionId?: string;
	readonly dataRange?: TableProjectionSourceRange;
	readonly headerRange?: TableProjectionSourceRange;
	readonly xCol?: number;
	readonly yCols?: readonly number[];
	readonly groupByCol?: number;
	readonly pointCol?: number;
	readonly biasCols?: readonly number[];
};

export type LayoutCandidate = {
	readonly id: string;
	readonly layoutKind: LayoutKind;
	readonly confidence: number;
	readonly bindings: readonly LayoutBindingDraft[];
	readonly reasons: readonly string[];
};

export type MeasurementFamily = "iv" | "cv" | "cf" | "pv" | "it" | "unknown";

export type IvSweepMode = "transfer" | "output" | "unknown";

export type ItSweepMode = "stability" | "transient" | "retention" | "unknown";

export type MeasurementColumnRole =
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

export type MeasurementColumnRef = {
	readonly rawCol: number;
	readonly headerText: string;
	readonly role: MeasurementColumnRole;
	readonly unit?: string | null;
	readonly sourceRange?: TableProjectionSourceRange;
	readonly confidence?: number;
};

export type MeasurementColumnMap = {
	readonly columns: readonly MeasurementColumnRef[];
};

export type MeasurementBlockSource = {
	readonly fullRange: TableProjectionSourceRange;
	readonly headerRange?: TableProjectionSourceRange;
	readonly dataRange?: TableProjectionSourceRange;
	readonly titleRange?: TableProjectionSourceRange;
};

export type MeasurementGroupRecord = {
	readonly id: string;
	readonly fileId: string;
	readonly rawTableId: string;
	readonly label: string;
	readonly titleRange?: TableProjectionSourceRange;
	readonly blockIds: readonly string[];
	readonly confidence?: number;
};

export type MeasurementBlockRecord = {
	readonly id: string;
	readonly fileId: string;
	readonly rawTableId: string;
	readonly groupId?: string;
	readonly label: string;
	readonly family: MeasurementFamily;
	readonly ivMode?: IvSweepMode;
	readonly itMode?: ItSweepMode;
	readonly source: MeasurementBlockSource;
	readonly columns: MeasurementColumnMap;
	readonly rowCount: number;
	readonly columnCount: number;
	readonly confidence?: number;
	readonly diagnosticCodes: readonly string[];
};

export type TableProjectionEvidenceSource =
	| "header"
	| "unitRow"
	| "schemaProfile"
	| "roleDefault";

export type CanonicalUnit = "V" | "A" | "ohm" | "s" | "F" | "Hz" | "S";

export type ColumnSemanticCandidate = {
	readonly rawCol: number;
	readonly roleCandidates: readonly {
		readonly role: MeasurementColumnRole;
		readonly confidence: number;
		readonly sources: readonly TableProjectionEvidenceSource[];
	}[];
	readonly unitCandidates: readonly {
		readonly canonicalUnit: CanonicalUnit;
		readonly confidence: number;
		readonly sources: readonly TableProjectionEvidenceSource[];
		readonly confirmed: boolean;
	}[];
	readonly displayScale?: {
		readonly unitLabel: "nA" | "uA" | "mA" | "MOhm" | "ms" | string;
		readonly scale: number;
		readonly source: "valueDistribution";
	};
};
