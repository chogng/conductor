/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ColumnProfile } from "src/cs/workbench/services/tableModel/common/columnProfile";
import type { TableModelDiagnostic } from "src/cs/workbench/services/tableModel/common/diagnostics";
import type { LayoutCandidate } from "src/cs/workbench/services/tableModel/common/layoutCandidate";
import type {
	MeasurementBlockRecord,
	MeasurementGroupRecord,
} from "src/cs/workbench/services/tableModel/common/measurement";
import type { RawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";
import type { ColumnSemanticCandidate } from "src/cs/workbench/services/tableModel/common/semanticCandidate";

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
	readonly structure: RawTableStructure;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly layoutCandidates: readonly LayoutCandidate[];
	readonly semanticCandidates: readonly ColumnSemanticCandidate[];
	readonly groups: readonly MeasurementGroupRecord[];
	readonly blocks: readonly MeasurementBlockRecord[];
	readonly diagnostics: readonly TableModelDiagnostic[];
};
