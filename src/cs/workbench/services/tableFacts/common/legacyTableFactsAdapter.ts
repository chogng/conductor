/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { RawTableFactsRecord } from "src/cs/workbench/services/tableFacts/common/tableFacts";
import {
  createRawTableFactsFromRecord,
  type RawTableFacts,
  type RawTableFactsSourceMetadata,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";

export const createRawTableFactsFromLegacyTableFacts = (
  record: RawTableFactsRecord,
  sourceMetadata?: Partial<RawTableFactsSourceMetadata>,
): RawTableFacts =>
  createRawTableFactsFromRecord(record, sourceMetadata);
