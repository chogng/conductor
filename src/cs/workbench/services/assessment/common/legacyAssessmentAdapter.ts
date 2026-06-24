/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import {
  createRawTableEvidenceFromAssessmentRecord,
  type RawTableEvidence,
  type RawTableEvidenceSourceMetadata,
} from "src/cs/workbench/services/assessment/common/assessmentEvidence";

export const createRawTableEvidenceFromLegacyAssessment = (
  record: RawTableAssessmentRecord,
  sourceMetadata?: Partial<RawTableEvidenceSourceMetadata>,
): RawTableEvidence =>
  createRawTableEvidenceFromAssessmentRecord(record, sourceMetadata);
