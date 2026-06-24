/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { AssessmentEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { TemplateSnapshot } from "src/cs/workbench/services/template/common/template";
import type {
  Template,
  TemplateAxisBinding,
  TemplateRowRange,
} from "src/cs/workbench/services/template/common/templateSpec";
import type { TemplateCandidate } from "src/cs/workbench/services/templateResolution/common/templateResolution";

export const evaluateSavedTemplateCandidates = ({
  evidence,
  templateSnapshot,
}: {
  readonly evidence: AssessmentEvidence;
  readonly templateSnapshot: TemplateSnapshot;
}): readonly TemplateCandidate[] => {
  const candidates: TemplateCandidate[] = [];
  for (const template of templateSnapshot.templates) {
    const candidate = evaluateSavedTemplateCandidate({
      evidence,
      template,
      templateSnapshotVersion: templateSnapshot.version,
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates.sort((left, right) =>
    right.confidence - left.confidence ||
    left.id.localeCompare(right.id)
  );
};

const evaluateSavedTemplateCandidate = ({
  evidence,
  template,
  templateSnapshotVersion,
}: {
  readonly evidence: AssessmentEvidence;
  readonly template: Template;
  readonly templateSnapshotVersion: number;
}): TemplateCandidate | null => {
  const diagnostics = new Set<string>();
  const reasons: string[] = [];

  if (!template.blocks.length) {
    return null;
  }

  if (
    template.applicability?.schemaFingerprint &&
    template.applicability.schemaFingerprint !== evidence.structure.fingerprint
  ) {
    return null;
  }
  if (
    Number.isInteger(template.applicability?.columnCount) &&
    template.applicability?.columnCount !== evidence.sourceMetadata.columnCount
  ) {
    return null;
  }

  if (template.applicability?.schemaFingerprint) {
    reasons.push("savedTemplate.schemaFingerprint");
  }
  if (Number.isInteger(template.applicability?.columnCount)) {
    reasons.push("savedTemplate.columnCount");
  }
  const rowCount = evidence.sourceMetadata.rowCount;
  const columnCount = evidence.sourceMetadata.columnCount;
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
      diagnostics.add("savedTemplate.rowRangeOutOfBounds");
    }
    if (!isAxisInBounds(block.x, columnCount)) {
      diagnostics.add("savedTemplate.xAxisOutOfBounds");
    }
    if (!isAxisInBounds(block.y, columnCount)) {
      diagnostics.add("savedTemplate.yAxisOutOfBounds");
    }
  }

  const templateFingerprint = createTemplateFingerprint(template);
  const templateId = String(template.id ?? template.name ?? templateFingerprint).trim() ||
    templateFingerprint;
  return {
    id: `saved-template:${templateId}`,
    source: {
      kind: "savedTemplate",
      templateId,
      templateVersion: normalizeTemplateVersion(template.version, templateSnapshotVersion),
    },
    template,
    templateFingerprint,
    confidence: diagnostics.size ? 0.6 : getSavedTemplateConfidence(template),
    state: diagnostics.size ? "review" : "ready",
    reasons,
    diagnosticCodes: [...diagnostics],
  };
};

const getSavedTemplateConfidence = (
  template: Template,
): number => {
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

const normalizeTemplateVersion = (
  templateVersion: unknown,
  templateSnapshotVersion: number,
): number => {
  const version = Math.floor(Number(templateVersion));
  return Number.isInteger(version) && version > 0
    ? version
    : Math.max(1, Math.floor(Number(templateSnapshotVersion)) || 1);
};
