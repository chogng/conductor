/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  TemplateAxisBinding,
  TemplateRowRange,
} from "src/cs/workbench/services/template/common/templateSpec";
import type {
  TemplateDraft,
  TemplateDraftDiagnostic,
} from "src/cs/workbench/services/template/common/templateDraft";
import type { TableModel } from "src/cs/workbench/services/tableModel/common/tableModel";
import type {
  UserTemplate,
  UserTemplateSnapshot,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

export const deriveUserTemplateDrafts = ({
  tableModel,
  userTemplateSnapshot,
}: {
  readonly tableModel: TableModel;
  readonly userTemplateSnapshot: UserTemplateSnapshot;
}): readonly TemplateDraft[] => {
  const drafts: TemplateDraft[] = [];
  for (const userTemplate of userTemplateSnapshot.templates) {
    const draft = deriveUserTemplateDraft({
      tableModel,
      userTemplate,
    });
    if (draft) {
      drafts.push(draft);
    }
  }

  return drafts.sort((left, right) =>
    right.derivationConfidence - left.derivationConfidence ||
    left.id.localeCompare(right.id)
  );
};

const deriveUserTemplateDraft = ({
  tableModel,
  userTemplate,
}: {
  readonly tableModel: TableModel;
  readonly userTemplate: UserTemplate;
}): TemplateDraft | null => {
  const diagnostics = new Set<string>();
  const reasons: string[] = [];
  const template = userTemplate.template;

  if (!template.blocks.length) {
    return null;
  }

  if (
    template.applicability?.schemaFingerprint &&
    template.applicability.schemaFingerprint !== tableModel.structure.fingerprint
  ) {
    return null;
  }
  if (
    Number.isInteger(template.applicability?.columnCount) &&
    template.applicability?.columnCount !== tableModel.sourceMetadata.columnCount
  ) {
    return null;
  }

  if (template.applicability?.schemaFingerprint) {
    reasons.push("userTemplate.schemaFingerprint");
  }
  if (Number.isInteger(template.applicability?.columnCount)) {
    reasons.push("userTemplate.columnCount");
  }
  const rowCount = tableModel.sourceMetadata.rowCount;
  const columnCount = tableModel.sourceMetadata.columnCount;
  if (
    typeof rowCount !== "number" ||
    typeof columnCount !== "number" ||
    !Number.isInteger(rowCount) ||
    !Number.isInteger(columnCount)
  ) {
    return null;
  }

  for (const block of template.blocks) {
    if (!isRowRangeInBounds(block.rowRange, rowCount)) {
      diagnostics.add("userTemplate.rowRangeOutOfBounds");
    }
    if (!isAxisInBounds(block.x, columnCount)) {
      diagnostics.add("userTemplate.xAxisOutOfBounds");
    }
    if (!isAxisInBounds(block.y, columnCount)) {
      diagnostics.add("userTemplate.yAxisOutOfBounds");
    }
  }

  return {
    id: `user-template:${userTemplate.id}`,
    source: {
      kind: "userTemplate",
      templateId: userTemplate.id,
      templateVersion: userTemplate.version,
    },
    template,
    templateFingerprint: userTemplate.templateFingerprint,
    derivationConfidence: diagnostics.size ? 0.6 : getUserTemplateConfidence(userTemplate),
    derivationReasons: reasons,
    derivationDiagnostics: [...diagnostics].map(createTemplateDraftDiagnostic),
  };
};

const createTemplateDraftDiagnostic = (
  code: string,
): TemplateDraftDiagnostic => ({
  severity: "warning",
  code,
  message: code,
});

const getUserTemplateConfidence = (
  userTemplate: UserTemplate,
): number => {
  const { template } = userTemplate;
  if (template.applicability?.schemaFingerprint) {
    return 0.95;
  }
  if (Number.isInteger(template.applicability?.columnCount)) {
    return 0.75;
  }
  return 0.5;
};

const isRowRangeInBounds = (
  rowRange: TemplateRowRange,
  rowCount: number,
): boolean => {
  const startRow = Math.floor(Number(rowRange.startRow));
  const endRow = rowRange.endRow === "end"
    ? Math.max(0, rowCount - 1)
    : Math.floor(Number(rowRange.endRow));
  return Number.isInteger(startRow) &&
    Number.isInteger(endRow) &&
    startRow >= 0 &&
    startRow < rowCount &&
    endRow >= startRow &&
    endRow < rowCount;
};

const isAxisInBounds = (
  axis: TemplateAxisBinding,
  columnCount: number,
): boolean =>
  axis.columns.length > 0 &&
  axis.columns.every(column => isColumnInBounds(column, columnCount)) &&
  (axis.ranges ?? []).every(range =>
    isColumnInBounds(range.column, columnCount)
  );

const isColumnInBounds = (
  column: number,
  columnCount: number,
): boolean =>
  Number.isInteger(column) &&
  column >= 0 &&
  column < columnCount;
