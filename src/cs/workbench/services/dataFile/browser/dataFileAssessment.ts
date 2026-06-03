import Papa from "papaparse";
import {
  assessFile,
  extractFileMetadata,
} from "../../../common/fileAssessment.ts";
import type { DataFileAssessment } from "../common/dataFile.ts";

const DATA_FILE_ASSESSMENT_PREVIEW_BYTES = 128 * 1024;
const DATA_FILE_ASSESSMENT_PREVIEW_ROWS = 256;

export const assessDataFile = async (
  file: File,
): Promise<DataFileAssessment> => {
  const previewText = await file
    .slice(0, DATA_FILE_ASSESSMENT_PREVIEW_BYTES)
    .text();
  const parsed = Papa.parse(previewText, {
    preview: DATA_FILE_ASSESSMENT_PREVIEW_ROWS,
    skipEmptyLines: false,
  });
  const rows = Array.isArray(parsed.data)
    ? (parsed.data as Array<Array<unknown>>)
    : [];
  const metadata = extractFileMetadata(rows);
  const assessment = assessFile({
    fileName: file?.name,
    metadata,
  });

  return {
    curveType: assessment.curveTypeLabel ?? null,
    curveTypeConfidence: assessment.confidence,
    curveTypeNeedsTemplate: assessment.needsTemplate,
    curveTypeReasons: assessment.reasons,
    xAxisRole: assessment.xAxisRole,
    xAxisRoleSource: assessment.xAxisRoleSource,
  };
};
