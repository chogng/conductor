/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type TableFactsDiagnosticSeverity = "info" | "warning" | "error";

export type TableFactsSourceRange = {
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
};

export type TableFactsDiagnostic = {
  readonly severity: TableFactsDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly sourceRange?: TableFactsSourceRange;
  readonly relatedBlockId?: string;
  readonly relatedGroupId?: string;
};

export const createTableFactsReasonDiagnosticCodes = (
  reasons: readonly string[],
): readonly string[] =>
  reasons.map((_, index) => `assessment.reason.${index + 1}`);

export const createTableFactsReasonDiagnostics = ({
  reasons,
  relatedBlockId,
}: {
  readonly reasons: readonly string[];
  readonly relatedBlockId?: string;
}): readonly TableFactsDiagnostic[] => {
  const diagnosticCodes = createTableFactsReasonDiagnosticCodes(reasons);
  return reasons.map((reason, index) => ({
    severity: "info",
    code: diagnosticCodes[index] ?? `assessment.reason.${index + 1}`,
    message: reason,
    relatedBlockId,
  }));
};
