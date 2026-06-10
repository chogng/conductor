/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type AssessmentDiagnosticSeverity = "info" | "warning" | "error";

export type AssessmentSourceRange = {
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
};

export type AssessmentDiagnostic = {
  readonly severity: AssessmentDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly sourceRange?: AssessmentSourceRange;
  readonly relatedBlockId?: string;
  readonly relatedGroupId?: string;
};
