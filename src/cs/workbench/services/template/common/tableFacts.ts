/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ColumnProfile } from "src/cs/workbench/services/tableFacts/common/columnProfile";
import type { TableFactsDiagnostic } from "src/cs/workbench/services/tableFacts/common/diagnostics";
import type { LayoutCandidate } from "src/cs/workbench/services/tableFacts/common/layoutCandidate";
import type {
  MeasurementBlockRecord,
  MeasurementGroupRecord,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import type { RawTableStructure } from "src/cs/workbench/services/tableFacts/common/rawTableStructure";
import type { ColumnSemanticCandidate } from "src/cs/workbench/services/tableFacts/common/semanticCandidate";

// Bump this when table-fact heuristics change in a way that should invalidate
// stored raw table fact records.
export const TABLE_FACTS_RULE_VERSION = 2;

export type RawTableFactsRecord = {
  // TODO(conductor-architecture): Persisted compatibility field.
  // Rename to tableFactsRuleVersion when the Session record key migration lands.
  readonly assessmentRuleVersion: number;
  readonly schemaProfileVersion: number;
  readonly fileId: string;
  readonly rawTableId: string;
  readonly sourceRawTableVersion: number;
  readonly structure: RawTableStructure;
  readonly columnProfiles: readonly ColumnProfile[];
  readonly layoutCandidates: readonly LayoutCandidate[];
  readonly semanticCandidates: readonly ColumnSemanticCandidate[];
  readonly groups: readonly MeasurementGroupRecord[];
  readonly blocks: readonly MeasurementBlockRecord[];
  readonly diagnostics: readonly TableFactsDiagnostic[];
  readonly createdAt: number;
};

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

export const createRawTableFactsFromRecord = (
  record: RawTableFactsRecord,
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

export const createRawTableFactsFromAssessmentRecord =
  createRawTableFactsFromRecord;
