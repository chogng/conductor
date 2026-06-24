/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { RawTableFactsRecord } from "src/cs/workbench/services/template/common/tableFacts";
import {
  createRawTableFactsFromRecord,
  type RawTableFacts,
  type RawTableFactsSourceMetadata,
} from "src/cs/workbench/services/template/common/tableFacts";

export const createRawTableFactsFromLegacyTableFacts = (
  record: RawTableFactsRecord,
  sourceMetadata?: Partial<RawTableFactsSourceMetadata>,
): RawTableFacts =>
  createRawTableFactsFromRecord(record, sourceMetadata);
