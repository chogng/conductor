/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  assessFile,
  extractFileMetadata,
} from "./fileAssessment.ts";
import type {
  AxisRole,
  CurveKind,
  FileAssessment,
  FileAssessmentConfidence,
  FileAssessmentSource,
} from "./fileAssessment.ts";
import {
  inferGenericPlan,
  inferStrippedChannelPlan,
} from "./autoTemplatePlanBuilders.ts";
import {
  findHeaderRowIndex,
  getNormalizedRow,
} from "./autoTemplateRows.ts";
import type {
  AutoExtractionResult,
  TemplateRows,
} from "./autoTemplateTypes.ts";

export type {
  AutoExtractionBlock,
  AutoExtractionPlan,
  AutoExtractionResult,
} from "./autoTemplateTypes.ts";
export { inferMetadataGroupShapeFromRows } from "./autoTemplateMetadata.ts";

// Public entry point for preview-time auto inference. Keep this thin so future
// layout rules can stay inside the dedicated helpers above.
export const inferAutoExtraction = ({
  assessment: assessmentInput,
  fileName,
  rows,
  totalRowCount,
}: {
  assessment?: unknown;
  fileName?: unknown;
  rows: TemplateRows;
  totalRowCount?: number | null;
}): AutoExtractionResult => {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) {
    return {
      message: `${String(fileName ?? "file")}: no rows available for auto extraction.`,
      ok: false,
      reasons: [],
    };
  }

  const headerRowIndex = findHeaderRowIndex(safeRows);
  const headers = getNormalizedRow(safeRows, headerRowIndex);
  const dataStartRowIndex = Math.min(headerRowIndex + 1, safeRows.length);
  const metadata = extractFileMetadata(safeRows);
  const assessment = normalizeAutoExtractionAssessment(assessmentInput) ??
    assessFile({
      fileName,
      metadata,
    });

  if (metadata.isStrippedChannelSweep) {
    return inferStrippedChannelPlan({
      assessment,
      dataStartRowIndex,
      fileName,
      headers,
      metadata,
      rows: safeRows,
      totalRowCount,
    });
  }

  return inferGenericPlan({
    assessment,
    dataStartRowIndex,
    fileName,
    headers,
    metadata,
    rows: safeRows,
    totalRowCount,
  });
};

export const createAutoTemplatePlan = inferAutoExtraction;

const normalizeAutoExtractionAssessment = (
  value: unknown,
): FileAssessment | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const xAxisRole = normalizeAxisRole(value.xAxisRole);
  const curveType = normalizeCurveKind(value.curveType, xAxisRole);
  if (curveType === "unknown" && !xAxisRole && !readStringArray(value.curveTypeReasons).length) {
    return null;
  }

  const confidence = normalizeConfidence(value.curveTypeConfidence);
  return {
    confidence,
    curveType,
    curveTypeLabel: buildCurveTypeLabel(curveType, xAxisRole),
    needsTemplate: typeof value.curveTypeNeedsTemplate === "boolean"
      ? value.curveTypeNeedsTemplate
      : confidence === "low",
    reasons: readStringArray(value.curveTypeReasons),
    xAxisRole,
    xAxisRoleSource: normalizeAxisRoleSource(value.xAxisRoleSource),
  };
};

const normalizeCurveKind = (
  value: unknown,
  xAxisRole: AxisRole | null,
): CurveKind => {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  switch (text) {
    case "transfer":
    case "output":
    case "cv":
    case "cf":
    case "pv":
      return text;
    case "iv":
      return xAxisRole === "vg"
        ? "transfer"
        : xAxisRole === "vd"
          ? "output"
          : "unknown";
    default:
      return "unknown";
  }
};

const normalizeAxisRole = (value: unknown): AxisRole | null =>
  value === "vg" || value === "vd" ? value : null;

const normalizeConfidence = (value: unknown): FileAssessmentConfidence =>
  value === "high" || value === "medium" || value === "low" ? value : "low";

const normalizeAxisRoleSource = (value: unknown): FileAssessmentSource =>
  value === "metadata" ||
  value === "filename" ||
  value === "title" ||
  value === "label" ||
  value === "shape"
    ? value
    : null;

const buildCurveTypeLabel = (
  curveType: CurveKind,
  xAxisRole: AxisRole | null,
): string | null => {
  if (curveType === "transfer") {
    return xAxisRole === "vg" ? "transfer (vg)" : "transfer";
  }
  if (curveType === "output") {
    return xAxisRole === "vd" ? "output (vd)" : "output";
  }
  return curveType;
};

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

