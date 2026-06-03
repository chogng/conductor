import Papa from "papaparse";
import {
  classifyCurve,
  extractCurveMetadata,
  type CurveClassification,
} from "../../../common/curveClassification.ts";
const IMPORT_CLASSIFICATION_PREVIEW_BYTES = 128 * 1024;
const IMPORT_CLASSIFICATION_PREVIEW_ROWS = 256;

export type ImportedCurveAssessment = {
  curveType: string | null;
  curveTypeConfidence: CurveClassification["confidence"];
  curveTypeNeedsTemplate: boolean;
  curveTypeReasons: string[];
  xAxisRole: CurveClassification["xAxisRole"];
  xAxisRoleSource: CurveClassification["xAxisRoleSource"];
};


export const assessImportedFile = async (
  file: File,
): Promise<ImportedCurveAssessment> => {
  const previewText = await file
    .slice(0, IMPORT_CLASSIFICATION_PREVIEW_BYTES)
    .text();
  const parsed = Papa.parse(previewText, {
    preview: IMPORT_CLASSIFICATION_PREVIEW_ROWS,
    skipEmptyLines: false,
  });
  const rows = Array.isArray(parsed.data)
    ? (parsed.data as Array<Array<unknown>>)
    : [];
  const metadata = extractCurveMetadata(rows);
  const classification = classifyCurve({
    fileName: file?.name,
    metadata,
  });

  return {
    curveType: classification.curveTypeLabel ?? null,
    curveTypeConfidence: classification.confidence,
    curveTypeNeedsTemplate: classification.needsTemplate,
    curveTypeReasons: classification.reasons,
    xAxisRole: classification.xAxisRole,
    xAxisRoleSource: classification.xAxisRoleSource,
  };
};
