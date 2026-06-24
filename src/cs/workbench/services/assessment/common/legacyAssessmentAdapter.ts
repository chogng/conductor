/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { RawTableFactsRecord } from "src/cs/workbench/services/template/common/tableFacts";
import {
  createRawTableFactsFromAssessmentRecord,
  type RawTableFacts,
  type RawTableFactsSourceMetadata,
} from "src/cs/workbench/services/template/common/tableFacts";

export const createRawTableFactsFromLegacyAssessment = (
  record: RawTableFactsRecord,
  sourceMetadata?: Partial<RawTableFactsSourceMetadata>,
): RawTableFacts =>
  createRawTableFactsFromAssessmentRecord(record, sourceMetadata);

export const createRawTableEvidenceFromLegacyAssessment =
  createRawTableFactsFromLegacyAssessment;
