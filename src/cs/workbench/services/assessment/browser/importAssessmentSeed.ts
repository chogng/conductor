/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";
import type {
  AssessmentFileInput,
  AssessmentRows,
  ImportAssessmentSeed,
  ImportTableFactsSeed,
  RawTableFactsFileInput,
  RawTableFactsRows,
} from "src/cs/workbench/services/assessment/common/assessment";
import type {
  IvSweepMode,
  MeasurementFamily,
} from "src/cs/workbench/services/assessment/common/measurement";
import {
  createImportAssessmentSeed,
  extractImportAssessmentSeedMetadata,
  type CurveKind,
} from "src/cs/workbench/services/assessment/common/importAssessmentSeedHeuristics";

const FILE_ASSESSMENT_PREVIEW_BYTES = 128 * 1024;
const FILE_ASSESSMENT_PREVIEW_ROWS = 256;

export const createImportTableFactsSeedFromRows = async (
  fileName: string,
  rows: RawTableFactsRows,
): Promise<ImportTableFactsSeed> => {
  const assessment = createImportAssessmentSeed({
    fileName,
    metadata: extractImportAssessmentSeedMetadata(rows.map(row => [...row])),
  });
  return {
    curveFamily: getMeasurementFamily(assessment.curveType),
    curveType: assessment.curveTypeLabel,
    curveTypeConfidence: assessment.confidence,
    curveTypeNeedsReview: assessment.needsReview,
    curveTypeReasons: assessment.reasons,
    ivMode: getIvMode(assessment.curveType),
    xAxisRole: assessment.xAxisRole,
    xAxisRoleSource: assessment.xAxisRoleSource,
  };
};

export const createImportAssessmentSeedFromRows = (
  fileName: string,
  rows: AssessmentRows,
): Promise<ImportAssessmentSeed> => createImportTableFactsSeedFromRows(fileName, rows);

const getMeasurementFamily = (
  curveType: CurveKind,
): MeasurementFamily => {
  if (curveType === "transfer" || curveType === "output") {
    return "iv";
  }
  if (curveType === "cv" || curveType === "cf" || curveType === "pv") {
    return curveType;
  }
  return "unknown";
};

const getIvMode = (
  curveType: CurveKind,
): IvSweepMode | null => {
  if (curveType === "transfer" || curveType === "output") {
    return curveType;
  }
  return null;
};

export const createImportTableFactsSeedFromFile = async (
  file: RawTableFactsFileInput,
): Promise<ImportTableFactsSeed> => {
  const previewText = await file
    .slice(0, FILE_ASSESSMENT_PREVIEW_BYTES)
    .text();
  const parsed = Papa.parse(previewText, {
    preview: FILE_ASSESSMENT_PREVIEW_ROWS,
    skipEmptyLines: false,
  });
  const rows = Array.isArray(parsed.data)
    ? (parsed.data as Array<Array<unknown>>).map(row =>
        row.map(value => String(value ?? ""))
      )
    : [];
  return createImportTableFactsSeedFromRows(file?.name ?? "", rows);
};

export const createImportAssessmentSeedFromFile = (
  file: AssessmentFileInput,
): Promise<ImportAssessmentSeed> => createImportTableFactsSeedFromFile(file);
