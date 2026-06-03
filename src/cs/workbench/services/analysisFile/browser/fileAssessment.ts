import Papa from "papaparse";
import type { AnalysisFileAssessment } from "../common/analysisFile.ts";
import { assessImportRowsWithWasm } from "./assessmentWasm.ts";

const FILE_ASSESSMENT_PREVIEW_BYTES = 128 * 1024;
const FILE_ASSESSMENT_PREVIEW_ROWS = 256;

export const assessImportFile = async (
  file: File,
): Promise<AnalysisFileAssessment> => {
  const previewText = await file
    .slice(0, FILE_ASSESSMENT_PREVIEW_BYTES)
    .text();
  const parsed = Papa.parse(previewText, {
    preview: FILE_ASSESSMENT_PREVIEW_ROWS,
    skipEmptyLines: false,
  });
  const rows = Array.isArray(parsed.data)
    ? (parsed.data as Array<Array<unknown>>).map((row) =>
        row.map((value) => String(value ?? ""))
      )
    : [];
  return assessImportRowsWithWasm(file?.name ?? "", rows);
};
