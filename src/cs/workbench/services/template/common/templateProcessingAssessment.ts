/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  ProcessedEntry,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";

export type TemplateProcessingAssessment = Pick<
  SessionFile,
  | "assessmentAutoApplyAllowed"
  | "assessmentBlocks"
  | "assessmentDecisionConfidence"
  | "assessmentDecisionReasons"
  | "assessmentDecisionState"
  | "curveType"
  | "curveTypeConfidence"
  | "curveTypeNeedsTemplate"
  | "curveTypeReasons"
  | "xAxisRole"
  | "xAxisRoleSource"
>;

const confidenceValues = new Set(["high", "medium", "low"]);
const axisRoleSourceValues = new Set(["filename", "title", "label", "metadata", "shape"]);
const assessmentDecisionStateValues = new Set(["ready", "inferred", "reviewRequired", "unknown", "failed"]);

export const createTemplateProcessingAssessment = (
  file: SessionFile,
): TemplateProcessingAssessment | null => normalizeTemplateProcessingAssessment(file);

export const normalizeTemplateProcessingAssessment = (
  value: unknown,
): TemplateProcessingAssessment | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const curveType = readText(value.curveType);
  const curveTypeConfidence = confidenceValues.has(String(value.curveTypeConfidence))
    ? value.curveTypeConfidence as TemplateProcessingAssessment["curveTypeConfidence"]
    : undefined;
  const curveTypeReasons = readStringArray(value.curveTypeReasons);
  const curveTypeNeedsTemplate = typeof value.curveTypeNeedsTemplate === "boolean"
    ? value.curveTypeNeedsTemplate
    : undefined;
  const assessmentAutoApplyAllowed = typeof value.assessmentAutoApplyAllowed === "boolean"
    ? value.assessmentAutoApplyAllowed
    : undefined;
  const assessmentBlocks = Array.isArray(value.assessmentBlocks)
    ? value.assessmentBlocks
    : undefined;
  const assessmentDecisionConfidence = readFiniteNumber(value.assessmentDecisionConfidence);
  const assessmentDecisionReasons = readStringArray(value.assessmentDecisionReasons);
  const assessmentDecisionState = assessmentDecisionStateValues.has(String(value.assessmentDecisionState))
    ? value.assessmentDecisionState as TemplateProcessingAssessment["assessmentDecisionState"]
    : undefined;
  const xAxisRole = value.xAxisRole === "vg" || value.xAxisRole === "vd"
    ? value.xAxisRole
    : null;
  const xAxisRoleSource = axisRoleSourceValues.has(String(value.xAxisRoleSource))
    ? value.xAxisRoleSource as NonNullable<TemplateProcessingAssessment["xAxisRoleSource"]>
    : null;

  if (
    !curveType &&
    !curveTypeConfidence &&
    !curveTypeReasons.length &&
    curveTypeNeedsTemplate === undefined &&
    assessmentAutoApplyAllowed === undefined &&
    assessmentBlocks === undefined &&
    assessmentDecisionConfidence === undefined &&
    !assessmentDecisionReasons.length &&
    assessmentDecisionState === undefined &&
    xAxisRole === null &&
    xAxisRoleSource === null
  ) {
    return null;
  }

  return {
    assessmentAutoApplyAllowed,
    assessmentBlocks,
    assessmentDecisionConfidence,
    assessmentDecisionReasons,
    assessmentDecisionState,
    curveType: curveType ?? null,
    curveTypeConfidence,
    curveTypeNeedsTemplate,
    curveTypeReasons,
    xAxisRole,
    xAxisRoleSource,
  };
};

export const mergeTemplateProcessingAssessment = (
  processed: ProcessedEntry,
  assessment: unknown,
): ProcessedEntry => {
  const normalized = normalizeTemplateProcessingAssessment(assessment);
  if (!normalized) {
    return processed;
  }

  return {
    ...processed,
    curveType: normalized.curveType ?? processed.curveType,
    curveTypeConfidence: normalized.curveTypeConfidence ?? processed.curveTypeConfidence,
    curveTypeNeedsTemplate:
      normalized.curveTypeNeedsTemplate ?? processed.curveTypeNeedsTemplate,
    curveTypeReasons: normalized.curveTypeReasons?.length
      ? [...normalized.curveTypeReasons]
      : processed.curveTypeReasons,
    supportsSs: normalized.xAxisRole === "vg"
      ? true
      : normalized.xAxisRole === "vd"
        ? false
        : processed.supportsSs,
    xAxisRole: normalized.xAxisRole ?? processed.xAxisRole,
    xAxisRoleSource: normalized.xAxisRoleSource ?? processed.xAxisRoleSource,
  };
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readText = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const readFiniteNumber = (value: unknown): number | undefined => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
};

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => readText(item))
    .filter((item): item is string => Boolean(item));
};
