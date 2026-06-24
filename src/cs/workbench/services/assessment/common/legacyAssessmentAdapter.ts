/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import {
  createRawTableFactsFromAssessmentRecord,
  type RawTableFacts,
  type RawTableFactsSourceMetadata,
} from "src/cs/workbench/services/template/common/tableFacts";

export const createRawTableFactsFromLegacyAssessment = (
  record: RawTableAssessmentRecord,
  sourceMetadata?: Partial<RawTableFactsSourceMetadata>,
): RawTableFacts =>
  createRawTableFactsFromAssessmentRecord(record, sourceMetadata);

export const createRawTableEvidenceFromLegacyAssessment =
  createRawTableFactsFromLegacyAssessment;
