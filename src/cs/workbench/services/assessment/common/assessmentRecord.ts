/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ImportTableFactsSeed,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import {
	createRawTableFactsRecordFromImportSeed,
	getTableFactsConfidenceScore,
	type CreateRawTableFactsRecordFromImportSeedInput,
} from "src/cs/workbench/services/tableFacts/common/tableFactsRecord";

export {
	createRawTableFactsRecordFromImportSeed,
	getColumnCount,
	normalizePositiveCount,
	normalizeSchemaProfileVersion,
} from "src/cs/workbench/services/tableFacts/common/tableFactsRecord";
export type {
	CreateRawTableFactsRecordFromImportSeedInput,
} from "src/cs/workbench/services/tableFacts/common/tableFactsRecord";

export type CreateRawTableAssessmentRecordInput =
	Omit<CreateRawTableFactsRecordFromImportSeedInput, "tableFactsSeed"> & {
		readonly assessment: ImportTableFactsSeed;
	};

export const createRawTableAssessmentRecordFromImportAssessment = (
	input: CreateRawTableAssessmentRecordInput,
) => createRawTableFactsRecordFromImportSeed({
	...input,
	tableFactsSeed: input.assessment,
});

export const getAssessmentConfidenceScore = getTableFactsConfidenceScore;
