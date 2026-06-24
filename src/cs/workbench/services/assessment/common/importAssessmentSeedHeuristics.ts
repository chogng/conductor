/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	createFastImportBadgeTableFacts,
	createImportTableFactsSeedHeuristic,
	extractImportTableFactsSeedMetadata,
	type FastImportBadgeTableFacts,
	type ImportTableFactsSeedHeuristic,
	type ImportTableFactsSeedHeuristicConfidence,
	type ImportTableFactsSeedHeuristicMetadata,
	type ImportTableFactsSeedHeuristicSource,
} from "src/cs/workbench/services/tableFacts/common/importTableFactsSeedHeuristics";

export * from "src/cs/workbench/services/tableFacts/common/importTableFactsSeedHeuristics";

export type ImportAssessmentSeedConfidence = ImportTableFactsSeedHeuristicConfidence;
export type ImportAssessmentSeedSource = ImportTableFactsSeedHeuristicSource;
export type ImportAssessmentSeedMetadata = ImportTableFactsSeedHeuristicMetadata;
export type ImportAssessmentSeed = ImportTableFactsSeedHeuristic;
export type FastImportBadgeAssessment = FastImportBadgeTableFacts;

export const extractImportAssessmentSeedMetadata = extractImportTableFactsSeedMetadata;
export const createFastImportBadgeAssessment = createFastImportBadgeTableFacts;
export const createImportAssessmentSeed = createImportTableFactsSeedHeuristic;
