/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	TABLE_FACTS_RULE_VERSION,
	type RawTableFactsRecord,
} from "src/cs/workbench/services/template/common/tableFacts";
import {
	IRawTableFactsQueueService,
	IRawTableFactsService,
	RawTableFactsContributionId,
	type CreateRawTableFactsInput,
	type ImportTableFactsSeed,
	type ImportTableFactsSeedAxisRole,
	type ImportTableFactsSeedAxisRoleSource,
	type RawTableFactsFileInput,
	type RawTableFactsQueuePriority,
	type RawTableFactsQueueSnapshot,
	type RawTableFactsRawTableQueueState,
	type RawTableFactsRows,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";

export {
	IRawTableFactsQueueService,
	IRawTableFactsService,
	RawTableFactsContributionId,
	getRawTableRefsForFileIds,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
export type {
	CreateRawTableFactsInput,
	ImportTableFactsSeed,
	ImportTableFactsSeedAxisRole,
	ImportTableFactsSeedAxisRoleSource,
	RawTableFactsFileInput,
	RawTableFactsQueuePriority,
	RawTableFactsQueueSnapshot,
	RawTableFactsRawTableQueueState,
	RawTableFactsRecord,
	RawTableFactsRows,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";

export const IAssessmentService = IRawTableFactsService;
export const IAssessmentQueueService = IRawTableFactsQueueService;
export const AssessmentContributionId = RawTableFactsContributionId;

export const ASSESSMENT_RULE_VERSION = TABLE_FACTS_RULE_VERSION;

export type AssessmentRows = RawTableFactsRows;
export type ImportAssessmentSeedAxisRole = ImportTableFactsSeedAxisRole;
export type ImportAssessmentSeedAxisRoleSource = ImportTableFactsSeedAxisRoleSource;
export type ImportAssessmentSeed = ImportTableFactsSeed;
export type AssessmentFileInput = RawTableFactsFileInput;
export type AssessRawTableInput = CreateRawTableFactsInput;
export type RawTableAssessmentRecord = RawTableFactsRecord;
export type IAssessmentService = IRawTableFactsService;
export type AssessmentQueuePriority = RawTableFactsQueuePriority;
export type AssessmentRawTableQueueState = RawTableFactsRawTableQueueState;
export type AssessmentQueueSnapshot = RawTableFactsQueueSnapshot;
export type IAssessmentQueueService = IRawTableFactsQueueService;
