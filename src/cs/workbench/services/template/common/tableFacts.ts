/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ColumnProfile } from "src/cs/workbench/services/assessment/common/columnProfile";
import type { LayoutCandidate } from "src/cs/workbench/services/assessment/common/layoutCandidate";
import type { MeasurementBlockRecord } from "src/cs/workbench/services/assessment/common/measurement";
import type { RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import type { RawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type { ColumnSemanticCandidate } from "src/cs/workbench/services/assessment/common/semanticCandidate";

export type RawTableFacts = {
  readonly structure: RawTableStructure;
  readonly columnProfiles: readonly ColumnProfile[];
  readonly layoutCandidates: readonly LayoutCandidate[];
  readonly semanticCandidates: readonly ColumnSemanticCandidate[];
  readonly blocks: readonly MeasurementBlockRecord[];
  readonly sourceMetadata: RawTableFactsSourceMetadata;
};

export type RawTableFactsSourceMetadata = {
  readonly fileId: string;
  readonly rawTableId: string;
  readonly fileName?: string | null;
  readonly rowCount?: number;
  readonly columnCount?: number;
  readonly sourceRawTableVersion: number;
};

export const createRawTableFactsFromAssessmentRecord = (
  record: RawTableAssessmentRecord,
  sourceMetadata?: Partial<RawTableFactsSourceMetadata>,
): RawTableFacts => ({
  structure: record.structure,
  columnProfiles: record.columnProfiles,
  layoutCandidates: record.layoutCandidates,
  semanticCandidates: record.semanticCandidates,
  blocks: record.blocks,
  sourceMetadata: {
    fileId: record.fileId,
    rawTableId: record.rawTableId,
    sourceRawTableVersion: record.sourceRawTableVersion,
    ...sourceMetadata,
  },
});
