/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ColumnProfile,
	ColumnSemanticCandidate,
	LayoutCandidate,
	MeasurementBlockRecord,
	MeasurementGroupRecord,
	TableProjectionDiagnostic,
	TableProjectionStructure,
} from "src/cs/workbench/services/table/common/tableProjection";

export type ReviewSourceMetadata = {
	readonly columnCount?: number;
	readonly contentHash?: string;
	readonly fileName?: string | null;
	readonly rowCount?: number;
	readonly sourceModelVersion?: number;
	readonly sourceUri?: string;
	readonly sourceVersion?: number;
};

export type ReviewEvidence = {
	readonly sourceMetadata: ReviewSourceMetadata;
	readonly tableProjection?: ReviewTableProjectionEvidence;
};

export type ReviewTableProjectionEvidence = {
	readonly structure: TableProjectionStructure;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly layoutCandidates: readonly LayoutCandidate[];
	readonly semanticCandidates: readonly ColumnSemanticCandidate[];
	readonly groups: readonly MeasurementGroupRecord[];
	readonly blocks: readonly MeasurementBlockRecord[];
	readonly diagnostics: readonly TableProjectionDiagnostic[];
};
