/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";
import type {
  AssessmentFileInput,
  AssessmentRows,
  ImportFileAssessment,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
  assessFile,
  extractFileMetadata,
} from "src/cs/workbench/services/assessment/common/fileAssessment";

const FILE_ASSESSMENT_PREVIEW_BYTES = 128 * 1024;
const FILE_ASSESSMENT_PREVIEW_ROWS = 256;

export const assessImportRows = async (
  fileName: string,
  rows: AssessmentRows,
): Promise<ImportFileAssessment> => {
  const assessment = assessFile({
    fileName,
    metadata: extractFileMetadata(rows.map(row => [...row])),
  });
  return {
    curveType: assessment.curveTypeLabel,
    curveTypeConfidence: assessment.confidence,
    curveTypeNeedsTemplate: assessment.needsTemplate,
    curveTypeReasons: assessment.reasons,
    xAxisRole: assessment.xAxisRole,
    xAxisRoleSource: assessment.xAxisRoleSource,
  };
};

export const assessImportFile = async (
  file: AssessmentFileInput,
): Promise<ImportFileAssessment> => {
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
  return assessImportRows(file?.name ?? "", rows);
};
