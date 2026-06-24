/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	createTableFactsReasonDiagnosticCodes,
	createTableFactsReasonDiagnostics,
} from "src/cs/workbench/services/tableFacts/common/diagnostics";
import type {
	TableFactsDiagnostic,
	TableFactsDiagnosticSeverity,
	TableFactsSourceRange,
} from "src/cs/workbench/services/tableFacts/common/diagnostics";

export {
	createTableFactsReasonDiagnosticCodes,
	createTableFactsReasonDiagnostics,
};
export type {
	TableFactsDiagnostic,
	TableFactsDiagnosticSeverity,
	TableFactsSourceRange,
};

export type AssessmentDiagnosticSeverity = TableFactsDiagnosticSeverity;
export type AssessmentSourceRange = TableFactsSourceRange;
export type AssessmentDiagnostic = TableFactsDiagnostic;
export const createAssessmentReasonDiagnosticCodes = createTableFactsReasonDiagnosticCodes;
export const createAssessmentReasonDiagnostics = createTableFactsReasonDiagnostics;
