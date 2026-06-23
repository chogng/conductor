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

export const createAssessmentReasonDiagnosticCodes = (
  reasons: readonly string[],
): readonly string[] =>
  reasons.map((_, index) => `assessment.reason.${index + 1}`);

export const createAssessmentReasonDiagnostics = ({
  reasons,
  relatedBlockId,
}: {
  readonly reasons: readonly string[];
  readonly relatedBlockId?: string;
}): readonly AssessmentDiagnostic[] => {
  const diagnosticCodes = createAssessmentReasonDiagnosticCodes(reasons);
  return reasons.map((reason, index) => ({
    severity: "info",
    code: diagnosticCodes[index] ?? `assessment.reason.${index + 1}`,
    message: reason,
    relatedBlockId,
  }));
};
