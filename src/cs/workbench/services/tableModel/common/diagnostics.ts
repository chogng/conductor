/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type TableModelDiagnosticSeverity = "info" | "warning" | "error";

export type TableModelSourceRange = {
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
};

export type TableModelDiagnostic = {
  readonly severity: TableModelDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly sourceRange?: TableModelSourceRange;
  readonly relatedBlockId?: string;
  readonly relatedGroupId?: string;
};

export const createTableModelReasonDiagnosticCodes = (
  reasons: readonly string[],
): readonly string[] =>
  reasons.map((_, index) => `tableModel.reason.${index + 1}`);

export const createTableModelReasonDiagnostics = ({
  reasons,
  relatedBlockId,
}: {
  readonly reasons: readonly string[];
  readonly relatedBlockId?: string;
}): readonly TableModelDiagnostic[] => {
  const diagnosticCodes = createTableModelReasonDiagnosticCodes(reasons);
  return reasons.map((reason, index) => ({
    severity: "info",
    code: diagnosticCodes[index] ?? `tableModel.reason.${index + 1}`,
    message: reason,
    relatedBlockId,
  }));
};
