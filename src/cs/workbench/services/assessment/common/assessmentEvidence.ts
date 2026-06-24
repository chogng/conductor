/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export {
  createRawTableFactsFromAssessmentRecord as createAssessmentEvidenceFromRecord,
  createRawTableFactsFromAssessmentRecord as createRawTableEvidenceFromAssessmentRecord,
} from "src/cs/workbench/services/template/common/tableFacts";
export type {
  RawTableFacts as AssessmentEvidence,
  RawTableFacts as RawTableEvidence,
  RawTableFactsSourceMetadata as AssessmentSourceMetadata,
  RawTableFactsSourceMetadata as RawTableEvidenceSourceMetadata,
} from "src/cs/workbench/services/template/common/tableFacts";
